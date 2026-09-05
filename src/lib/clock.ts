import type { ClockAttempt, ClockRunSummary } from '../types/clock';

export const CLOCK_DURATIONS = [
  { id: '1min', label: '1 MIN', ms: 60_000 },
  { id: '3min', label: '3 MIN', ms: 180_000 },
  { id: '5min', label: '5 MIN', ms: 300_000 },
] as const;

export const DEFAULT_CLOCK_DURATION_MS = 180_000;

// Ritmo del contrarreloj. Los valores normales están pensados para estudiar una
// posición; aquí lo que se mide es velocidad, así que solo dejamos el tiempo
// justo para que el ojo registre qué pieza se ha movido.
export const CLOCK_TIMING = {
  firstMove: 450,      // movimiento inicial de la máquina (normal: 1000)
  machineReply: 250,   // respuesta entre jugadas (normal: 450)
  afterSolve: 600,     // pausa antes del siguiente puzle tras acertar (normal: 400)
  afterFail: 800,      // tras fallar: algo más largo, hay que ver el ❌ (normal: 750)
  pieceMove: 180,      // duración de la animación de la pieza
};

// --- ESCALERA DE DIFICULTAD ---
const START_MIN = 400;   // primer puzle: 400
const WINDOW    = 100;   // ancho de la ventana de rating
const BASE_STEP = 50;    // subida del primer acierto
const ACCEL     = 5;     // cuánto crece la subida en cada escalón
const MAX_MIN   = 2900;

// Progresión acelerada: subida = BASE_STEP + ACCEL * escalón.
// Acumulada = step*BASE + ACCEL*step*(step-1)/2.
// Lineal pura se queda corta: con +40 fijo, 20 aciertos solo te llevan a 900.
export const getLadderRange = (step: number): [number, number] => {
  const safeStep = Math.max(0, step);
  const climbed = safeStep * BASE_STEP + (ACCEL * safeStep * (safeStep - 1)) / 2;
  const min = Math.min(MAX_MIN, START_MIN + Math.round(climbed));
  return [min, Math.min(3000, min + WINDOW)];
};

export const formatCountdown = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export const buildRunSummary = (
  attempts: ClockAttempt[],
  durationMs: number,
  startedAt: number,
  endedAt: number,
): ClockRunSummary => {
  const solvedList = attempts.filter(a => a.success);
  const solved = solvedList.length;
  const total = attempts.length;

  const avgSolvedRating = solved > 0
    ? Math.round(solvedList.reduce((sum, a) => sum + a.rating, 0) / solved)
    : 0;

  const maxSolvedRating = solved > 0
    ? Math.max(...solvedList.map(a => a.rating))
    : 0;

  const avgSolveMs = solved > 0
    ? Math.round(solvedList.reduce((sum, a) => sum + a.solveMs, 0) / solved)
    : 0;

  return {
    durationMs,
    solved,
    failed: total - solved,
    attempts: total,
    accuracy: total > 0 ? solved / total : 0,
    avgSolvedRating,
    maxSolvedRating,
    avgSolveMs,
    startedAt,
    endedAt,
  };
};