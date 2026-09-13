import type * as SQLite from 'expo-sqlite';

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

// ¿Este puzle ya tiene veredicto guardado en el historial? Se usa al restaurar
// el puzle activo en el arranque: si ya puntuó, volver a ponerlo en el tablero
// lo haría puntuar dos veces. Se apoya en idx_elo_history_puzzle, así que es una
// búsqueda indexada y no un escaneo del historial.
export const hasPuzzleBeenScored = async (
  db: SQLite.SQLiteDatabase,
  puzzleId: string,
): Promise<boolean> => {
  // getFirstAsync devuelve la fila directamente (o null), no un array.
  const row = await db.getFirstAsync<{ one: number }>(
    'SELECT 1 AS one FROM elo_history WHERE puzzleID = ? LIMIT 1',
    [puzzleId],
  );
  return row != null;
};
