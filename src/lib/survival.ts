// Supervivencia: X segundos por puzle, siempre los mismos, y 3 vidas.
// Pierdes una vida si fallas o si se te acaba el tiempo. La escalera de
// dificultad y los tiempos de animación son los mismos que en contrarreloj,
// así que se reutilizan tal cual desde lib/clock.
export { formatCountdown, getLadderRange, CLOCK_TIMING as RUN_TIMING } from './clock';

export const SURVIVAL_LIVES = 3;

export const SURVIVAL_SPEEDS = [
  { id: '15s', label: '15 S', ms: 15_000 },
  { id: '30s', label: '30 S', ms: 30_000 },
  { id: '60s', label: '60 S', ms: 60_000 },
] as const;

export const DEFAULT_SURVIVAL_MS = 30_000;

// El aviso del cronómetro es proporcional: con 15 s por puzle, los umbrales
// fijos del contrarreloj (30 s / 10 s) dejarían el reloj siempre en rojo.
export const survivalWarnMs = (perPuzzleMs: number) => Math.round(perPuzzleMs * 0.5);
export const survivalDangerMs = (perPuzzleMs: number) => Math.round(perPuzzleMs * 0.25);
