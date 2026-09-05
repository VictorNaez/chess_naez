import * as SQLite from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getClockRanking, getClockRecords, saveClockRun, setupClockTables } from '../data/clockRuns';
import { buildRunSummary, DEFAULT_CLOCK_DURATION_MS, getLadderRange } from '../lib/clock';
import type { ClockAttempt, ClockPhase, ClockRanking, ClockRecords, ClockRunSummary } from '../types/clock';

export const useClockMode = (db: SQLite.SQLiteDatabase | null) => {
  const [phase, setPhase] = useState<ClockPhase>('idle');
  const [durationMs, setDurationMs] = useState(DEFAULT_CLOCK_DURATION_MS);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [ladderStep, setLadderStep] = useState(0);
  const [solved, setSolved] = useState(0);
  const [failed, setFailed] = useState(0);
  const [summary, setSummary] = useState<ClockRunSummary | null>(null);
  const [ranking, setRanking] = useState<ClockRanking | null>(null);
  const [records, setRecords] = useState<ClockRecords>({ bestAllTime: 0, bestThisWeek: 0, total: 0 });
  const [isStartVisible, setIsStartVisible] = useState(false);
  const [isResultVisible, setIsResultVisible] = useState(false);
  const [attempts, setAttempts] = useState<ClockAttempt[]>([]);

  // Refs paralelos al estado: registerResult y finishRun se llaman desde
  // callbacks asíncronos (executeMove, setTimeout) que no ven el estado fresco.
  const phaseRef = useRef<ClockPhase>('idle');
  const attemptsRef = useRef<ClockAttempt[]>([]);
  const stepRef = useRef(0);
  const startedAtRef = useRef(0);
  const endsAtRef = useRef(0);
  const durationRef = useRef(DEFAULT_CLOCK_DURATION_MS);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFinishingRef = useRef(false);

  const setPhaseSafe = useCallback((p: ClockPhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const clearDeadline = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  // --- Tablas + récords ---
  useEffect(() => {
    if (!db) return;
    (async () => {
      try {
        await setupClockTables(db);
        setRecords(await getClockRecords(db, durationRef.current));
      } catch (e) {
        console.error('Error inicializando clock_runs:', e);
      }
    })();
  }, [db]);

  const refreshRecords = useCallback(async (ms: number) => {
    if (!db) return;
    try { setRecords(await getClockRecords(db, ms)); } catch { /* noop */ }
  }, [db]);

  // =========================================================
  // FIN DE PARTIDA
  // =========================================================
  const finishRun = useCallback(async () => {
    if (phaseRef.current !== 'running' && phaseRef.current !== 'arming') return;
    if (isFinishingRef.current) return;
    isFinishingRef.current = true;

    clearDeadline();
    setPhaseSafe('finished');

    // Si el timeout llega tarde (app en segundo plano), el final real es endsAt
    const endedAt = endsAtRef.current > 0
      ? Math.min(Date.now(), endsAtRef.current)
      : Date.now();

    const runSummary = buildRunSummary(
      attemptsRef.current, durationRef.current, startedAtRef.current, endedAt,
    );
    setSummary(runSummary);
    setRanking(null);
    setIsResultVisible(true);

    if (db && runSummary.attempts > 0) {
      try {
        const id = await saveClockRun(db, runSummary);
        setRanking(await getClockRanking(db, runSummary.durationMs, id));
        setRecords(await getClockRecords(db, runSummary.durationMs));
      } catch (e) {
        console.error('Error guardando la partida de contrarreloj:', e);
      }
    }
    isFinishingRef.current = false;
  }, [db, setPhaseSafe]);

  // =========================================================
  // ARRANQUE
  // =========================================================
  // Fase 1: preparamos la partida pero NO arrancamos el reloj todavía.
  const armRun = useCallback((ms: number) => {
    clearDeadline();
    isFinishingRef.current = false;
    attemptsRef.current = [];
    setAttempts([]);
    stepRef.current = 0;
    startedAtRef.current = 0;
    endsAtRef.current = 0;
    durationRef.current = ms;

    setDurationMs(ms);
    setLadderStep(0);
    setSolved(0);
    setFailed(0);
    setEndsAt(null);
    setSummary(null);
    setRanking(null);
    setIsStartVisible(false);
    setIsResultVisible(false);
    setPhaseSafe('arming');
    refreshRecords(ms);

    return getLadderRange(0);
  }, [refreshRecords, setPhaseSafe, attempts]);

  // Fase 2: el primer puzle ya es jugable -> empieza a contar de verdad
  const beginCountdown = useCallback(() => {
    if (phaseRef.current !== 'arming') return;
    const now = Date.now();
    startedAtRef.current = now;
    endsAtRef.current = now + durationRef.current;
    setEndsAt(endsAtRef.current);
    setPhaseSafe('running');
    clearDeadline();
    timeoutRef.current = setTimeout(() => finishRun(), durationRef.current);
  }, [finishRun, setPhaseSafe]);

  // =========================================================
  // RESULTADO DE UN PUZLE
  // =========================================================
  // Devuelve el rango del SIGUIENTE puzle. Acierto -> sube escalón.
  // Fallo -> se queda donde está (pero cambia de puzle).
  const registerResult = useCallback((
    success: boolean, puzzleId: string, rating: number, solveMs: number,
  ): { nextRange: [number, number]; timeUp: boolean } => {
    const timeUp = phaseRef.current !== 'running' || Date.now() >= endsAtRef.current;

    if (!timeUp) {
      attemptsRef.current = [...attemptsRef.current, { puzzleId, rating, success, solveMs }];
      setAttempts(attemptsRef.current);   // <-- nuevo
      if (success) {
        stepRef.current += 1;
        setSolved(s => s + 1);
        setLadderStep(stepRef.current);
      } else {
        setFailed(f => f + 1);
      }
    }

    return { nextRange: getLadderRange(stepRef.current), timeUp };
  }, []);

  // =========================================================
  // CONTROL EXTERNO
  // =========================================================
  const openStart = useCallback(() => {
    setIsStartVisible(true);
    refreshRecords(durationRef.current);
  }, [refreshRecords]);

  const closeStart = useCallback(() => setIsStartVisible(false), []);
  const closeResult = useCallback(() => setIsResultVisible(false), []);

  // Abandonar sin guardar (salir del modo a media partida)
  const abortRun = useCallback(() => {
    clearDeadline();
    isFinishingRef.current = false;
    attemptsRef.current = [];
    setAttempts([]);
    stepRef.current = 0;
    endsAtRef.current = 0;
    setPhaseSafe('idle');
    setEndsAt(null);
    setSolved(0);
    setFailed(0);
    setLadderStep(0);
    setSummary(null);
    setRanking(null);
    setIsStartVisible(false);
    setIsResultVisible(false);
  }, [setPhaseSafe, attempts]);

  // El setTimeout se estrangula en segundo plano: al volver comprobamos el reloj real
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active' && phaseRef.current === 'running' && Date.now() >= endsAtRef.current) {
        finishRun();
      }
    });
    return () => sub.remove();
  }, [finishRun]);

  useEffect(() => clearDeadline, []);

  return {
    phase, phaseRef, durationMs, endsAt, ladderStep, solved, failed, attempts,
    summary, ranking, records, refreshRecords,
    isStartVisible, isResultVisible,
    armRun, beginCountdown, registerResult, finishRun, abortRun,
    openStart, closeStart, closeResult,
  };
};