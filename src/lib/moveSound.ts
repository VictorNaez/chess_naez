import type { Move } from 'chess.js';

export type MoveSoundKey = 'move' | 'capture' | 'check' | 'castle' | 'promote';

// ---------------------------------------------------------------------------
// Un solo sonido por jugada, elegido por lo más relevante que ha pasado:
//
//   promoción > jaque > enroque > captura > movimiento normal
//
// - La promoción gana a todo: es lo más raro y lo que más cambia la posición
//   (bxa8=Q+ suena a promoción, no a jaque ni a captura).
// - El jaque gana a la captura: en táctica, "da jaque" es lo que tienes que oír.
//   El mate también cuenta como jaque (en puzles lo tapa el sonido de éxito).
//
// Se usan los descriptores de chess.js 1.x y NO `'captured' in move`: la clase
// Move declara `captured` siempre (undefined si no hay captura), así que ese
// `in` devolvía true en todas las jugadas y todo sonaba a captura.
// ---------------------------------------------------------------------------
// isCapture() de chess.js solo mira el flag 'c': la captura al paso lleva 'e'
// y daría false.
export const isCaptureMove = (move: Move): boolean => move.isCapture() || move.isEnPassant();

export const moveSoundFor = (move: Move): MoveSoundKey => {
  if (move.isPromotion()) return 'promote';
  if (move.san.endsWith('+') || move.san.endsWith('#')) return 'check';
  if (move.isKingsideCastle() || move.isQueensideCastle()) return 'castle';
  if (isCaptureMove(move)) return 'capture';
  return 'move';
};
