import type { Dictionary } from '../i18n';

// El id numérico es lo ÚNICO que persiste (columna `themes` de SQLite y
// `elo_history.theme`). Nunca lo toques al traducir.
//
// `categoryId` sustituye al antiguo `category: "Ataque"`. Antes el agrupamiento
// del radar comparaba la cadena VISIBLE, así que traducir "Ataque" habría
// vaciado el grupo entero sin dar ningún error de compilación.
export type ThemeCategoryId = keyof Dictionary['themeCategories'];

export interface ChessTheme {
  id: string;
  categoryId: ThemeCategoryId;
}

export const CHESS_THEMES: ChessTheme[] = [
  // ATAQUE AL REY (MATES)
  { id: '8',  categoryId: 'attack' },
  { id: '17', categoryId: 'attack' },
  { id: '39', categoryId: 'attack' },
  { id: '21', categoryId: 'attack' },
  { id: '15', categoryId: 'attack' },

  // TÁCTICA FUNDAMENTAL
  { id: '1',  categoryId: 'basicTactics' },
  { id: '22', categoryId: 'basicTactics' },
  { id: '18', categoryId: 'basicTactics' },
  { id: '25', categoryId: 'basicTactics' },
  { id: '47', categoryId: 'basicTactics' },
  { id: '38', categoryId: 'basicTactics' },

  // MANIOBRAS AVANZADAS
  { id: '9',  categoryId: 'advancedTactics' },
  { id: '12', categoryId: 'advancedTactics' },
  { id: '36', categoryId: 'advancedTactics' },
  { id: '45', categoryId: 'advancedTactics' },
  { id: '16', categoryId: 'advancedTactics' },
  { id: '11', categoryId: 'advancedTactics' },

  // FINALES
  { id: '10', categoryId: 'endgames' },
  { id: '37', categoryId: 'endgames' },
  { id: '23', categoryId: 'endgames' },
  { id: '32', categoryId: 'endgames' },
  { id: '33', categoryId: 'endgames' },
  { id: '34', categoryId: 'endgames' },
  { id: '35', categoryId: 'endgames' },
  { id: '40', categoryId: 'endgames' },

  // FASES DEL JUEGO
  { id: '24', categoryId: 'phases' },
  { id: '13', categoryId: 'phases' },
  { id: '14', categoryId: 'phases' },
];

export const RADAR_CATEGORY_IDS: ThemeCategoryId[] = [
  'attack',
  'basicTactics',
  'advancedTactics',
  'endgames',
  'phases',
];

/** Nombre visible de un tema. Devuelve el id si el diccionario no lo cubre. */
export function themeName(t: Dictionary, id: string): string {
  return (t.themes as Record<string, string>)[id] ?? id;
}

/** Nombres visibles de una cadena "8 22 47" tal y como viene de la BD. */
export function themeNames(t: Dictionary, themeIdsString: string): string {
  if (!themeIdsString) return '';
  if (themeIdsString === 'global') return t.puzzle.globalElo;
  return themeIdsString
    .trim()
    .split(/\s+/)
    .map(id => (t.themes as Record<string, string>)[id])
    .filter(Boolean)
    .join(', ');
}
