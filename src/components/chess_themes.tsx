import type { Dictionary } from '../i18n';
import { THEME_LABEL_EN } from '../data/themeBits';
import { BITS_PER_COL, THEME_BIT, type ThemeKey } from '../data/themeBits';

// La clave de Lichess es lo ÚNICO que persiste (`elo_history.theme`,
// `user_progress.theme_id`). El bit numérico solo existe dentro del catálogo,
// y lo genera build_catalog.py a partir de THEME_VOCAB. Nunca los mezcles:
// aquí siempre se trabaja con la clave.
//
// De los 73 temas del catálogo se exponen 64. Los 9 restantes (mateIn1..5,
// master, masterVsMaster, superGM, collinearMove) siguen teniendo su bit en el
// .db y sus puzzles siguen apareciendo; simplemente no se ofrecen como filtro.
// Añadir uno es meter su clave en la lista de abajo, sin regenerar nada.

export type ThemeCategoryId = keyof Dictionary['themeCategories'];

export interface ChessTheme {
  key: ThemeKey;
  categoryId: ThemeCategoryId;
}

const cat = (categoryId: ThemeCategoryId, keys: ThemeKey[]): ChessTheme[] =>
  keys.map(key => ({ key, categoryId }));

export const CHESS_THEMES: ChessTheme[] = [
  // Fases de la partida
  ...cat('phases', ['opening', 'middlegame', 'endgame']),

  // Longitud de la solución
  ...cat('length', ['oneMove', 'short', 'long', 'veryLong']),

  // Objetivo / evaluación
  ...cat('goal', ['mate', 'crushing', 'advantage', 'equality']),

  // Táctica fundamental
  ...cat('basicTactics', [
    'fork', 'pin', 'skewer', 'hangingPiece', 'discoveredAttack',
    'discoveredCheck', 'doubleCheck', 'capturingDefender', 'xRayAttack',
    'trappedPiece',
  ]),

  // Táctica avanzada
  ...cat('advancedTactics', [
    'deflection', 'attraction', 'interference', 'clearance', 'intermezzo',
    'defensiveMove', 'quietMove', 'sacrifice', 'zugzwang',
  ]),

  // Ataque al rey
  ...cat('attack', [
    'exposedKing', 'kingsideAttack', 'queensideAttack', 'attackingF2F7',
  ]),

  // Peones y reglas especiales
  ...cat('pawns', [
    'advancedPawn', 'promotion', 'underPromotion', 'enPassant', 'castling',
  ]),

  // Finales
  ...cat('endgames', [
    'pawnEndgame', 'knightEndgame', 'bishopEndgame', 'rookEndgame',
    'queenEndgame', 'queenRookEndgame',
  ]),

  // Patrones de mate
  ...cat('matePatterns', [
    'backRankMate', 'smotheredMate', 'anastasiaMate', 'arabianMate',
    'bodenMate', 'operaMate', 'epauletteMate', 'dovetailMate', 'hookMate',
    'killBoxMate', 'cornerMate', 'doubleBishopMate', 'blindSwineMate',
    'morphysMate', 'pillsburysMate', 'swallowstailMate', 'triangleMate',
    'vukovicMate', 'balestraMate',
  ]),
];

/** Orden de las categorías en el FilterModal. */
export const FILTER_CATEGORY_IDS: ThemeCategoryId[] = [
  'basicTactics',
  'advancedTactics',
  'matePatterns',
  'attack',
  'endgames',
  'pawns',
  'phases',
  'goal',
  'length',
];

// Ejes del radar. NO son todas las categorías, a propósito.
//
// `length` (corto/largo) y `goal` (ventaja/aplastante) etiquetan a la práctica
// totalidad del catálogo y no describen una habilidad: un "ELO de puzzles
// cortos" no significa nada al lado de un "ELO de clavadas", y mete ruido en el
// radar porque siempre tendría muchísimos más intentos que el resto.
// `phases` se queda fuera por lo mismo, y porque `endgames` ya cubre finales
// con mucho más detalle.
export const RADAR_CATEGORY_IDS: ThemeCategoryId[] = [
  'basicTactics',
  'advancedTactics',
  'matePatterns',
  'attack',
  'endgames',
  'pawns',
];

/** Nombre visible de un tema. Devuelve la clave si el diccionario no la cubre. */
export function themeName(t: Dictionary, key: string): string {
  // El respaldo en inglés existe para que los 36 temas nuevos se vean con su
  // nombre real mientras no estén traducidos a los seis idiomas, en vez de
  // enseñar la clave cruda ("smotheredMate") en pantalla.
  return (t.themes as Record<string, string>)[key] ?? THEME_LABEL_EN[key] ?? key;
}

/** Nombres visibles de una lista de claves. */
export function themeNames(t: Dictionary, keys: readonly string[]): string {
  if (!keys.length) return '';
  if (keys.length === 1 && keys[0] === 'global') return t.puzzle.globalElo;
  return keys.map(k => themeName(t, k)).filter(Boolean).join(', ');
}

/**
 * Claves de tema que lleva un puzle, a partir de sus columnas th0/th1/th2.
 * Solo devuelve las expuestas: un puzle con `master` no enseñará ese tema.
 */
const EXPUESTOS = CHESS_THEMES.map(t => t.key);

export function themeKeysFromMask(cols: readonly number[]): ThemeKey[] {
  return EXPUESTOS.filter(k => {
    const i = THEME_BIT[k];
    const col = cols[(i / BITS_PER_COL) | 0] ?? 0;
    return (col & (1 << (i % BITS_PER_COL))) !== 0;
  });
}

/** Atajo para una fila del catálogo. */
export const themeKeysFromRow = (r: { th0?: number; th1?: number; th2?: number }): ThemeKey[] =>
  themeKeysFromMask([r.th0 ?? 0, r.th1 ?? 0, r.th2 ?? 0]);
