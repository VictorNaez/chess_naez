import * as SQLite from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearFromRepaso,
  enqueueRepaso,
  getRepasoBatch,
  getRepasoStats,
  markRepasoFailed,
  markRepasoSkipped,
  setupRepasoTable,
} from '../data/repasoQueue';
import { REPASO_SESSION_LIMIT } from '../lib/repaso';
import type { Puzzle } from '../types/puzzle';
import {
  EMPTY_REPASO_STATS,
  type RepasoOrder,
  type RepasoPhase,
  type RepasoPosition,
  type RepasoReason,
  type RepasoStats,
  type RepasoSummary,
} from '../types/repaso';

/**
 * Cola de repaso: los puzles que fallaste (o en los que pediste ayuda) se
 * guardan solos y aquí los vuelves a ver hasta que los aciertes.
 *
 * Dos diferencias de diseño frente a useClockMode / useSurvivalMode:
 *
 *  1. NO es un modo "de partida". No hay reloj, ni vidas, ni récords: el
 *     tablero se comporta igual que en modo puzles (pie con solución, retry,
 *     análisis) y avanzas tú con "Next". Por eso `registerResult` sólo anota;
 *     quien pide el siguiente puzle es `nextPuzzle`.
 *
 *  2. UNA PASADA POR SESIÓN. Al empezar se toma una foto de la cola y cada
 *     puzle aparece exactamente una vez. Si lo fallas se queda en la BD para la
 *     próxima sesión, pero no te lo vuelve a poner al momento: eso convertiría
 *     un repaso de 12 puzles en un bucle infinito de los 3 que no te salen.
 *
 * El repaso NO toca el ELO ni escribe en `elo_history`. Es deliberado: ya
 * pagaste el fallo la primera vez y aquí puedes acordarte de la solución, así
 * que sumaría ELO falso. Además mantiene el panel de estadísticas limpio: no
 * hay filas nuevas en elo_history que puedan descuadrar precisión ni rachas.
 */
export const useRepasoMode = (db: SQLite.SQLiteDatabase | null) => {
  const [phase, setPhase] = useState<RepasoPhase>('idle');
  const [stats, setStats] = useState<RepasoStats>(EMPTY_REPASO_STATS);
  const [position, setPosition] = useState<RepasoPosition>({ current: 0, total: 0 });
  const [summary, setSummary] = useState<RepasoSummary | null>(null);
  const [isStartVisible, setIsStartVisible] = useState(false);
  const [isResultVisible, setIsResultVisible] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);

  // Refs paralelos al estado: `registerResult` se llama desde executeMove, que
  // es async y no ve el estado fresco de React. Mismo patrón que survival.
  const phaseRef = useRef<RepasoPhase>('idle');
  const queueRef = useRef<Puzzle[]>([]);
  const cursorRef = useRef(-1);
  const currentRef = useRef<Puzzle | null>(null);
  // El puzle en pantalla ya se contabilizó. Evita que un Retry + acierto sume
  // dos veces, o que un fallo tras otro cuente doble.
  const resolvedRef = useRef(false);
  const tallyRef = useRef({ reviewed: 0, solved: 0, failed: 0, skipped: 0 });
  const startedAtRef = useRef(0);

  const setPhaseSafe = useCallback((p: RepasoPhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  // =========================================================
  // TABLA + CONTADOR
  // =========================================================
  const refreshStats = useCallback(async () => {
    if (!db) return EMPTY_REPASO_STATS;
    try {
      const s = await getRepasoStats(db);
      setStats(s);
      return s;
    } catch (e) {
      console.error('Error leyendo la cola de repaso:', e);
      return EMPTY_REPASO_STATS;
    }
  }, [db]);

  useEffect(() => {
    if (!db) return;
    (async () => {
      try {
        await setupRepasoTable(db);
        await refreshStats();
      } catch (e) {
        console.error('Error inicializando review_queue:', e);
      }
    })();
  }, [db, refreshStats]);

  // =========================================================
  // ALIMENTAR LA COLA (desde el modo puzles)
  // =========================================================
  // Fire-and-forget: quien llama está a mitad de un movimiento y no debe
  // esperar a SQLite. El contador se refresca solo después.
  const capture = useCallback(
    (reason: RepasoReason, puzzle: Puzzle | null) => {
      if (!db || !puzzle) return;
      enqueueRepaso(db, puzzle, reason)
        .then(refreshStats)
        .catch((e) => console.error('Error añadiendo el puzle a la cola de repaso:', e));
    },
    [db, refreshStats]
  );

  // =========================================================
  // MODALES
  // =========================================================
  const openStart = useCallback(() => {
    refreshStats();
    setIsStartVisible(true);
  }, [refreshStats]);

  const closeStart = useCallback(() => setIsStartVisible(false), []);
  const closeResult = useCallback(() => setIsResultVisible(false), []);

  // =========================================================
  // SESIÓN
  // =========================================================
  const resetSession = useCallback(() => {
    queueRef.current = [];
    cursorRef.current = -1;
    currentRef.current = null;
    resolvedRef.current = false;
    tallyRef.current = { reviewed: 0, solved: 0, failed: 0, skipped: 0 };
    setPosition({ current: 0, total: 0 });
  }, []);

  const serve = useCallback((puzzle: Puzzle | null, indexInQueue: number) => {
    currentRef.current = puzzle;
    resolvedRef.current = false;
    if (puzzle) tallyRef.current.reviewed += 1;
    setPosition({
      current: puzzle ? indexInQueue + 1 : queueRef.current.length,
      total: queueRef.current.length,
    });
  }, []);

  const finishSession = useCallback(() => {
    if (phaseRef.current !== 'running') return;
    setPhaseSafe('finished');
    currentRef.current = null;

    const t = tallyRef.current;
    setSummary({
      reviewed: t.reviewed,
      solved: t.solved,
      failed: t.failed,
      skipped: t.skipped,
      startedAt: startedAtRef.current,
      endedAt: Date.now(),
    });
    setIsResultVisible(true);
    // El "quedan N" del modal sale de `stats`, así que lo refrescamos tras
    // todos los DELETE/UPDATE de la sesión.
    refreshStats();
  }, [refreshStats, setPhaseSafe]);

  /** Arranca una sesión y devuelve el primer puzle (o null si la cola está vacía). */
  const startSession = useCallback(
    async (order: RepasoOrder): Promise<Puzzle | null> => {
      if (!db) return null;
      setIsPreparing(true);
      try {
        const batch = await getRepasoBatch(db, order, REPASO_SESSION_LIMIT);
        resetSession();

        if (batch.length === 0) {
          setPhaseSafe('idle');
          return null;
        }

        queueRef.current = batch;
        cursorRef.current = 0;
        startedAtRef.current = Date.now();
        setSummary(null);
        setIsResultVisible(false);
        setPhaseSafe('running');
        serve(batch[0], 0);
        return batch[0];
      } catch (e) {
        console.error('Error cargando la sesión de repaso:', e);
        setPhaseSafe('idle');
        return null;
      } finally {
        setIsPreparing(false);
      }
    },
    [db, resetSession, serve, setPhaseSafe]
  );

  /**
   * Anota el resultado del puzle en pantalla. NO avanza: en repaso quieres
   * quedarte a ver la solución y analizar antes de pasar al siguiente.
   */
  const registerResult = useCallback(
    (isSuccess: boolean, puzzleId: string) => {
      if (phaseRef.current !== 'running') return;

      const current = currentRef.current;
      // Resultado tardío (llega de un puzle que ya no está en pantalla) o
      // segundo intento del mismo: se ignora.
      if (!current || String(puzzleId) !== current.id) return;
      if (resolvedRef.current) return;
      resolvedRef.current = true;

      if (isSuccess) {
        tallyRef.current.solved += 1;
        if (db) {
          clearFromRepaso(db, current.id).catch((e) =>
            console.error('Error sacando el puzle de la cola de repaso:', e)
          );
        }
      } else {
        tallyRef.current.failed += 1;
        if (db) {
          markRepasoFailed(db, current.id).catch((e) =>
            console.error('Error actualizando el puzle de la cola de repaso:', e)
          );
        }
      }
    },
    [db]
  );

  /**
   * Siguiente puzle de la sesión. Devuelve null cuando se acaba la cola (y en
   * ese caso abre el modal de resultado).
   */
  const nextPuzzle = useCallback((): Puzzle | null => {
    if (phaseRef.current !== 'running') return null;

    // Pasar sin contestar cuenta como saltado: no es un fallo (no sube
    // fail_count) pero el puzle se queda en la cola.
    const current = currentRef.current;
    if (current && !resolvedRef.current) {
      tallyRef.current.skipped += 1;
      if (db) {
        markRepasoSkipped(db, current.id).catch((e) =>
          console.error('Error marcando el puzle como saltado:', e)
        );
      }
    }

    cursorRef.current += 1;
    const next = queueRef.current[cursorRef.current] ?? null;

    if (!next) {
      finishSession();
      return null;
    }

    serve(next, cursorRef.current);
    return next;
  }, [db, finishSession, serve]);

  /** Salir a mitad de sesión: no hay modal de resultado, sólo se limpia. */
  const abortSession = useCallback(() => {
    if (phaseRef.current === 'idle') return;
    setPhaseSafe('idle');
    resetSession();
    setSummary(null);
    setIsResultVisible(false);
    setIsStartVisible(false);
    refreshStats();
  }, [refreshStats, resetSession, setPhaseSafe]);

  return {
    phase,
    phaseRef,
    stats,
    position,
    summary,
    isStartVisible,
    isResultVisible,
    isPreparing,

    capture,
    refreshStats,
    openStart,
    closeStart,
    closeResult,
    startSession,
    registerResult,
    nextPuzzle,
    abortSession,
  };
};
