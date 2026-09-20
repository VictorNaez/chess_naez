import type * as SQLite from 'expo-sqlite';
import { themeMask } from '../data/themeBits';

// Filtro por temas. Un puzzle debe contener TODOS los seleccionados (AND).
//
// Sustituye al viejo `(' ' || themes || ' ') LIKE '% 29 %'`, que no era
// indexable y obligaba a concatenar cadenas fila a fila: a 3M de filas el
// COUNT del FilterModal tardaba medio segundo en escritorio.
//
// Las columnas th0/th1/th2 son máscaras de 31 bits. NO son de 63 aunque SQLite
// aguante enteros de 64: los operadores de bits de JavaScript son de 32 bits y
// `1 << 40` devuelve 256, así que el lado JS no sabría construir la máscara.
export const themeFilter = (themes: readonly string[]): { sql: string; params: number[] } => {
  if (themes.length === 0) return { sql: '', params: [] };
  const cols = themeMask(themes);
  const sql: string[] = [];
  const params: number[] = [];
  cols.forEach((m, i) => {
    if (m === 0) return;              // columna sin bits: la condición sobra
    sql.push(`(th${i} & ?) = ?`);
    params.push(m, m);
  });
  return { sql: sql.length ? `AND ${sql.join(' AND ')}` : '', params };
};

// Extremos del catálogo. Son un respaldo: los reales los lee
// readCatalogRatingRange() del propio .db, porque cada regeneración puede
// moverlos. El catálogo de 1M llega a 3323, y tener 3000 a fuego dejaba
// inalcanzables todos los puzzles por encima de esa cifra.
export const CATALOG_MIN_RATING = 400;
export const CATALOG_MAX_RATING = 3400;

// Anchura de las bandas de `theme_counts` / `rating_counts`, fijada por
// build_catalog.py. Si la cambias allí, cámbiala aquí.
export const BAND = 100;

let cachedRange: [number, number] | null = null;

/** Extremos reales del catálogo, leídos de rating_counts (unas 30 filas). */
export const readCatalogRatingRange = async (
  db: SQLite.SQLiteDatabase,
): Promise<[number, number]> => {
  if (cachedRange) return cachedRange;
  try {
    const row = await db.getFirstAsync<{ lo: number; hi: number }>(
      'SELECT MIN(banda) AS lo, MAX(banda) AS hi FROM rating_counts',
    );
    if (row && row.lo != null && row.hi != null) {
      cachedRange = [row.lo, row.hi + BAND - 1];
      return cachedRange;
    }
  } catch {
    // Catálogo viejo sin rating_counts: nos quedamos con las constantes.
  }
  cachedRange = [CATALOG_MIN_RATING, CATALOG_MAX_RATING];
  return cachedRange;
};

/**
 * Cuántos puzzles cumplen el filtro.
 *
 * Con 0 o 1 tema casi toda la respuesta sale de las tablas precalculadas
 * (`rating_counts` / `theme_counts`): se suman las bandas que caen ENTERAS
 * dentro del rango y solo los dos bordes parciales se cuentan a mano. Cada
 * borde abarca menos de una banda, así que el indice de rating lo resuelve en
 * milisegundos aunque el rango vaya de 350 a 3350.
 *
 * Antes esto exigia que el rango encajase exacto en bandas y, si no, escaneaba
 * el catalogo entero: con el slider en 400-3000 eso era un segundo de espera,
 * porque 3001 no es multiplo de 100.
 *
 * Con 2+ temas no hay atajo posible: la interseccion de dos temas no se deduce
 * de sus conteos por separado. Ahi se escanea con la mascara, y por eso quien
 * llama debe hacerlo con debounce.
 */
export const countPuzzles = async (
  db: SQLite.SQLiteDatabase,
  range: readonly [number, number] | number[],
  themes: readonly string[],
): Promise<number> => {
  const lo = range[0];
  const hi = range[1];
  if (hi < lo) return 0;

  const exacto = async (a: number, b: number): Promise<number> => {
    if (b < a) return 0;
    const f = themeFilter(themes);
    const r = await db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM puzzles WHERE rating BETWEEN ? AND ? ${f.sql}`,
      [a, b, ...f.params],
    );
    return r?.n ?? 0;
  };

  if (themes.length > 1) return exacto(lo, hi);

  // Primera y ultima banda contenidas por completo en [lo, hi].
  const primera = lo % BAND === 0 ? lo : (Math.floor(lo / BAND) + 1) * BAND;
  const ultimaFin = (hi + 1) % BAND === 0 ? hi : Math.floor(hi / BAND) * BAND - 1;
  if (primera > ultimaFin) return exacto(lo, hi);   // no cabe ni una banda entera

  const sql = themes.length === 0
    ? 'SELECT COALESCE(SUM(n), 0) AS n FROM rating_counts WHERE banda BETWEEN ? AND ?'
    : `SELECT COALESCE(SUM(tc.n), 0) AS n FROM theme_counts tc
         JOIN themes t ON t.bit = tc.bit
        WHERE tc.banda BETWEEN ? AND ? AND t.name = ?`;
  const args: (number | string)[] = [primera, ultimaFin + 1 - BAND];
  if (themes.length === 1) args.push(themes[0]);

  const [centro, bordeBajo, bordeAlto] = await Promise.all([
    db.getFirstAsync<{ n: number }>(sql, args).then(r => r?.n ?? 0),
    exacto(lo, primera - 1),
    exacto(ultimaFin + 1, hi),
  ]);
  return centro + bordeBajo + bordeAlto;
};

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
export const getRecommendedRange = (
  globalElo: number,
  catalogRange: readonly [number, number] = [CATALOG_MIN_RATING, CATALOG_MAX_RATING],
): [number, number] => {
  const [min, max] = catalogRange;
  const low = Math.min(Math.max(min, globalElo - 50), max - MIN_WINDOW);
  const high = Math.min(max, Math.max(low + MIN_WINDOW, globalElo + 150));
  // Se redondea a bandas enteras para que countPuzzles pueda responder desde
  // las tablas precalculadas en vez de escanear el catálogo.
  const lowB = Math.floor(low / BAND) * BAND;
  const highB = Math.min(Math.ceil((high + 1) / BAND) * BAND - 1, max);
  return [lowB, highB];
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
