import * as SQLite from 'expo-sqlite';
import { CHESS_THEMES } from '../components/chess_themes';

// =========================================================
// RANGOS TEMPORALES
// =========================================================
export type StatsRange = 'all' | 'year' | 'month' | 'week' | 'today';

const DAY_MS = 24 * 60 * 60 * 1000;

export const STATS_RANGE_OPTIONS: { key: StatsRange; label: string }[] = [
  { key: 'all',   label: 'TODO' },
  { key: 'year',  label: '1A'   },
  { key: 'month', label: '30D'  },
  { key: 'week',  label: '7D'   },
  { key: 'today', label: 'HOY'  },
];

export const getRangeCutoffMs = (range: StatsRange): number => {
  const now = Date.now();
  switch (range) {
    case 'year':  return now - 365 * DAY_MS;
    case 'month': return now - 30 * DAY_MS;
    case 'week':  return now - 7 * DAY_MS;
    case 'today': {
      const d = new Date();
      d.setHours(0, 0, 0, 0);   // desde medianoche local, no "últimas 24h"
      return d.getTime();
    }
    default: return 0;
  }
};

// elo_history.timestamp lo escribe SQLite con CURRENT_TIMESTAMP: texto UTC sin
// 'Z'. Pasarlo a JS con new Date() lo interpretaría como hora local y rompería
// los filtros, así que la conversión a epoch se hace siempre en SQL.
const TS_MS = (alias: string) => `CAST(strftime('%s', ${alias}.timestamp) AS INTEGER) * 1000`;

// Si dejas el móvil abierto encima de un puzle, solve_ms puede valer horas.
// Esos valores no son "tiempo de resolución", son ruido: quedan fuera de todas
// las medias, sumas y medianas (pero el intento sí cuenta para la precisión).
export const MAX_SANE_SOLVE_MS = 10 * 60 * 1000;

// Los buckets del gráfico tiempo/ELO. 200 puntos es el ancho que deja un
// número razonable de barras en un móvil sin quedarse sin muestras por barra.
const BUCKET_SIZE = 200;
const MIN_BUCKET_ATTEMPTS = 3;

// Ventana del calendario de actividad. No depende del rango seleccionado:
// "¿he entrenado esta semana?" es una pregunta distinta de "¿qué tal lo hice
// en los últimos 30 días?".
export const ACTIVITY_DAYS = 14;

// =========================================================
// TIPOS
// =========================================================
export interface ModeSplit {
  attempts: number;
  solved: number;
  failed: number;
  accuracy: number;   // 0..1
}

export interface ThemeStat {
  id: string;
  name: string;
  category: string;
  attempts: number;
  solved: number;
  accuracy: number;   // 0..1
  avgMs: number;      // 0 si no hay muestras válidas
  elo: number | null; // rating del tema en user_progress
}

export interface EloBucketStat {
  from: number;
  to: number;
  attempts: number;
  solved: number;
  accuracy: number;
  avgSolveMs: number; // media SOLO de los aciertos
}

export interface DayStat {
  day: string;        // 'YYYY-MM-DD' en hora local
  attempts: number;
  solved: number;
}

export interface RunModeStat {
  runs: number;
  bestSolved: number;
  totalSolved: number;
}

export interface StatsSnapshot {
  hasData: boolean;

  // --- Globales: no dependen del rango ---
  currentElo: number;
  maxElo: number;
  minElo: number;
  bestStreak: number;
  lifetimeAttempts: number;

  // --- Dependientes del rango ---
  attempts: number;
  solved: number;
  failed: number;
  accuracy: number;
  eloGain: number;

  auto: ModeSplit;
  manual: ModeSplit;
  untracked: ModeSplit;   // intentos anteriores a que se guardara el modo

  avgSolveMs: number;
  avgSolveMsSuccess: number;
  avgSolveMsFail: number;
  medianSolveMs: number;
  totalTimeMs: number;
  fastestSolveMs: number;

  hardestSolvedElo: number;
  avgSolvedElo: number;

  themes: ThemeStat[];
  buckets: EloBucketStat[];

  // --- Actividad: ventana fija de ACTIVITY_DAYS ---
  days: DayStat[];        // orden ascendente, con los días vacíos rellenados
  activeDays: number;
  bestDay: DayStat | null;
  dayStreak: number;

  clock: RunModeStat;
  survival: RunModeStat;
}

const emptySplit = (): ModeSplit => ({ attempts: 0, solved: 0, failed: 0, accuracy: 0 });
const emptyRun = (): RunModeStat => ({ runs: 0, bestSolved: 0, totalSolved: 0 });

export const EMPTY_STATS: StatsSnapshot = {
  hasData: false,
  currentElo: 1200, maxElo: 1200, minElo: 1200, bestStreak: 0, lifetimeAttempts: 0,
  attempts: 0, solved: 0, failed: 0, accuracy: 0, eloGain: 0,
  auto: emptySplit(), manual: emptySplit(), untracked: emptySplit(),
  avgSolveMs: 0, avgSolveMsSuccess: 0, avgSolveMsFail: 0, medianSolveMs: 0,
  totalTimeMs: 0, fastestSolveMs: 0,
  hardestSolvedElo: 0, avgSolvedElo: 0,
  themes: [], buckets: [],
  days: [], activeDays: 0, bestDay: null, dayStreak: 0,
  clock: emptyRun(), survival: emptyRun(),
};

// =========================================================
// AUXILIARES
// =========================================================
const toSplit = (attempts: number, solved: number): ModeSplit => ({
  attempts,
  solved,
  failed: attempts - solved,
  accuracy: attempts > 0 ? solved / attempts : 0,
});

// 'YYYY-MM-DD' en hora local, igual que devuelve date(timestamp,'localtime')
const localDayKey = (d: Date): string => {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

// Rellena los huecos: el gráfico de actividad necesita una barra por día,
// también por los días en los que no jugaste.
const buildActivityWindow = (rows: DayStat[], days: number): DayStat[] => {
  const byDay = new Map<string, DayStat>(rows.map(r => [r.day, r] as [string, DayStat]));
  const out: DayStat[] = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = localDayKey(d);
    out.push(byDay.get(key) ?? { day: key, attempts: 0, solved: 0 });
  }
  return out;
};

// Días consecutivos con actividad contando hacia atrás. Si hoy no has jugado
// todavía la racha no se rompe: se mide desde ayer.
const computeDayStreak = (rows: DayStat[]): number => {
  const active = new Set(rows.filter(r => r.attempts > 0).map(r => r.day));
  if (active.size === 0) return 0;

  const cursor = new Date();
  if (!active.has(localDayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!active.has(localDayKey(cursor))) return 0;
  }

  let streak = 0;
  while (active.has(localDayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
};

// =========================================================
// CONSULTA PRINCIPAL
// =========================================================
export const loadStats = async (
  db: SQLite.SQLiteDatabase,
  range: StatsRange,
): Promise<StatsSnapshot> => {
  const since = getRangeCutoffMs(range);
  const cap = MAX_SANE_SOLVE_MS;

  // --- 1. Globales (ELO y mejor racha histórica) -----------------
  const globalRow = await db.getFirstAsync<{
    currentElo: number | null; maxElo: number | null; minElo: number | null; lifetime: number;
  }>(`
    SELECT
      (SELECT elo FROM user_progress WHERE theme_id = 'global')              AS currentElo,
      (SELECT MAX(elo) FROM elo_history)                                     AS maxElo,
      (SELECT MIN(elo) FROM elo_history)                                     AS minElo,
      (SELECT COUNT(*) FROM elo_history WHERE puzzleID IS NOT NULL)          AS lifetime
  `);

  // Islas de aciertos consecutivos: la diferencia entre la posición absoluta y
  // la posición dentro de su grupo es constante mientras la racha no se corte.
  const streakRow = await db.getFirstAsync<{ best: number | null }>(`
    WITH marked AS (
      SELECT is_success,
             ROW_NUMBER() OVER (ORDER BY id)
             - ROW_NUMBER() OVER (PARTITION BY is_success ORDER BY id) AS grp
      FROM elo_history
      WHERE puzzleID IS NOT NULL
    ),
    islands AS (
      SELECT COUNT(*) AS len FROM marked WHERE is_success = 1 GROUP BY grp
    )
    SELECT MAX(len) AS best FROM islands
  `);

  // --- 2. Totales del rango --------------------------------------
  const totalsRow = await db.getFirstAsync<any>(`
    SELECT
      COUNT(*)                                                                   AS attempts,
      COALESCE(SUM(h.is_success), 0)                                             AS solved,
      COALESCE(SUM(h.elo_change), 0)                                             AS eloGain,
      COALESCE(AVG(CASE WHEN h.solve_ms BETWEEN 1 AND ? THEN h.solve_ms END), 0) AS avgMs,
      COALESCE(AVG(CASE WHEN h.is_success = 1 AND h.solve_ms BETWEEN 1 AND ? THEN h.solve_ms END), 0) AS avgMsOk,
      COALESCE(AVG(CASE WHEN h.is_success = 0 AND h.solve_ms BETWEEN 1 AND ? THEN h.solve_ms END), 0) AS avgMsKo,
      COALESCE(SUM(CASE WHEN h.solve_ms BETWEEN 1 AND ? THEN h.solve_ms END), 0) AS totalMs,
      COALESCE(MIN(CASE WHEN h.is_success = 1 AND h.solve_ms BETWEEN 1 AND ? THEN h.solve_ms END), 0) AS fastestMs,
      COALESCE(MAX(CASE WHEN h.is_success = 1 THEN h.puzzle_elo END), 0)         AS hardestSolved,
      COALESCE(AVG(CASE WHEN h.is_success = 1 AND h.puzzle_elo > 0 THEN h.puzzle_elo END), 0) AS avgSolvedElo
    FROM elo_history h
    WHERE h.puzzleID IS NOT NULL AND ${TS_MS('h')} >= ?
  `, [cap, cap, cap, cap, cap, since]);

  // --- 3. Reparto por modo de selección de ELO --------------------
  // is_recommended es NULL en las filas anteriores a que existiera la columna:
  // esos intentos no se pueden atribuir a ningún modo y van a su propio saco.
  // La columna la añade la migración de userProgress al abrir la app. Si por lo
  // que sea todavía no está, el panel no se cae: todo pasa a "sin registrar".
  let modeRows: { mode: number; attempts: number; solved: number }[] = [];
  try {
    modeRows = await db.getAllAsync<{ mode: number; attempts: number; solved: number }>(`
      SELECT COALESCE(h.is_recommended, -1) AS mode,
             COUNT(*)                       AS attempts,
             COALESCE(SUM(h.is_success), 0) AS solved
      FROM elo_history h
      WHERE h.puzzleID IS NOT NULL AND ${TS_MS('h')} >= ?
      GROUP BY mode
    `, [since]);
  } catch {
    modeRows = [];
  }

  // --- 4. Mediana del tiempo de resolución (solo aciertos) ---------
  // La media se dispara con los puzles que dejas a medias; la mediana es la
  // que de verdad describe "lo que tardas".
  const medianRow = await db.getFirstAsync<{ v: number }>(`
    SELECT h.solve_ms AS v
    FROM elo_history h
    WHERE h.puzzleID IS NOT NULL AND h.is_success = 1
      AND h.solve_ms BETWEEN 1 AND ? AND ${TS_MS('h')} >= ?
    ORDER BY h.solve_ms
    LIMIT 1
    OFFSET (
      SELECT COUNT(*) / 2 FROM elo_history h2
      WHERE h2.puzzleID IS NOT NULL AND h2.is_success = 1
        AND h2.solve_ms BETWEEN 1 AND ? AND ${TS_MS('h2')} >= ?
    )
  `, [cap, since, cap, since]);

  // --- 5. Precisión por tema táctico ------------------------------
  // Agrupamos por la cadena de temas (hay pocas combinaciones distintas) en vez
  // de traer una fila por intento, y luego repartimos en JS. Sumas en vez de
  // medias: hay que poder recombinar los grupos por tema.
  const themeRows = await db.getAllAsync<{
    themes: string | null; attempts: number; solved: number; msSum: number; msCount: number;
  }>(`
    SELECT p.themes                                                              AS themes,
           COUNT(*)                                                              AS attempts,
           COALESCE(SUM(h.is_success), 0)                                        AS solved,
           COALESCE(SUM(CASE WHEN h.solve_ms BETWEEN 1 AND ? THEN h.solve_ms END), 0) AS msSum,
           COUNT(CASE WHEN h.solve_ms BETWEEN 1 AND ? THEN 1 END)                AS msCount
    FROM elo_history h
    JOIN puzzles p ON p.id = h.puzzleID
    WHERE h.puzzleID IS NOT NULL AND ${TS_MS('h')} >= ?
    GROUP BY p.themes
  `, [cap, cap, since]);

  const progressRows = await db.getAllAsync<{ theme_id: string; elo: number }>(
    `SELECT theme_id, elo FROM user_progress`
  );
  const eloByTheme = new Map<string, number>(
    progressRows.map(r => [r.theme_id, r.elo] as [string, number])
  );

  const acc = new Map<string, { attempts: number; solved: number; msSum: number; msCount: number }>();
  for (const row of themeRows) {
    if (!row.themes) continue;
    for (const id of row.themes.trim().split(/\s+/)) {
      const prev = acc.get(id) ?? { attempts: 0, solved: 0, msSum: 0, msCount: 0 };
      prev.attempts += row.attempts;
      prev.solved += row.solved;
      prev.msSum += row.msSum;
      prev.msCount += row.msCount;
      acc.set(id, prev);
    }
  }

  const themes: ThemeStat[] = CHESS_THEMES
    .map(t => {
      const a = acc.get(t.id);
      return {
        id: t.id,
        name: t.name,
        category: t.category,
        attempts: a?.attempts ?? 0,
        solved: a?.solved ?? 0,
        accuracy: a && a.attempts > 0 ? a.solved / a.attempts : 0,
        avgMs: a && a.msCount > 0 ? a.msSum / a.msCount : 0,
        elo: eloByTheme.get(t.id) ?? null,
      };
    })
    .filter(t => t.attempts > 0)
    .sort((a, b) => b.accuracy - a.accuracy || b.attempts - a.attempts);

  // --- 6. Tiempo y precisión por dificultad del puzle --------------
  const bucketRows = await db.getAllAsync<{
    bucket: number; attempts: number; solved: number; msSum: number; msCount: number;
  }>(`
    SELECT (h.puzzle_elo / ${BUCKET_SIZE}) * ${BUCKET_SIZE}                      AS bucket,
           COUNT(*)                                                              AS attempts,
           COALESCE(SUM(h.is_success), 0)                                        AS solved,
           COALESCE(SUM(CASE WHEN h.is_success = 1 AND h.solve_ms BETWEEN 1 AND ? THEN h.solve_ms END), 0) AS msSum,
           COUNT(CASE WHEN h.is_success = 1 AND h.solve_ms BETWEEN 1 AND ? THEN 1 END) AS msCount
    FROM elo_history h
    WHERE h.puzzleID IS NOT NULL AND h.puzzle_elo > 0 AND ${TS_MS('h')} >= ?
    GROUP BY bucket
    ORDER BY bucket ASC
  `, [cap, cap, since]);

  const buckets: EloBucketStat[] = bucketRows
    .filter(r => r.attempts >= MIN_BUCKET_ATTEMPTS)
    .map(r => ({
      from: r.bucket,
      to: r.bucket + BUCKET_SIZE - 1,
      attempts: r.attempts,
      solved: r.solved,
      accuracy: r.attempts > 0 ? r.solved / r.attempts : 0,
      avgSolveMs: r.msCount > 0 ? r.msSum / r.msCount : 0,
    }));

  // --- 7. Actividad diaria (ventana fija) -------------------------
  const activitySince = Date.now() - 400 * DAY_MS;
  const dayRows = await db.getAllAsync<{ day: string; attempts: number; solved: number }>(`
    SELECT date(h.timestamp, 'localtime')  AS day,
           COUNT(*)                        AS attempts,
           COALESCE(SUM(h.is_success), 0)  AS solved
    FROM elo_history h
    WHERE h.puzzleID IS NOT NULL AND ${TS_MS('h')} >= ?
    GROUP BY day
    ORDER BY day DESC
    LIMIT 400
  `, [activitySince]);

  // Días activos y mejor día se miden DENTRO de la ventana que se dibuja, para
  // que las tres cifras de la sección hablen del mismo periodo que las barras.
  // La racha no: cuenta hacia atrás todo lo que haga falta.
  const days = buildActivityWindow(dayRows, ACTIVITY_DAYS);
  const bestDay = days.reduce<DayStat | null>(
    (best, r) => (r.attempts > 0 && (!best || r.attempts > best.attempts) ? r : best), null
  );

  // --- 8. Partidas de contrarreloj y supervivencia -----------------
  const loadRuns = async (table: string): Promise<RunModeStat> => {
    try {
      const row = await db.getFirstAsync<{ runs: number; best: number | null; total: number | null }>(
        `SELECT COUNT(*) AS runs, MAX(solved) AS best, SUM(solved) AS total
         FROM ${table} WHERE ended_at >= ?`,
        [since]
      );
      return {
        runs: row?.runs ?? 0,
        bestSolved: row?.best ?? 0,
        totalSolved: row?.total ?? 0,
      };
    } catch {
      // Las tablas las crea useClockMode/useSurvivalMode al montar; si el
      // usuario abre estadísticas antes de que existan, no es un error.
      return emptyRun();
    }
  };

  const attempts = totalsRow?.attempts ?? 0;
  const solved = totalsRow?.solved ?? 0;

  const findMode = (value: number) => {
    const r = modeRows.find(m => Number(m.mode) === value);
    return toSplit(r?.attempts ?? 0, r?.solved ?? 0);
  };

  const auto = findMode(1);
  const manual = findMode(0);
  // Si la consulta por modo no pudo ejecutarse, los intentos existen igual:
  // van todos al saco de "sin registrar" en vez de desaparecer del panel.
  const untracked = auto.attempts + manual.attempts === 0 && modeRows.length === 0
    ? toSplit(attempts, solved)
    : findMode(-1);

  return {
    hasData: (globalRow?.lifetime ?? 0) > 0,

    currentElo: globalRow?.currentElo ?? 1200,
    maxElo: globalRow?.maxElo ?? 1200,
    minElo: globalRow?.minElo ?? 1200,
    bestStreak: streakRow?.best ?? 0,
    lifetimeAttempts: globalRow?.lifetime ?? 0,

    attempts,
    solved,
    failed: attempts - solved,
    accuracy: attempts > 0 ? solved / attempts : 0,
    eloGain: totalsRow?.eloGain ?? 0,

    auto,
    manual,
    untracked,

    avgSolveMs: Math.round(totalsRow?.avgMs ?? 0),
    avgSolveMsSuccess: Math.round(totalsRow?.avgMsOk ?? 0),
    avgSolveMsFail: Math.round(totalsRow?.avgMsKo ?? 0),
    medianSolveMs: Math.round(medianRow?.v ?? 0),
    totalTimeMs: totalsRow?.totalMs ?? 0,
    fastestSolveMs: totalsRow?.fastestMs ?? 0,

    hardestSolvedElo: totalsRow?.hardestSolved ?? 0,
    avgSolvedElo: Math.round(totalsRow?.avgSolvedElo ?? 0),

    themes,
    buckets,

    days,
    activeDays: days.filter(d => d.attempts > 0).length,
    bestDay,
    dayStreak: computeDayStreak(dayRows),

    clock: await loadRuns('clock_runs'),
    survival: await loadRuns('survival_runs'),
  };
};
