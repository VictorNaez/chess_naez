import type { Chess, Square } from 'chess.js';

// =========================================================
// CASILLAS DESTINO LEGALES DE UNA PIEZA
// =========================================================
// Lo único que necesita el tablero al seleccionar una pieza (y al validar el
// segundo toque) es a qué casillas puede ir. Antes se sacaba de
// moves({ square, verbose: true }), y en chess.js 1.4 cada Move verbose calcula
// en su constructor el SAN (que regenera TODAS las jugadas legales de la
// posición para desambiguar) y las FEN before/after. Medido en Hermes sobre 400
// posiciones reales del catálogo: 3,7 ms por pieza, y se pagaba dos veces por
// jugada (selección + validación).
//
// moves({ square }) sin verbose devuelve solo los SAN, y el destino siempre es
// parte del SAN: las dos últimas letras tras quitar jaque/mate y coronación, o
// g/c en la fila del bando para los enroques. Mismo resultado (mismas casillas,
// mismo orden) con API pública.
//
// Caché de UNA entrada: el segundo toque pregunta exactamente lo mismo que el
// primero (misma FEN, misma casilla de origen), así que la validación sale gratis.
// La clave es la FEN y no el objeto Chess porque hay instancias que se mutan
// después de pasar por el estado (resetPuzzleState hace la jugada de la máquina
// sobre la misma instancia).

let cache: { fen: string; square: string; destinations: string[] } | null = null;

const destinationFromSan = (san: string, color: 'w' | 'b'): string => {
  const rank = color === 'w' ? '1' : '8';
  if (san.startsWith('O-O-O')) return `c${rank}`;
  if (san.startsWith('O-O')) return `g${rank}`;
  // Nbd7, exd8=Q+, Qxh7#  ->  d7, d8, h7
  return san.replace(/[+#]+$/, '').replace(/=[QRBN]$/, '').slice(-2);
};

export const getLegalDestinations = (game: Chess, square: string): string[] => {
  const fen = game.fen();
  if (cache !== null && cache.fen === fen && cache.square === square) {
    return cache.destinations;
  }

  const piece = game.get(square as Square);
  const destinations: string[] = [];
  if (piece) {
    for (const san of game.moves({ square: square as Square })) {
      const to = destinationFromSan(san, piece.color);
      // Una coronación son cuatro jugadas con el mismo destino.
      if (!destinations.includes(to)) destinations.push(to);
    }
  }

  cache = { fen, square, destinations };
  return destinations;
};
