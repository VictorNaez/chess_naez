// Supervivencia: X segundos por puzle, siempre los mismos, y 3 vidas.
// Pierdes una vida si fallas o si se te acaba el tiempo. La escalera de
// dificultad y los tiempos de animación son los mismos que en contrarreloj,
// así que se reutilizan tal cual desde lib/clock.
export { formatCountdown, getLadderRange, CLOCK_TIMING as RUN_TIMING } from './clock';

export const SURVIVAL_LIVES = 3;

// alertMs: cuándo suena el aviso de "se acaba el tiempo" (una sola vez por
// puzle). No es proporcional a propósito: con 15 s, avisar a 1/6 (2,5 s) no
// deja margen para reaccionar.
export const SURVIVAL_SPEEDS = [
  { id: '15s', label: '15 S', ms: 15_000, alertMs: 3_000 },
  { id: '30s', label: '30 S', ms: 30_000, alertMs: 5_000 },
  { id: '60s', label: '60 S', ms: 60_000, alertMs: 10_000 },
] as const;

export const DEFAULT_SURVIVAL_MS = 30_000;

// El aviso del cronómetro es proporcional: con 15 s por puzle, los umbrales
// fijos del contrarreloj (30 s / 10 s) dejarían el reloj siempre en rojo.
export const survivalWarnMs = (perPuzzleMs: number) => Math.round(perPuzzleMs * 0.5);
export const survivalDangerMs = (perPuzzleMs: number) => Math.round(perPuzzleMs * 0.25);

// Umbral del aviso sonoro para la velocidad elegida. Si algún día se añade una
// velocidad sin alertMs, cae a 1/6 del tiempo por puzle.
export const survivalAlertMs = (perPuzzleMs: number): number =>
  SURVIVAL_SPEEDS.find(s => s.ms === perPuzzleMs)?.alertMs ?? Math.round(perPuzzleMs / 6);
