import type * as SQLite from 'expo-sqlite';
import { RADAR_CATEGORY_IDS } from '../components/chess_themes';
import { loadThemeStats, MIN_THEME_ATTEMPTS, type ThemeStat } from './statsQueries';

// =========================================================
// PUNTOS DÉBILES
// =========================================================
// Filtro "centrarse en lo que más te cuesta". No fija un tema: en cada puzle
// sortea uno entre tus temas con peor precisión, con más probabilidad cuanto
// peor se te da. Se recalcula antes de cada consulta, así que cuando un tema
// mejora va saliendo menos y acaba dejando su sitio al siguiente.

export interface WeakTheme {
  id: string;
  attempts: number;
  accuracy: number;   // bruta: la misma cifra que enseña el panel de estadísticas
  weight: number;     // parte de los puzles que se lleva; entre todos suman 1
}

// Cuántos temas entran en el foco. Con más, el reparto se diluye y deja de ser
// un foco; con menos, un par de temas raros acaparan la sesión entera.
export const WEAK_THEMES_TOP = 5;

// Mínimo de temas con muestra suficiente para que "los peores" signifique algo.
// Por debajo, el filtro no se puede aplicar.
export const WEAK_THEMES_MIN = 3;

// Intentos "ficticios" con tu precisión media que se suman a cada tema antes de
// ordenar. Un 2/5 (40%) y un 45/100 (45%) no son igual de fiables: sin esto el
// primero pasaría delante por pura mala suerte. Con 10 y una media del 65%, el
// 2/5 queda en un 57% y el 45/100 en un 47%. Solo afecta al orden y al peso; lo
// que se enseña en pantalla es la precisión real.
const PRIOR_ATTEMPTS = 10;

/**
 * Temas débiles a partir de las estadísticas por tema, del más flojo al menos.
 *
 * Solo cuentan los ejes del radar (RADAR_CATEGORY_IDS), por el mismo motivo
 * que allí: "puzle corto" o "ventaja" no son una habilidad que se entrene, y
 * como etiquetan medio catálogo su precisión es la media de todo lo demás.
 *
 * Devuelve [] si no hay al menos WEAK_THEMES_MIN temas con muestra suficiente.
 */
export const pickWeakThemes = (stats: readonly ThemeStat[]): WeakTheme[] => {
  const solid = stats.filter(
    t => RADAR_CATEGORY_IDS.includes(t.categoryId) && t.attempts >= MIN_THEME_ATTEMPTS,
  );
  if (solid.length < WEAK_THEMES_MIN) return [];

  // Un puzle con tres temas cuenta tres veces, pero igual arriba que abajo: como
  // media de referencia vale.
  const prior =
    solid.reduce((n, t) => n + t.solved, 0) / solid.reduce((n, t) => n + t.attempts, 0);

  const ranked = solid
    .map(t => ({ t, smoothed: (t.solved + PRIOR_ATTEMPTS * prior) / (t.attempts + PRIOR_ATTEMPTS) }))
    .sort((a, b) => a.smoothed - b.smoothed || b.t.attempts - a.t.attempts)
    .slice(0, WEAK_THEMES_TOP);

  // Peso = tasa de fallo: un tema en el que fallas el 60% sale el doble que uno
  // en el que fallas el 30%. El suelo evita pesos a cero si todo va al 100%.
  const miss = ranked.map(r => Math.max(1 - r.smoothed, 0.01));
  const total = miss.reduce((a, b) => a + b, 0);

  return ranked.map((r, i) => ({
    id: r.t.id,
    attempts: r.t.attempts,
    accuracy: r.t.accuracy,
    weight: miss[i] / total,
  }));
};

// Todo el historial, igual que la vista TODO del panel de estadísticas: así las
// cifras del filtro y las del panel coinciden. Es la misma consulta que usa el
// panel (una fila por combinación de temas, no por intento).
export const loadWeakThemes = async (db: SQLite.SQLiteDatabase): Promise<WeakTheme[]> =>
  pickWeakThemes(await loadThemeStats(db, 0));

/**
 * Orden en el que probar los temas débiles para el próximo puzle. Aleatorio,
 * pero los de más peso tienen más probabilidad de ir delante: muestreo
 * ponderado sin reemplazo (Efraimidis-Spirakis, clave = u^(1/peso)). La
 * probabilidad de que un tema salga el primero es exactamente su peso.
 *
 * El primero es el tema sorteado; el resto es el plan B por si ese ya no tiene
 * puzles sin resolver en tu rango de ELO.
 */
export const drawWeakThemeOrder = (
  weak: readonly WeakTheme[],
  rand: () => number = Math.random,
): string[] =>
  weak
    .map(w => ({ id: w.id, key: Math.pow(rand(), 1 / w.weight) }))
    .sort((a, b) => b.key - a.key)
    .map(w => w.id);

/**
 * Recorre los temas débiles en el orden sorteado hasta dar con un puzle.
 * `query(tema, mezclar)` es queryPuzzle con ese único tema.
 *
 * `exhausted` son los temas que ya se vio que no tienen puzles nuevos en este
 * rango, y quien llama la conserva entre puzles. Comprobarlo cuesta un escaneo
 * (unos 100 ms en escritorio con un tema raro agotado, frente a 0,1 ms de un
 * seek normal), y un tema débil sigue saliendo en el sorteo aunque no le quede
 * nada nuevo: sin la memoria, se pagaría cada vez que le tocase. En la banda
 * 1500-1699 hay solo 60 puzles de underPromotion o 71 de doubleBishopMate, así
 * que agotarlos no es un caso teórico.
 *
 * Los agotados van al final y se piden directamente mezclando repetidos (sin
 * la pasada de nuevos, que ya se sabe vacía): solo se llega a ellos si ningún
 * otro tema tiene nada nuevo, y entonces lo que hace falta es un repetido para
 * que el tablero enseñe el aviso de "todos resueltos".
 */
export const pickFromWeakThemes = async <P extends { fresh: boolean }>(
  order: readonly string[],
  exhausted: Set<string>,
  mixRepeats: boolean,
  query: (theme: string, mix: boolean) => Promise<P | null>,
): Promise<P | null> => {
  const sorted = [...order.filter(k => !exhausted.has(k)), ...order.filter(k => exhausted.has(k))];
  let fallback: P | null = null;
  for (const theme of sorted) {
    const pick = await query(theme, mixRepeats || exhausted.has(theme));
    if (pick && (pick.fresh || mixRepeats)) return pick;
    if (!mixRepeats) exhausted.add(theme);
    if (!fallback) fallback = pick;
  }
  return fallback;
};

// =========================================================
// CAMBIO TRAS UN INTENTO (aviso animado del tablero)
// =========================================================
export interface WeakChange {
  id: string;
  before: number;   // precisión 0..1 antes del intento
  after: number;    // y después: mayor si acertaste, menor si fallaste
}

/**
 * Cuánto ha cambiado la precisión de tus puntos débiles con un intento que YA
 * está guardado. `after` son las estadísticas por tema con ese intento dentro;
 * el "antes" se reconstruye restándolo (un intento en cada tema del puzle, más
 * un acierto si lo fue), así que es exacto sin depender de cuándo se leyó nada.
 *
 * Entran los temas del puzle que eran puntos débiles ANTES del intento, que es
 * lo que el panel del filtro enseñaba. Al acertar, si justo ese acierto saca a
 * uno del top, sale igual: es la subida que más merece verse. Al fallar, un
 * tema que entra en el top por culpa de este fallo no sale; en este modo los
 * puzles se sortean de entre los débiles, así que el tema por el que salió el
 * puzle ya lo era.
 */
export const computeWeakChanges = (
  after: readonly ThemeStat[],
  puzzleThemes: readonly string[],
  isSuccess: boolean,
): WeakChange[] => {
  const inPuzzle = new Set(puzzleThemes);
  const before: ThemeStat[] = after.map(t => {
    if (!inPuzzle.has(t.id)) return t;
    const attempts = t.attempts - 1;
    const solved = t.solved - (isSuccess ? 1 : 0);
    return { ...t, attempts, solved, accuracy: attempts > 0 ? solved / attempts : 0 };
  });
  const byId = new Map(before.map(t => [t.id, t] as [string, ThemeStat]));

  return pickWeakThemes(before)
    .filter(w => inPuzzle.has(w.id))
    .map(w => ({
      id: w.id,
      before: byId.get(w.id)!.accuracy,
      after: after.find(t => t.id === w.id)!.accuracy,
    }));
};

/**
 * Lee las estadísticas y calcula el cambio del intento que se acaba de guardar
 * para `puzzleId`. Devuelve [] si el último intento del historial no es ese,
 * con ese resultado: updateElo devuelve 0 tanto si falla la escritura como si
 * una pista deja la variación en 0, y restar un intento que no está daría
 * cifras falsas. La comprobación es una sola lectura por clave primaria.
 */
export const loadWeakChanges = async (
  db: SQLite.SQLiteDatabase,
  puzzleId: string,
  puzzleThemes: readonly string[],
  isSuccess: boolean,
): Promise<WeakChange[]> => {
  const last = await db.getFirstAsync<{ puzzleID: string | null; is_success: number }>(
    'SELECT puzzleID, is_success FROM elo_history ORDER BY id DESC LIMIT 1',
  );
  if (!last || last.puzzleID !== puzzleId || last.is_success !== (isSuccess ? 1 : 0)) return [];
  return computeWeakChanges(await loadThemeStats(db, 0), puzzleThemes, isSuccess);
};
