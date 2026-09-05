// El acceso a datos se generalizó a `data/runs.ts` cuando entró supervivencia.
// Estos wrappers existen para no tocar useClockMode ni los sitios que ya
// importaban desde aquí.
import * as SQLite from 'expo-sqlite';
import type { ClockRanking, ClockRecords, ClockRunSummary } from '../types/clock';
import { getRunRanking, getRunRecords, resetRuns, saveRun, setupRunTables } from '../types/runs';

export { getWeekStartMs } from '../types/runs';

export const setupClockTables = (db: SQLite.SQLiteDatabase) => setupRunTables(db);

export const saveClockRun = (db: SQLite.SQLiteDatabase, s: ClockRunSummary): Promise<number> =>
  saveRun(db, 'clock', s);

export const getClockRecords = (db: SQLite.SQLiteDatabase, durationMs: number): Promise<ClockRecords> =>
  getRunRecords(db, 'clock', durationMs);

export const getClockRanking = (
  db: SQLite.SQLiteDatabase, durationMs: number, runId: number,
): Promise<ClockRanking> => getRunRanking(db, 'clock', durationMs, runId);

export const resetClockRuns = (db: SQLite.SQLiteDatabase) => resetRuns(db, 'clock');
