import * as SQLite from 'expo-sqlite';
import type { ClockRanking, ClockRecords, ClockRunSummary } from '../types/clock';

// Guardamos epoch ms, NO CURRENT_TIMESTAMP: SQLite escribe UTC sin 'Z' y
// new Date() lo interpreta como local, lo que rompe los filtros por fecha.
export const setupClockTables = async (db: SQLite.SQLiteDatabase) => {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS clock_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      duration_ms INTEGER NOT NULL,
      solved INTEGER NOT NULL DEFAULT 0,
      failed INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      accuracy REAL NOT NULL DEFAULT 0,
      avg_solved_rating INTEGER NOT NULL DEFAULT 0,
      max_solved_rating INTEGER NOT NULL DEFAULT 0,
      avg_solve_ms INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER NOT NULL,
      ended_at INTEGER NOT NULL
    );
  `);
  await db.execAsync(
    `CREATE INDEX IF NOT EXISTS idx_clock_runs_dur ON clock_runs (duration_ms, solved DESC);`
  );
};

// Lunes 00:00 local
export const getWeekStartMs = (ref: Date = new Date()): number => {
  const d = new Date(ref);
  const dayFromMonday = (d.getDay() + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - dayFromMonday);
  return d.getTime();
};

export const saveClockRun = async (
  db: SQLite.SQLiteDatabase,
  s: ClockRunSummary,
): Promise<number> => {
  const res = await db.runAsync(
    `INSERT INTO clock_runs
      (duration_ms, solved, failed, attempts, accuracy,
       avg_solved_rating, max_solved_rating, avg_solve_ms, started_at, ended_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      s.durationMs, s.solved, s.failed, s.attempts, s.accuracy,
      s.avgSolvedRating, s.maxSolvedRating, s.avgSolveMs, s.startedAt, s.endedAt,
    ],
  );
  return res.lastInsertRowId as number;
};

export const getClockRecords = async (
  db: SQLite.SQLiteDatabase,
  durationMs: number,
): Promise<ClockRecords> => {
  const weekStart = getWeekStartMs();
  const rows = await db.getAllAsync<{ best: number | null; total: number }>(
    `SELECT MAX(solved) AS best, COUNT(*) AS total FROM clock_runs WHERE duration_ms = ?`,
    [durationMs],
  );
  const weekRows = await db.getAllAsync<{ best: number | null }>(
    `SELECT MAX(solved) AS best FROM clock_runs WHERE duration_ms = ? AND ended_at >= ?`,
    [durationMs, weekStart],
  );
  return {
    bestAllTime: rows[0]?.best ?? 0,
    bestThisWeek: weekRows[0]?.best ?? 0,
    total: rows[0]?.total ?? 0,
  };
};

// Desempate: resueltos DESC, luego ELO medio de los resueltos DESC.
export const getClockRanking = async (
  db: SQLite.SQLiteDatabase,
  durationMs: number,
  runId: number,
): Promise<ClockRanking> => {
  const runRows = await db.getAllAsync<{ solved: number; avg_solved_rating: number; ended_at: number }>(
    `SELECT solved, avg_solved_rating, ended_at FROM clock_runs WHERE id = ?`,
    [runId],
  );
  const run = runRows[0];
  const records = await getClockRecords(db, durationMs);

  if (!run) {
    return {
      rank: 1, total: records.total,
      isPersonalBest: false, isWeekBest: false,
      bestSolvedAllTime: records.bestAllTime,
      bestSolvedThisWeek: records.bestThisWeek,
    };
  }

  const betterClause = `
    (solved > ? OR (solved = ? AND avg_solved_rating > ?))
  `;
  const params = [run.solved, run.solved, run.avg_solved_rating];

  const betterRows = await db.getAllAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM clock_runs
     WHERE duration_ms = ? AND id != ? AND ${betterClause}`,
    [durationMs, runId, ...params],
  );

  const weekStart = getWeekStartMs();
  const betterWeekRows = await db.getAllAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM clock_runs
     WHERE duration_ms = ? AND id != ? AND ended_at >= ? AND ${betterClause}`,
    [durationMs, runId, weekStart, ...params],
  );

  const rank = (betterRows[0]?.n ?? 0) + 1;

  return {
    rank,
    total: records.total,
    // Solo es récord si hay con qué compararlo
    isPersonalBest: rank === 1 && records.total > 1,
    isWeekBest: (betterWeekRows[0]?.n ?? 0) === 0,
    bestSolvedAllTime: records.bestAllTime,
    bestSolvedThisWeek: records.bestThisWeek,
  };
};

export const resetClockRuns = async (db: SQLite.SQLiteDatabase) => {
  await db.runAsync(`DELETE FROM clock_runs`);
};