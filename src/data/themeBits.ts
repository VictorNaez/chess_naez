// GENERADO POR build_catalog.py - NO EDITAR A MANO.
// El indice del array es el bit que usa `puzzles.th_lo` / `th_hi`.

export const THEME_VOCAB = [
  'advancedPawn', 'advantage', 'anastasiaMate', 'arabianMate',
  'attackingF2F7', 'attraction', 'backRankMate', 'balestraMate',
  'bishopEndgame', 'blindSwineMate', 'bodenMate', 'capturingDefender',
  'castling', 'clearance', 'collinearMove', 'cornerMate',
  'crushing', 'defensiveMove', 'deflection', 'discoveredAttack',
  'discoveredCheck', 'doubleBishopMate', 'doubleCheck', 'dovetailMate',
  'enPassant', 'endgame', 'epauletteMate', 'equality',
  'exposedKing', 'fork', 'hangingPiece', 'hookMate',
  'interference', 'intermezzo', 'killBoxMate', 'kingsideAttack',
  'knightEndgame', 'long', 'master', 'masterVsMaster',
  'mate', 'mateIn1', 'mateIn2', 'mateIn3',
  'mateIn4', 'mateIn5', 'middlegame', 'morphysMate',
  'oneMove', 'opening', 'operaMate', 'pawnEndgame',
  'pillsburysMate', 'pin', 'promotion', 'queenEndgame',
  'queenRookEndgame', 'queensideAttack', 'quietMove', 'rookEndgame',
  'sacrifice', 'short', 'skewer', 'smotheredMate',
  'superGM', 'swallowstailMate', 'trappedPiece', 'triangleMate',
  'underPromotion', 'veryLong', 'vukovicMate', 'xRayAttack',
  'zugzwang',
] as const;

export type ThemeKey = (typeof THEME_VOCAB)[number];

export const THEME_BIT: Record<string, number> = Object.fromEntries(
  THEME_VOCAB.map((t, i) => [t, i]),
);

// Los operadores de bits de JS son de 32 BITS: `1 << 40` da 256, no 2**40.
// Por eso la mascara va en columnas de 31 bits y NUNCA en una de 63,
// aunque SQLite las soporte. El bit 31 haria negativo el entero.
export const BITS_PER_COL = 31;
export const THEME_COLS = 3;

/** Mascara de un conjunto de temas, una entrada por columna th0/th1/th2. */
export const themeMask = (keys: readonly string[]): number[] => {
  const cols = new Array<number>(THEME_COLS).fill(0);
  for (const k of keys) {
    const i = THEME_BIT[k];
    if (i === undefined) continue;
    cols[(i / BITS_PER_COL) | 0] |= 1 << (i % BITS_PER_COL);
  }
  return cols;
};

/** Nombres oficiales de Lichess. Solo se usan como respaldo cuando el
 *  diccionario del idioma activo todavia no cubre la clave. */
export const THEME_LABEL_EN: Record<string, string> = {
  'advancedPawn': "Advanced pawn",
  'advantage': "Advantage",
  'anastasiaMate': "Anastasia's mate",
  'arabianMate': "Arabian mate",
  'attackingF2F7': "Attacking f2 or f7",
  'attraction': "Attraction",
  'backRankMate': "Back rank mate",
  'balestraMate': "Balestra mate",
  'bishopEndgame': "Bishop endgame",
  'blindSwineMate': "Blind Swine mate",
  'bodenMate': "Boden's mate",
  'capturingDefender': "Capture the defender",
  'castling': "Castling",
  'clearance': "Clearance",
  'collinearMove': "Collinear move",
  'cornerMate': "Corner mate",
  'crushing': "Crushing",
  'defensiveMove': "Defensive move",
  'deflection': "Deflection",
  'discoveredAttack': "Discovered attack",
  'discoveredCheck': "Discovered check",
  'doubleBishopMate': "Double bishop mate",
  'doubleCheck': "Double check",
  'dovetailMate': "Dovetail mate",
  'enPassant': "En passant",
  'endgame': "Endgame",
  'epauletteMate': "Epaulette mate",
  'equality': "Equality",
  'exposedKing': "Exposed king",
  'fork': "Fork",
  'hangingPiece': "Hanging piece",
  'hookMate': "Hook mate",
  'interference': "Interference",
  'intermezzo': "Intermezzo",
  'killBoxMate': "Kill box mate",
  'kingsideAttack': "Kingside attack",
  'knightEndgame': "Knight endgame",
  'long': "Long puzzle",
  'master': "Master games",
  'masterVsMaster': "Master vs Master games",
  'mate': "Checkmate",
  'mateIn1': "Mate in 1",
  'mateIn2': "Mate in 2",
  'mateIn3': "Mate in 3",
  'mateIn4': "Mate in 4",
  'mateIn5': "Mate in 5 or more",
  'middlegame': "Middlegame",
  'morphysMate': "Morphy's mate",
  'oneMove': "One-move puzzle",
  'opening': "Opening",
  'operaMate': "Opera mate",
  'pawnEndgame': "Pawn endgame",
  'pillsburysMate': "Pillsbury's mate",
  'pin': "Pin",
  'promotion': "Promotion",
  'queenEndgame': "Queen endgame",
  'queenRookEndgame': "Queen and Rook",
  'queensideAttack': "Queenside attack",
  'quietMove': "Quiet move",
  'rookEndgame': "Rook endgame",
  'sacrifice': "Sacrifice",
  'short': "Short puzzle",
  'skewer': "Skewer",
  'smotheredMate': "Smothered mate",
  'superGM': "Super GM games",
  'swallowstailMate': "Swallow's tail mate",
  'trappedPiece': "Trapped piece",
  'triangleMate': "Triangle mate",
  'underPromotion': "Underpromotion",
  'veryLong': "Very long puzzle",
  'vukovicMate': "Vukovi\u0107 mate",
  'xRayAttack': "X-Ray attack",
  'zugzwang': "Zugzwang",
};
