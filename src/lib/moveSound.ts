import { Chess, type Move } from 'chess.js';

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

// Sonido al DESHACER una jugada (flecha atrás). Lo que se ve es la pieza
// volviendo a su casilla de origen, que siempre estaba vacía: deshacer una
// captura no suena a captura (la pieza comida reaparece, no se come nada), ni
// deshacer un jaque o una promoción suena como tal. Solo el enroque se oye como
// enroque, porque se siguen moviendo dos piezas.
export const undoSoundFor = (move: Move): MoveSoundKey =>
  move.isKingsideCastle() || move.isQueensideCastle() ? 'castle' : 'move';

// Colocación + turno: basta para distinguir la jugada (una promoción a dama y a
// caballo dejan colocaciones distintas) y no depende de cómo cada FEN escriba
// enroques, al paso o relojes.
const placementAndTurn = (fen: string) => fen.split(' ').slice(0, 2).join(' ');

// Jugada legal que lleva de una FEN a la siguiente, para saber cómo suena al
// navegar por el historial. null si no están a una jugada de distancia o si
// alguna FEN no es válida (chess.js 1.x lanza en vez de devolver null).
export const moveBetweenFens = (fromFen: string, toFen: string): Move | null => {
  if (!fromFen || !toFen) return null;
  try {
    const target = placementAndTurn(toFen);
    return new Chess(fromFen).moves({ verbose: true })
      .find(m => placementAndTurn(m.after) === target) ?? null;
  } catch {
    return null;
  }
};
