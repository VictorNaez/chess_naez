import { CHESS_THEMES } from '../components/chess_themes';

// Construye la condición SQL para filtrar puzzles por temas.
// Un puzzle debe contener TODOS los temas seleccionados (AND, no OR).
export const buildThemeCondition = (themes: string[]): string => {
  if (themes.length === 0) return "";
  const conditions = themes
    .map(id => `(' ' || themes || ' ') LIKE '% ${id} %'`)
    .join(" AND ");
  return `AND (${conditions})`;
};

export const getRecommendedRange = (globalElo: number): [number, number] => [
  Math.max(400, globalElo - 50),
  Math.min(3000, globalElo + 150),
];

export const arraysEqualUnordered = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, i) => val === sortedB[i]);
};

export const getThemeNames = (themeIdsString: string): string => {
  if (!themeIdsString) return "";
  if (themeIdsString === 'global') return "Global ELO";

  const ids = themeIdsString.split(" ");
  return ids
    .map(id => CHESS_THEMES.find(t => t.id === id)?.name)
    .filter(Boolean)
    .join(", ");
};