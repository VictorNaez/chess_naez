import * as SQLite from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { AppState } from 'react-native';
import { buildRunSummary, getLadderRange } from '../lib/clock';
import { DEFAULT_SURVIVAL_MS, SURVIVAL_LIVES } from '../lib/survival';
import type { RunAttempt, RunPhase, RunRanking, RunRecords, RunSummary } from '../types/run';
import { getRunRanking, getRunRecords, saveRun, setupRunTables } from '../types/runs';

export interface SurvivalOutcome {
  nextRange: [number, number];
  gameOver: boolean;
  // El resultado llegó tarde (el puzle ya lo consumió el temporizador, o la
  // partida ya terminó). Quien llame debe ignorarlo por completo.
  ignored: boolean;
}

// Se dispara cuando a un puzle se le acaba el tiempo. La partida ya está
// actualizada (vida descontada, intento registrado); lo único que queda es que
// la pantalla reaccione: feedback y, si sigue viva, cargar el siguiente puzle.
type OnTimeout = (outcome: { nextRange: [number, number]; gameOver: boolean }) => void;

/**
 * Supervivencia: cada puzle dispone del mismo tiempo (perPuzzleMs) y arrancas
 * con 3 vidas. Fallar o quedarte sin tiempo cuesta una vida; a cero, se acabó.
 *
 * La diferencia real con useClockMode es dónde vive la cuenta atrás: allí hay un
 * único deadline para toda la partida, aquí hay uno por puzle que se rearma cada
 * vez. Entre puzles (animación de salida, consulta SQL, jugada de la máquina) no
 * hay deadline armado a propósito: ese rato no debe costar tiempo al jugador.
 */
export const useSurvivalMode = (
  db: SQLite.SQLiteDatabase | null,
  onTimeoutRef: MutableRefObject<OnTimeout>,
) => {
  const [phase, setPhase] = useState<RunPhase>('idle');
  const [perPuzzleMs, setPerPuzzleMs] = useState(DEFAULT_SURVIVAL_MS);
  const [puzzleEndsAt, setPuzzleEndsAt] = useState<number | null>(null);
  const [lives, setLives] = useState(SURVIVAL_LIVES);
  const [ladderStep, setLadderStep] = useState(0);
  const [solved, setSolved] = useState(0);
  const [failed, setFailed] = useState(0);
  const [attempts, setAttempts] = useState<RunAttempt[]>([]);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [ranking, setRanking] = useState<RunRanking | null>(null);
  const [records, setRecords] = useState<RunRecords>({ bestAllTime: 0, bestThisWeek: 0, total: 0 });
  const [isStartVisible, setIsStartVisible] = useState(false);
  const [isResultVisible, setIsResultVisible] = useState(false);

  // Refs paralelos al estado: registerResult y el temporizador se disparan desde
  // callbacks asíncronos (executeMove, setTimeout) que no ven el estado fresco.
  const phaseRef = useRef<RunPhase>('idle');
  const attemptsRef = useRef<RunAttempt[]>([]);
  const stepRef = useRef(0);
  const livesRef = useRef(SURVIVAL_LIVES);
  const startedAtRef = useRef(0);
  const perPuzzleRef = useRef(DEFAULT_SURVIVAL_MS);
  const puzzleEndsAtRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFinishingRef = useRef(false);

  // Puzle que tiene el reloj armado ahora mismo. En cuanto el temporizador o una
  // jugada lo consumen se pone a null, así que un movimiento que llegue tarde ya
  // no cuenta.
  //
  // `token` lo genera la pantalla y es único por PRESENTACIÓN de puzle, no por
  // id. Hace falta porque entre resolver un puzle y tener el siguiente en
  // pantalla pasan ~800 ms (pausa + deslizamiento + SQL + jugada de la máquina)
  // en los que `currentPuzzle` sigue siendo el viejo: sin el token, un re-render
  // en esa ventana rearmaría el reloj de un puzle ya contestado.
  const armedPuzzleRef = useRef<{ token: number; id: string; rating: number } | null>(null);
  const consumedTokenRef = useRef<number>(-1);

  const setPhaseSafe = useCallback((p: RunPhase) => {
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
        await setupRunTables(db);
        setRecords(await getRunRecords(db, 'survival', perPuzzleRef.current));
      } catch (e) {
        console.error('Error inicializando survival_runs:', e);
      }
    })();
  }, [db]);

  const refreshRecords = useCallback(async (ms: number) => {
    if (!db) return;
    try { setRecords(await getRunRecords(db, 'survival', ms)); } catch { /* noop */ }
  }, [db]);

  // =========================================================
  // FIN DE PARTIDA
  // =========================================================
  const finishRun = useCallback(async () => {
    if (phaseRef.current !== 'running' && phaseRef.current !== 'arming') return;
    if (isFinishingRef.current) return;
    isFinishingRef.current = true;

    clearDeadline();
    armedPuzzleRef.current = null;
    puzzleEndsAtRef.current = 0;
    setPuzzleEndsAt(null);
    setPhaseSafe('finished');

    const runSummary = buildRunSummary(
      attemptsRef.current, perPuzzleRef.current, startedAtRef.current, Date.now(),
    );
    setSummary(runSummary);
    setRanking(null);
    setIsResultVisible(true);

    if (db && runSummary.attempts > 0) {
      try {
        const id = await saveRun(db, 'survival', runSummary);
        setRanking(await getRunRanking(db, 'survival', runSummary.durationMs, id));
        setRecords(await getRunRecords(db, 'survival', runSummary.durationMs));
      } catch (e) {
        console.error('Error guardando la partida de supervivencia:', e);
      }
    }
    isFinishingRef.current = false;
  }, [db, setPhaseSafe]);

  // =========================================================
  // CONTABILIDAD DE UN FALLO (movimiento malo o tiempo agotado)
  // =========================================================
  // Un fallo NO baja de escalón: te quedas donde estás y cambias de puzle.
  // Lo que baja son las vidas.
  const registerFailure = useCallback((
    puzzleId: string, rating: number, solveMs: number, timedOut: boolean,
  ): { nextRange: [number, number]; gameOver: boolean } => {
    attemptsRef.current = [...attemptsRef.current, { puzzleId, rating, success: false, solveMs, timedOut }];
    setAttempts(attemptsRef.current);
    setFailed(f => f + 1);

    livesRef.current = Math.max(0, livesRef.current - 1);
    setLives(livesRef.current);

    return { nextRange: getLadderRange(stepRef.current), gameOver: livesRef.current <= 0 };
  }, []);

  // =========================================================
  // SE ACABÓ EL TIEMPO DE ESTE PUZLE
  // =========================================================
  const expirePuzzle = useCallback(() => {
    if (phaseRef.current !== 'running') return;
    const armed = armedPuzzleRef.current;
    if (!armed) return;

    clearDeadline();
    consumedTokenRef.current = armed.token;
    armedPuzzleRef.current = null;   // consumido: una jugada tardía ya no cuenta
    puzzleEndsAtRef.current = 0;
    setPuzzleEndsAt(null);

    const outcome = registerFailure(armed.id, armed.rating, perPuzzleRef.current, true);
    onTimeoutRef.current?.(outcome);
    if (outcome.gameOver) finishRun();
  }, [finishRun, registerFailure, onTimeoutRef]);

  // =========================================================
  // ARMAR EL RELOJ DE UN PUZLE
  // =========================================================
  const armDeadline = useCallback((token: number, puzzleId: string, rating: number) => {
    const now = Date.now();
    armedPuzzleRef.current = { token, id: puzzleId, rating };
    puzzleEndsAtRef.current = now + perPuzzleRef.current;
    setPuzzleEndsAt(puzzleEndsAtRef.current);
    clearDeadline();
    timeoutRef.current = setTimeout(() => expirePuzzle(), perPuzzleRef.current);
  }, [expirePuzzle]);

  // =========================================================
  // ARRANQUE
  // =========================================================
  // Fase 1: preparamos la partida pero NO arrancamos ningún reloj todavía.
  const armRun = useCallback((ms: number): [number, number] => {
    clearDeadline();
    isFinishingRef.current = false;
    attemptsRef.current = [];
    stepRef.current = 0;
    livesRef.current = SURVIVAL_LIVES;
    startedAtRef.current = 0;
    puzzleEndsAtRef.current = 0;
    perPuzzleRef.current = ms;
    armedPuzzleRef.current = null;
    consumedTokenRef.current = -1;

    setAttempts([]);
    setPerPuzzleMs(ms);
    setLives(SURVIVAL_LIVES);
    setLadderStep(0);
    setSolved(0);
    setFailed(0);
    setPuzzleEndsAt(null);
    setSummary(null);
    setRanking(null);
    setIsStartVisible(false);
    setIsResultVisible(false);
    setPhaseSafe('arming');
    refreshRecords(ms);

    return getLadderRange(0);
  }, [refreshRecords, setPhaseSafe]);

  // Fase 2: el primer puzle ya es jugable -> la partida empieza de verdad
  const beginRun = useCallback((token: number, puzzleId: string, rating: number) => {
    if (phaseRef.current !== 'arming') return;
    startedAtRef.current = Date.now();
    setPhaseSafe('running');
    armDeadline(token, puzzleId, rating);
  }, [armDeadline, setPhaseSafe]);

  // Cada puzle siguiente: mismo tiempo, reloj a cero. Idempotente por token: el
  // efecto que lo llama puede re-dispararse varias veces por el mismo puzle, y
  // un token ya consumido no se rearma nunca.
  const startPuzzleClock = useCallback((token: number, puzzleId: string, rating: number) => {
    if (phaseRef.current !== 'running') return;
    if (armedPuzzleRef.current?.token === token) return;
    if (consumedTokenRef.current === token) return;
    armDeadline(token, puzzleId, rating);
  }, [armDeadline]);

  // =========================================================
  // RESULTADO DE UN PUZLE
  // =========================================================
  const registerResult = useCallback((
    success: boolean, puzzleId: string, rating: number, solveMs: number,
  ): SurvivalOutcome => {
    const armed = armedPuzzleRef.current;
    const ignored = phaseRef.current !== 'running' || armed?.id !== puzzleId;

    if (ignored) {
      return { nextRange: getLadderRange(stepRef.current), gameOver: false, ignored: true };
    }

    clearDeadline();
    consumedTokenRef.current = armed.token;
    armedPuzzleRef.current = null;
    puzzleEndsAtRef.current = 0;
    setPuzzleEndsAt(null);

    if (success) {
      attemptsRef.current = [...attemptsRef.current, { puzzleId, rating, success: true, solveMs, timedOut: false }];
      setAttempts(attemptsRef.current);
      stepRef.current += 1;
      setSolved(s => s + 1);
      setLadderStep(stepRef.current);
      return { nextRange: getLadderRange(stepRef.current), gameOver: false, ignored: false };
    }

    const outcome = registerFailure(puzzleId, rating, solveMs, false);
    if (outcome.gameOver) finishRun();
    return { ...outcome, ignored: false };
  }, [finishRun, registerFailure]);

  // =========================================================
  // CONTROL EXTERNO
  // =========================================================
  const openStart = useCallback(() => {
    setIsStartVisible(true);
    refreshRecords(perPuzzleRef.current);
  }, [refreshRecords]);

  const closeStart = useCallback(() => setIsStartVisible(false), []);
  const closeResult = useCallback(() => setIsResultVisible(false), []);

  // Abandonar sin guardar (salir del modo a media partida)
  const abortRun = useCallback(() => {
    clearDeadline();
    isFinishingRef.current = false;
    attemptsRef.current = [];
    stepRef.current = 0;
    livesRef.current = SURVIVAL_LIVES;
    puzzleEndsAtRef.current = 0;
    armedPuzzleRef.current = null;
    consumedTokenRef.current = -1;

    setAttempts([]);
    setPhaseSafe('idle');
    setPuzzleEndsAt(null);
    setLives(SURVIVAL_LIVES);
    setSolved(0);
    setFailed(0);
    setLadderStep(0);
    setSummary(null);
    setRanking(null);
    setIsStartVisible(false);
    setIsResultVisible(false);
  }, [setPhaseSafe]);

  // El setTimeout se estrangula en segundo plano: al volver comprobamos el reloj real
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (
        state === 'active' &&
        phaseRef.current === 'running' &&
        puzzleEndsAtRef.current > 0 &&
        Date.now() >= puzzleEndsAtRef.current
      ) {
        expirePuzzle();
      }
    });
    return () => sub.remove();
  }, [expirePuzzle]);

  useEffect(() => clearDeadline, []);

  return {
    phase, phaseRef, perPuzzleMs, puzzleEndsAt, lives, maxLives: SURVIVAL_LIVES,
    ladderStep, solved, failed, attempts,
    summary, ranking, records, refreshRecords,
    isStartVisible, isResultVisible,
    armRun, beginRun, startPuzzleClock, registerResult, finishRun, abortRun,
    openStart, closeStart, closeResult,
  };
};
