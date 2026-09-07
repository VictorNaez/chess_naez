export type AppMode = 'puzzles' | 'rush' | 'clock' | 'survival' | 'repaso';

// Modos "de partida": tienen inicio, final y resultado. Comparten casi toda la
// UI (sin filtros, sin historial, sin ELO, tablero que se sustituye solo).
//
// Repaso NO entra aquí a propósito: aunque tiene inicio y final, el tablero se
// comporta como en modo puzles (pie con solución/retry/análisis y avance
// manual), que es justo lo que quieres al estudiar un puzle que fallaste.
export const isRunModeId = (mode: AppMode): boolean =>
  mode === 'clock' || mode === 'survival';
