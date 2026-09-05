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
    } catch (e) {
      break;
    }
  }
  return sanMoves;
};