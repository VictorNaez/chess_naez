import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { AppState } from 'react-native';
import {
  CloudAuthError, CloudNetworkError, CloudTooBigError,
  type CloudIdentity, type CloudTransport, type RemoteInfo,
} from '../data/cloudTransport';
import { pgsTransport } from '../data/pgsTransport';
import {
  applySnapshot, createSnapshot, discardTempFiles, EMPTY_SUMMARY, inspectSnapshot,
  InvalidSnapshotError, restoreUri, revisionOf, summarizeProgress, type ProgressSummary,
} from '../data/progressSnapshot';
import { openPuzzleDatabase } from '../data/puzzleDatabase';
import { subscribeProgressDirty } from '../data/syncSignal';

// =========================================================
// COPIA EN LA NUBE — ESTADO Y ACCIONES
// =========================================================
// La app sigue siendo offline-first: progress.db es la fuente de verdad y la
// nube un espejo. Nada de lo que hay aquí bloquea el arranque ni el juego, y si
// Drive no contesta, el jugador no se entera.
//
// El provider no recibe el handle de la base: openPuzzleDatabase() es un
// singleton de módulo y devuelve la misma conexión que usa la pantalla.

export type CloudStatus = 'idle' | 'working';
export type CloudErrorKind =
  | 'auth' | 'network' | 'noBackup' | 'invalid' | 'tooBig' | 'unknown';
/** Qué propone el aviso automático del arranque, si es que propone algo. */
export type CloudPrompt = 'signIn' | 'restore';

interface PersistedState {
  autoBackup: boolean;
  lastBackupAt: number;
  lastRevision: string;
  promptDismissedAt: number;
  promptDismissCount: number;
}

const STORAGE_KEY = '@cloud_sync';
const DEFAULT_STATE: PersistedState = {
  autoBackup: true, lastBackupAt: 0, lastRevision: '',
  promptDismissedAt: 0, promptDismissCount: 0,
};

// --- Cuándo se sube ---------------------------------------------------------
// Subir en cada puzle resuelto sería una copia entera de la base cada veinte
// segundos: datos móviles, batería y cuota para nada. Se acumula y se suelta con
// lo primero que llegue: diez cambios, tres minutos sin subir, cambio de modo o
// app en segundo plano. En el peor caso (el sistema mata el proceso de golpe) se
// pierden unos pocos puzles, no una sesión.
const FLUSH_EVERY_CHANGES = 10;
const FLUSH_IDLE_MS = 3 * 60 * 1000;
// Suelo duro entre subidas. Si salta, los cambios NO se pierden: siguen
// pendientes y el temporizador vuelve a armarse.
const MIN_UPLOAD_GAP_MS = 60 * 1000;

// --- Cuándo se propone iniciar sesión ---------------------------------------
// Google exige un consentimiento explícito la primera vez, así que este único
// toque no hay forma de evitarlo. A partir de ahí todo es automático: la sesión
// se recupera sola en cada arranque y el jugador no vuelve a ver nada.
//
// Por eso se pregunta pronto, ya en el primer arranque: en una reinstalación el
// dispositivo está vacío, y sin sesión no hay forma de saber que existe una
// copia esperando. Si dice que no, se respeta y se reintenta como mucho dos
// veces más, con una semana de por medio.
const PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const PROMPT_MAX_TIMES = 3;

interface CloudSyncValue {
  available: boolean;               // hay transporte utilizable en este dispositivo
  isReady: boolean;                 // ya se ha comprobado si había sesión
  /** Jugador conectado: nombre y, si la tiene, foto de Play Games. */
  identity: CloudIdentity | null;
  status: CloudStatus;
  error: CloudErrorKind | null;
  autoBackup: boolean;
  lastBackupAt: number;
  remote: RemoteInfo | null;
  localSummary: ProgressSummary;
  /** Aviso no bloqueante que se pinta al abrir la app. */
  prompt: CloudPrompt | null;
  dismissPrompt: () => void;
  /**
   * Cambia cada vez que progress.db ha sido sustituido. Quien monta la base
   * tiene que reabrirla al verlo subir.
   */
  restoreToken: number;
  signIn: () => Promise<void>;
  setAutoBackup: (value: boolean) => void;
  backupNow: () => Promise<boolean>;
  restoreFromCloud: () => Promise<boolean>;
  deleteRemote: () => Promise<boolean>;
  refresh: () => Promise<void>;
  /** Sube lo pendiente si lo hay. La llaman los cortes naturales del juego. */
  requestFlush: () => void;
  /**
   * La pantalla ya tiene datos reales pintados. Hasta entonces no se restaura
   * nada: sustituir progress.db en mitad del arranque cerraría la conexión que
   * está cargando el primer puzle.
   */
  markAppReady: () => void;
}

const CloudSyncContext = createContext<CloudSyncValue | null>(null);

// Un único transporte. La lista se queda porque el arranque ya sabe recorrerla
// y probar el siguiente, que es lo que hizo indoloro el cambio desde Drive.
const TRANSPORTS: CloudTransport[] = [pgsTransport];

export function CloudSyncProvider({ children }: { children: React.ReactNode }) {
  const [transport, setTransport] = useState<CloudTransport | null>(null);
  const available = transport !== null;

  const [isReady, setIsReady] = useState(false);
  const [identity, setIdentity] = useState<CloudIdentity | null>(null);
  const account = identity?.name ?? null;
  const [status, setStatus] = useState<CloudStatus>('idle');
  const [error, setError] = useState<CloudErrorKind | null>(null);
  const [remote, setRemote] = useState<RemoteInfo | null>(null);
  const [localSummary, setLocalSummary] = useState<ProgressSummary>(EMPTY_SUMMARY);
  const [persisted, setPersisted] = useState<PersistedState>(DEFAULT_STATE);
  const [prompt, setPrompt] = useState<CloudPrompt | null>(null);
  const [restoreToken, setRestoreToken] = useState(0);
  const [appReady, setAppReady] = useState(false);

  // El cerrojo real es la ref: dos pulsaciones seguidas leerían el mismo
  // `status` en 'idle' y las dos entrarían. Mismo patrón que el resetLock de
  // useUserProgress.
  const busyRef = useRef(false);
  const persistedRef = useRef(persisted);
  persistedRef.current = persisted;
  const accountRef = useRef<string | null>(null);
  accountRef.current = account;
  const transportRef = useRef<CloudTransport | null>(null);
  transportRef.current = transport;
  const autoBackupRef = useRef(persisted.autoBackup);
  autoBackupRef.current = persisted.autoBackup;

  const pendingRef = useRef(0);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // La decisión del arranque se toma una vez por sesión: si el jugador cierra el
  // aviso, no puede reaparecer porque un refresco cualquiera vuelva a pasar.
  const bootDecisionRef = useRef(false);

  const markAppReady = useCallback(() => { setAppReady(true); }, []);

  const savePersisted = useCallback((next: PersistedState) => {
    setPersisted(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  // ---------------------------------------------------------
  // Arranque: ajustes guardados + sesión silenciosa
  // ---------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw && !cancelled) setPersisted({ ...DEFAULT_STATE, ...JSON.parse(raw) });
      } catch { /* ajustes corruptos: valen los de fábrica */ }

      // El primero que diga que sí. Con Play Games esto ya incluye el inicio de
      // sesión automático del SDK, así que la elección y la sesión salen de la
      // misma pasada.
      for (const candidate of TRANSPORTS) {
        if (cancelled) return;
        if (!(await candidate.isSupported().catch(() => false))) continue;
        setTransport(candidate);
        transportRef.current = candidate;
        const session = await candidate.restoreSession().catch(() => null);
        if (cancelled) return;
        setIdentity(session);
        break;
      }
      if (!cancelled) setIsReady(true);
    })();

    return () => { cancelled = true; };
  }, []);

  const classify = useCallback((err: unknown): CloudErrorKind => {
    if (err instanceof InvalidSnapshotError) return 'invalid';
    if (err instanceof CloudTooBigError) return 'tooBig';
    if (err instanceof CloudAuthError) return 'auth';
    if (err instanceof CloudNetworkError) return 'network';
    if (err instanceof Error && err.message.startsWith('network')) return 'network';
    if (err instanceof Error && err.message === 'no-backup') return 'noBackup';
    return 'unknown';
  }, []);

  const readLocalSummary = useCallback(async (): Promise<ProgressSummary> => {
    const db = await openPuzzleDatabase();
    const summary = await summarizeProgress(db);
    setLocalSummary(summary);
    return summary;
  }, []);

  // ---------------------------------------------------------
  // Copia
  // ---------------------------------------------------------
  const runBackup = useCallback(async (): Promise<boolean> => {
    const db = await openPuzzleDatabase();
    const snapshot = await createSnapshot(db);
    setLocalSummary(snapshot.summary);

    const active = transportRef.current;
    if (!active) return false;

    const updated = await active.upload(snapshot.uri, {
      savedAt: Date.now(),
      attempts: snapshot.summary.attempts,
      solved: snapshot.summary.solved,
      puzzles: snapshot.summary.puzzles,
      elo: snapshot.summary.globalElo,
    });

    setRemote(updated);
    savePersisted({
      ...persistedRef.current,
      lastBackupAt: Date.now(),
      lastRevision: revisionOf(snapshot.summary),
    });
    pendingRef.current = 0;
    await discardTempFiles();
    return true;
  }, [savePersisted]);

  const backupNow = useCallback(async (): Promise<boolean> => {
    if (!account || busyRef.current) return false;
    busyRef.current = true;
    setStatus('working');
    setError(null);
    try {
      return await runBackup();
    } catch (err) {
      setError(classify(err));
      return false;
    } finally {
      busyRef.current = false;
      setStatus('idle');
    }
  }, [account, runBackup, classify]);

  // ---------------------------------------------------------
  // Restauración
  // ---------------------------------------------------------
  // Sustituye progress.db y avisa subiendo restoreToken. NO reabre la base: de
  // eso se encarga quien la montó.
  const runRestore = useCallback(async (): Promise<boolean> => {
    const active = transportRef.current;
    if (!active) return false;

    const dest = restoreUri();
    await active.download(dest);

    // Verificar ANTES de tocar nada: una descarga truncada no puede llegar a
    // sustituir un progreso bueno.
    const summary = await inspectSnapshot(dest);
    await applySnapshot(dest);

    // El puzle en curso pertenece a la sesión anterior: dejarlo puesto sobre el
    // progreso nuevo lo pondría a puntuar dos veces.
    await AsyncStorage.removeItem('@current_puzzle').catch(() => {});

    setLocalSummary(summary);
    savePersisted({ ...persistedRef.current, lastRevision: revisionOf(summary) });
    pendingRef.current = 0;
    await discardTempFiles();
    setRestoreToken(value => value + 1);
    return true;
  }, [savePersisted]);

  const restoreFromCloud = useCallback(async (): Promise<boolean> => {
    if (!account || busyRef.current) return false;
    busyRef.current = true;
    setStatus('working');
    setError(null);
    try {
      return await runRestore();
    } catch (err) {
      setError(classify(err));
      await discardTempFiles();
      return false;
    } finally {
      busyRef.current = false;
      setStatus('idle');
    }
  }, [account, runRestore, classify]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!available) return;
    await readLocalSummary().catch(() => {});
    const active = transportRef.current;
    if (!account || !active) { setRemote(null); return; }
    try {
      setRemote(await active.find());
    } catch (err) {
      setError(classify(err));
    }
  }, [available, account, readLocalSummary, classify]);

  // ---------------------------------------------------------
  // Qué hacer al abrir la app
  // ---------------------------------------------------------
  // Una sola pasada por sesión, en cuanto hay sesión de Google y pantalla
  // pintada. La idea es que el jugador no tenga que decidir nada:
  //
  //   dispositivo vacío + copia en la cuenta -> restaurar; es una reinstalación
  //     o un móvil nuevo y no hay absolutamente nada que perder
  //   local por delante (ha jugado sin conexión) -> subir
  //   copia por delante y nada local sin subir -> restaurar; lo que hay aquí ya
  //     está a salvo en la nube, así que traerse lo del otro móvil no pierde nada
  //   los dos por delante -> ÚNICO caso que se pregunta: decidamos lo que
  //     decidamos, alguien pierde progreso, y esa no es una decisión nuestra
  useEffect(() => {
    if (!available || !isReady || !appReady || bootDecisionRef.current) return;
    bootDecisionRef.current = true;

    void (async () => {
      const local = await readLocalSummary().catch(() => EMPTY_SUMMARY);

      const active = transportRef.current;
      if (!account || !active) {
        const { promptDismissedAt, promptDismissCount } = persistedRef.current;
        const eligible =
          promptDismissCount < PROMPT_MAX_TIMES &&
          Date.now() - promptDismissedAt > PROMPT_COOLDOWN_MS;
        if (eligible) setPrompt('signIn');
        return;
      }

      let found: RemoteInfo | null = null;
      try {
        found = await active.find();
      } catch {
        // Sin red al arrancar no pasa nada: se juega igual y ya se subirá.
        return;
      }
      setRemote(found);

      const takeLock = () => {
        if (busyRef.current) return false;
        busyRef.current = true;
        setStatus('working');
        return true;
      };
      const releaseLock = () => {
        busyRef.current = false;
        setStatus('idle');
      };
      const runGuarded = async (action: () => Promise<boolean>) => {
        if (!takeLock()) return;
        try { await action(); }
        catch (err) { setError(classify(err)); }
        finally { releaseLock(); }
      };

      // Cuenta sin copia todavía: la primera la ponemos nosotros.
      if (!found) {
        if (local.attempts > 0) await runGuarded(runBackup);
        return;
      }

      // Dispositivo vacío: reinstalación o móvil nuevo.
      if (local.attempts === 0) {
        await runGuarded(runRestore);
        return;
      }

      // ¿Hay algo aquí que todavía no esté en la nube? La revisión guardada es
      // la de la última copia que subió ESTE dispositivo.
      const localPending = revisionOf(local) !== persistedRef.current.lastRevision;
      const remoteAhead =
        found.attempts > local.attempts &&
        found.savedAt > persistedRef.current.lastBackupAt;

      if (remoteAhead) {
        // Nada pendiente aquí: traerse lo del otro dispositivo no pisa nada.
        if (!localPending) await runGuarded(runRestore);
        else setPrompt('restore');
        return;
      }

      // Local por delante o empatado con cosas sin subir: copia y listo.
      if (localPending) await runGuarded(runBackup);
    })();
  }, [available, isReady, appReady, account, readLocalSummary, runBackup, runRestore, classify]);

  const dismissPrompt = useCallback(() => {
    // El contador solo sube con la propuesta de iniciar sesión: la de restaurar
    // depende de que haya una copia por delante, y esa situación se resuelve
    // sola en cuanto el jugador decide.
    setPrompt(current => {
      if (current === 'signIn') {
        savePersisted({
          ...persistedRef.current,
          promptDismissedAt: Date.now(),
          promptDismissCount: persistedRef.current.promptDismissCount + 1,
        });
      }
      return null;
    });
  }, [savePersisted]);

  // ---------------------------------------------------------
  // Sesión
  // ---------------------------------------------------------
  const signIn = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setStatus('working');
    setError(null);
    try {
      const active = transportRef.current;
      if (!active) return;
      const session = await active.signIn();
      if (session) {
        setPrompt(null);
        // Que el efecto de arranque vuelva a decidir con la sesión ya puesta:
        // subir lo que hay, o restaurar si este dispositivo está vacío.
        bootDecisionRef.current = false;
      }
      setIdentity(session);
    } catch (err) {
      setError(classify(err));
    } finally {
      busyRef.current = false;
      setStatus('idle');
    }
  }, [classify]);

  const deleteRemote = useCallback(async (): Promise<boolean> => {
    if (!account || busyRef.current) return false;
    busyRef.current = true;
    setStatus('working');
    setError(null);
    try {
      await transportRef.current?.remove();
      setRemote(null);
      savePersisted({ ...persistedRef.current, lastBackupAt: 0, lastRevision: '' });
      return true;
    } catch (err) {
      setError(classify(err));
      return false;
    } finally {
      busyRef.current = false;
      setStatus('idle');
    }
  }, [account, savePersisted, classify]);

  const setAutoBackup = useCallback((value: boolean) => {
    savePersisted({ ...persistedRef.current, autoBackup: value });
  }, [savePersisted]);

  // ---------------------------------------------------------
  // Subida por acumulación
  // ---------------------------------------------------------
  // `flush` se referencia desde temporizadores armados antes de que exista esta
  // versión del callback: la ref siempre apunta a la última.
  const flushRef = useRef<() => Promise<void>>(async () => {});

  const clearFlushTimer = useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  const armFlushTimer = useCallback((delay: number) => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      void flushRef.current();
    }, delay);
  }, []);

  const flush = useCallback(async (): Promise<void> => {
    if (!autoBackupRef.current || !accountRef.current) return;
    if (busyRef.current) return;

    const db = await openPuzzleDatabase().catch(() => null);
    if (!db) return;
    const summary = await summarizeProgress(db).catch(() => null);
    if (!summary) return;

    // Nada nuevo de verdad: subir otra vez lo mismo solo gasta datos.
    if (revisionOf(summary) === persistedRef.current.lastRevision) {
      pendingRef.current = 0;
      clearFlushTimer();
      return;
    }

    // Un progreso vacío NUNCA pisa una copia buena por su cuenta. Sin esto,
    // reiniciar el progreso desde Ajustes y mandar la app a segundo plano
    // subiría la base recién vaciada y se llevaría por delante la copia de la
    // cuenta, que es justo lo que otro dispositivo podría estar esperando. Para
    // vaciar la copia a propósito están el botón de guardar a mano y el de
    // eliminar la copia.
    if (summary.attempts === 0) {
      pendingRef.current = 0;
      clearFlushTimer();
      return;
    }

    if (Date.now() - persistedRef.current.lastBackupAt < MIN_UPLOAD_GAP_MS) {
      // Demasiado pronto: los cambios siguen pendientes y el temporizador vuelve
      // a armarse, así que no se pierde nada.
      armFlushTimer(MIN_UPLOAD_GAP_MS);
      return;
    }

    // Segunda comprobación: entre la primera y este punto hay awaits, y el
    // arranque puede haber cogido el cerrojo por el camino.
    if (busyRef.current) return;
    clearFlushTimer();
    busyRef.current = true;
    try {
      await runBackup();
    } catch {
      // La copia automática es "cuando se pueda": sin red, sin aviso. El error
      // rojo se reserva para lo que el usuario pide a mano.
    } finally {
      busyRef.current = false;
    }
  }, [runBackup, clearFlushTimer, armFlushTimer]);

  flushRef.current = flush;

  const requestFlush = useCallback(() => { void flushRef.current(); }, []);

  // Progreso nuevo: contar y decidir si toca subir ya o esperar.
  useEffect(() => {
    if (!available) return;
    const unsubscribe = subscribeProgressDirty(() => {
      if (!autoBackupRef.current || !accountRef.current) return;
      pendingRef.current += 1;

      if (pendingRef.current >= FLUSH_EVERY_CHANGES) {
        void flushRef.current();
        return;
      }
      armFlushTimer(FLUSH_IDLE_MS);
    });

    return () => { unsubscribe(); clearFlushTimer(); };
  }, [available, armFlushTimer, clearFlushTimer]);

  // Segundo plano: el mejor momento para subir, porque ahí la red no le roba un
  // frame a nadie. Al volver también se intenta, por si la subida anterior cayó
  // dentro del suelo entre copias y su temporizador no llegó a saltar con la app
  // dormida; si no hay nada nuevo, flush() se va por donde ha venido.
  useEffect(() => {
    if (!available) return;
    const sub = AppState.addEventListener('change', state => {
      if (state === 'background' || state === 'active') void flushRef.current();
    });
    return () => sub.remove();
  }, [available]);

  const value = useMemo<CloudSyncValue>(() => ({
    available,
    isReady,
    identity,
    status,
    error,
    autoBackup: persisted.autoBackup,
    lastBackupAt: persisted.lastBackupAt,
    remote,
    localSummary,
    prompt,
    dismissPrompt,
    restoreToken,
    signIn,
    setAutoBackup,
    backupNow,
    restoreFromCloud,
    deleteRemote,
    refresh,
    requestFlush,
    markAppReady,
  }), [
    available, isReady, identity, status, error, persisted.autoBackup, persisted.lastBackupAt,
    remote, localSummary, prompt, dismissPrompt, restoreToken, signIn, setAutoBackup,
    backupNow, restoreFromCloud, deleteRemote, refresh, requestFlush, markAppReady,
  ]);

  return <CloudSyncContext.Provider value={value}>{children}</CloudSyncContext.Provider>;
}

export function useCloudSync(): CloudSyncValue {
  const ctx = useContext(CloudSyncContext);
  if (!ctx) throw new Error('useCloudSync debe usarse dentro de <CloudSyncProvider>');
  return ctx;
}
