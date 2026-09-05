export type AppMode = 'puzzles' | 'rush' | 'clock' | 'survival';

// Modos "de partida": tienen inicio, final y resultado. Comparten casi toda la
// UI (sin filtros, sin historial, sin ELO, tablero que se sustituye solo).
export const isRunModeId = (mode: AppMode): boolean =>
  mode === 'clock' || mode === 'survival';
