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

// Extremos reales del catálogo. El slider de FilterModal usa los mismos.
export const CATALOG_MIN_RATING = 400;
export const CATALOG_MAX_RATING = 3000;

// Anchura mínima garantizada de la ventana recomendada.
const MIN_WINDOW = 150;

// Ventana de dificultad para el modo recomendado: un poco por debajo del rating
// del jugador y bastante por encima.
//
// Los clamps no son decorativos. Con el ELO inicial en 400 y el factor K alto de
// la fase de calibración, un jugador puede caer por debajo del suelo del
// catálogo en tres o cuatro fallos. La versión anterior devolvía entonces cosas
// como [400, 300]: un BETWEEN invertido, cero filas, y el usuario viendo "No
// puzzles, adjust filters" sin haber tocado un filtro en su vida. Forzar que el
// máximo siempre quede por encima del mínimo cierra ese agujero.
export const getRecommendedRange = (globalElo: number): [number, number] => {
  const low = Math.min(
    Math.max(CATALOG_MIN_RATING, globalElo - 50),
    CATALOG_MAX_RATING - MIN_WINDOW,
  );
  const high = Math.min(
    CATALOG_MAX_RATING,
    Math.max(low + MIN_WINDOW, globalElo + 150),
  );
  return [low, high];
};

// Lee el rating global directamente de SQLite.
//
// Existe por el arranque: el primer puzle se pide desde el efecto de boot, que
// cerró sobre el `userRatings` del primer render, cuando todavía es {}. Con el
// modo recomendado apagado por defecto daba igual, pero ahora arranca encendido
// y la ventana se calculaba sobre DEFAULT_ELO: un jugador de 1800 abría la app
// y recibía un puzle de 400.
//
// Devuelve null si la tabla aún no existe (instalación limpia: ensureSchema
// corre en un efecto posterior) o si la lectura falla. Quien llama decide el
// valor por defecto.
export const readGlobalElo = async (
  db: SQLite.SQLiteDatabase,
): Promise<number | null> => {
  try {
    const row = await db.getFirstAsync<{ elo: number }>(
      "SELECT elo FROM user_progress WHERE theme_id = 'global'",
    );
    return row?.elo ?? null;
  } catch {
    return null;
  }
};

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
