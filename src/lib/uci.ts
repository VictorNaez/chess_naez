import { Chess, Square } from 'chess.js';

export const uciLineToSan = (fen: string, uciMoves: string[]): string[] => {
  const scratch = new Chess(fen);
  const sanMoves: string[] = [];

  for (const uci of uciMoves) {
    if (!uci || uci.length < 4) break;
    const from = uci.slice(0, 2) as Square;
    const to = uci.slice(2, 4) as Square;
    const promotion = uci.length === 5 ? uci[4] : 'q';

    try {
      const move = scratch.move({ from, to, promotion });
      if (!move) break;
      sanMoves.push(move.san);
    } catch {
      break;
    }
  }
  return sanMoves;
};

// Jugada UCI ('e7e8n') en el objeto que pide chess.js. La pieza de coronación
// sale de la PROPIA jugada: con 'q' a fuego (o con la pieza que eligió el
// jugador en su jugada anterior) las subcoronaciones del catálogo se
// convertían en damas y el puzle se desviaba de la solución.
export const uciToMove = (uci: string): { from: Square; to: Square; promotion: string } => ({
  from: uci.slice(0, 2) as Square,
  to: uci.slice(2, 4) as Square,
  promotion: uci.length > 4 ? uci[4] : 'q',
});
