import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { AppState, Platform } from 'react-native';
import {
  deleteBackup, DriveAuthError, downloadBackup, ensureBackupFile, findBackup,
  uploadSnapshot, writeBackupMetadata, type RemoteBackup,
} from '../data/driveBackup';
import {
  applySnapshot, createSnapshot, discardTempFiles, EMPTY_SUMMARY, inspectSnapshot,
  InvalidSnapshotError, restoreUri, revisionOf, summarizeProgress, type ProgressSummary,
} from '../data/progressSnapshot';
import { openPuzzleDatabase } from '../data/puzzleDatabase';
import {
  classifyAuthError, getAccessToken, isCloudConfigured, refreshAccessToken,
  restoreSession, signInInteractive, signOutFromGoogle,
} from '../lib/googleAuth';

// =========================================================
// COPIA EN LA NUBE — ESTADO Y ACCIONES
// =========================================================
// La app sigue siendo offline-first: progress.db es la fuente de verdad y la
// nube un espejo OPCIONAL. Nada de lo que hay aquí bloquea el arranque, y si
// Drive no contesta, el jugador no se entera.
//
// El provider no recibe el handle de la base: openPuzzleDatabase() es un
// singleton de módulo y devuelve la misma conexión que usa la pantalla. Así la
// nube no obliga a pasar `db` por media docena de props.

export type CloudStatus = 'idle' | 'working';
export type CloudErrorKind =
  | 'auth' | 'network' | 'config' | 'playServices' | 'noBackup' | 'invalid' | 'unknown';

interface PersistedState {
  autoBackup: boolean;
  lastBackupAt: number;
  lastRevision: string;
}

const STORAGE_KEY = '@cloud_sync';
const DEFAULT_STATE: PersistedState = { autoBackup: true, lastBackupAt: 0, lastRevision: '' };

// Suelo entre copias automáticas. Sin él, entrar y salir de la app diez veces
// seguidas serían diez subidas.
const MIN_AUTO_INTERVAL_MS = 2 * 60 * 1000;

interface CloudSyncValue {
  available: boolean;               // la build trae client ID configurado
  isReady: boolean;                 // ya se ha comprobado si había sesión
  email: string | null;
  status: CloudStatus;
  error: CloudErrorKind | null;
  autoBackup: boolean;
  lastBackupAt: number;
  remote: RemoteBackup | null;
  localSummary: ProgressSummary;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  setAutoBackup: (value: boolean) => void;
  backupNow: () => Promise<boolean>;
  /** Descarga, verifica y sustituye el progreso. Al volver, HAY QUE rearrancar. */
  restoreFromCloud: () => Promise<boolean>;
  deleteRemote: () => Promise<boolean>;
  refresh: () => Promise<void>;
}

const CloudSyncContext = createContext<CloudSyncValue | null>(null);

export function CloudSyncProvider({ children }: { children: React.ReactNode }) {
  const available = isCloudConfigured();

  const [isReady, setIsReady] = useState(!available);
  const [email, setEmail] = useState<string | null>(null);
  const [status, setStatus] = useState<CloudStatus>('idle');
  const [error, setError] = useState<CloudErrorKind | null>(null);
  const [remote, setRemote] = useState<RemoteBackup | null>(null);
  const [localSummary, setLocalSummary] = useState<ProgressSummary>(EMPTY_SUMMARY);
  const [persisted, setPersisted] = useState<PersistedState>(DEFAULT_STATE);

  // El cerrojo real es la ref: dos pulsaciones seguidas leerían el mismo
  // `status` en 'idle' y las dos entrarían. Mismo patrón que el resetLock de
  // useUserProgress.
  const busyRef = useRef(false);
  const persistedRef = useRef(persisted);
  persistedRef.current = persisted;

  const savePersisted = useCallback((next: PersistedState) => {
    setPersisted(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  // ---------------------------------------------------------
  // Arranque: ajustes guardados + sesión silenciosa
  // ---------------------------------------------------------
  useEffect(() => {
    if (!available) return;
    let cancelled = false;

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw && !cancelled) setPersisted({ ...DEFAULT_STATE, ...JSON.parse(raw) });
      } catch { /* ajustes corruptos: valen los de fábrica */ }

      const user = await restoreSession();
      if (cancelled) return;
      setEmail(user?.user.email ?? null);
      setIsReady(true);
    })();

    return () => { cancelled = true; };
  }, [available]);

  // Un token por operación, con UN reintento si Google dice que caducó.
  const withToken = useCallback(async <T,>(fn: (token: string) => Promise<T>): Promise<T> => {
    const token = await getAccessToken();
    try {
      return await fn(token);
    } catch (err) {
      if (!(err instanceof DriveAuthError)) throw err;
      const fresh = await refreshAccessToken(token);
      return await fn(fresh);
    }
  }, []);

  const classify = useCallback((err: unknown): CloudErrorKind => {
    if (err instanceof InvalidSnapshotError) return 'invalid';
    if (err instanceof DriveAuthError) return 'auth';
    if (err instanceof Error && err.message.startsWith('network')) return 'network';
    if (err instanceof Error && err.message === 'no-backup') return 'noBackup';
    const auth = classifyAuthError(err);
    if (auth !== 'unknown') return auth;
    return 'unknown';
  }, []);

  const readLocalSummary = useCallback(async (): Promise<ProgressSummary> => {
    const db = await openPuzzleDatabase();
    const summary = await summarizeProgress(db);
    setLocalSummary(summary);
    return summary;
  }, []);

  const refresh = useCallback(async () => {
    if (!available) return;
    await readLocalSummary().catch(() => {});
    if (!email) { setRemote(null); return; }
    try {
      const found = await withToken(token => findBackup(token));
      setRemote(found);
    } catch (err) {
      setError(classify(err));
    }
  }, [available, email, readLocalSummary, withToken, classify]);

  useEffect(() => {
    if (isReady && email) void refresh();
    // Solo al entrar/salir la sesión: refresh() se rehace en cada render y
    // meterlo aquí dispararía una consulta a Drive por cada cambio de estado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, email]);

  // ---------------------------------------------------------
  // Acciones
  // ---------------------------------------------------------
  const signIn = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setStatus('working');
    setError(null);
    try {
      const user = await signInInteractive();
      setEmail(user?.user.email ?? null);
    } catch (err) {
      setError(classify(err));
    } finally {
      busyRef.current = false;
      setStatus('idle');
    }
  }, [classify]);

  const signOut = useCallback(async () => {
    await signOutFromGoogle();
    setEmail(null);
    setRemote(null);
    setError(null);
    await discardTempFiles();
  }, []);

  const runBackup = useCallback(async (): Promise<boolean> => {
    const db = await openPuzzleDatabase();
    const snapshot = await createSnapshot(db);
    setLocalSummary(snapshot.summary);

    const updated = await withToken(async token => {
      const fileId = await ensureBackupFile(token);
      await uploadSnapshot(token, fileId, snapshot.uri);
      return writeBackupMetadata(token, fileId, {
        elo: String(snapshot.summary.globalElo),
        attempts: String(snapshot.summary.attempts),
        solved: String(snapshot.summary.solved),
        puzzles: String(snapshot.summary.puzzles),
        savedAt: String(Date.now()),
        platform: Platform.OS,
        appVersion: String(Constants.expoConfig?.version ?? ''),
      });
    });

    setRemote(updated);
    savePersisted({
      ...persistedRef.current,
      lastBackupAt: Date.now(),
      lastRevision: revisionOf(snapshot.summary),
    });
    await discardTempFiles();
    return true;
  }, [withToken, savePersisted]);

  const backupNow = useCallback(async (): Promise<boolean> => {
    if (!email || busyRef.current) return false;
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
  }, [email, runBackup, classify]);

  const restoreFromCloud = useCallback(async (): Promise<boolean> => {
    if (!email || busyRef.current) return false;
    busyRef.current = true;
    setStatus('working');
    setError(null);
    const dest = restoreUri();
    try {
      await withToken(async token => {
        const file = await findBackup(token);
        if (!file) throw new Error('no-backup');
        await downloadBackup(token, file.id, dest);
      });

      // Verificar ANTES de tocar nada: una descarga truncada no puede llegar a
      // sustituir un progreso bueno.
      const summary = await inspectSnapshot(dest);
      await applySnapshot(dest);

      // El puzle en curso pertenece a la partida anterior: restaurarlo sobre el
      // progreso nuevo lo pondría a puntuar dos veces.
      await AsyncStorage.removeItem('@current_puzzle').catch(() => {});

      setLocalSummary(summary);
      savePersisted({ ...persistedRef.current, lastRevision: revisionOf(summary) });
      await discardTempFiles();
      return true;
    } catch (err) {
      setError(classify(err));
      await discardTempFiles();
      return false;
    } finally {
      busyRef.current = false;
      setStatus('idle');
    }
  }, [email, withToken, savePersisted, classify]);

  const deleteRemote = useCallback(async (): Promise<boolean> => {
    if (!email || busyRef.current) return false;
    busyRef.current = true;
    setStatus('working');
    setError(null);
    try {
      await withToken(async token => {
        const file = await findBackup(token);
        if (file) await deleteBackup(token, file.id);
      });
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
  }, [email, withToken, savePersisted, classify]);

  const setAutoBackup = useCallback((value: boolean) => {
    savePersisted({ ...persistedRef.current, autoBackup: value });
  }, [savePersisted]);

  // ---------------------------------------------------------
  // Copia automática al pasar a segundo plano
  // ---------------------------------------------------------
  // Ahí es donde el jugador acaba de puntuar sus puzles y donde la subida no le
  // roba ni un frame. Si no ha cambiado nada desde la última copia, no se sube:
  // el número de revisión sale del propio resumen, sin tocar el flujo del juego.
  useEffect(() => {
    if (!available || !email || !persisted.autoBackup) return;

    const sub = AppState.addEventListener('change', state => {
      if (state !== 'background') return;
      void (async () => {
        if (busyRef.current) return;
        try {
          const db = await openPuzzleDatabase();
          const summary = await summarizeProgress(db);
          const { lastRevision, lastBackupAt } = persistedRef.current;
          if (revisionOf(summary) === lastRevision) return;
          if (Date.now() - lastBackupAt < MIN_AUTO_INTERVAL_MS) return;

          busyRef.current = true;
          await runBackup();
        } catch {
          // Sin red, token caducado sin posibilidad de refresco... da igual: la
          // copia automática es "cuando se pueda", nunca un aviso al usuario.
        } finally {
          busyRef.current = false;
        }
      })();
    });

    return () => sub.remove();
  }, [available, email, persisted.autoBackup, runBackup]);

  const value = useMemo<CloudSyncValue>(() => ({
    available,
    isReady,
    email,
    status,
    error,
    autoBackup: persisted.autoBackup,
    lastBackupAt: persisted.lastBackupAt,
    remote,
    localSummary,
    signIn,
    signOut,
    setAutoBackup,
    backupNow,
    restoreFromCloud,
    deleteRemote,
    refresh,
  }), [
    available, isReady, email, status, error, persisted.autoBackup, persisted.lastBackupAt,
    remote, localSummary, signIn, signOut, setAutoBackup, backupNow, restoreFromCloud,
    deleteRemote, refresh,
  ]);

  return <CloudSyncContext.Provider value={value}>{children}</CloudSyncContext.Provider>;
}

export function useCloudSync(): CloudSyncValue {
  const ctx = useContext(CloudSyncContext);
  if (!ctx) throw new Error('useCloudSync debe usarse dentro de <CloudSyncProvider>');
  return ctx;
}
