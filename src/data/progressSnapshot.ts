import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import { closeProgressDatabase, PROGRESS_DB, SQLITE_DIR } from './puzzleDatabase';

// =========================================================
// INSTANTÁNEA DEL PROGRESO
// =========================================================
// Copiar progress.db "a pelo" con copyAsync no vale: con WAL activo, el .db por
// sí solo puede ir por detrás del -wal y la copia queda a medias. `VACUUM main
// INTO` genera un fichero NUEVO, compacto y consistente, sin bloquear escrituras
// ni tocar el original.
//
// `main` explícito: el catálogo va adjunto como `catalog` y un VACUUM sin
// esquema no sabría cuál de los dos volcar.
//
// La instantánea vive en la caché: si el sistema la borra, se vuelve a generar
// en la siguiente copia. Nunca es la fuente de verdad.

const SNAPSHOT_FILE = 'progress-snapshot.db';
const RESTORE_FILE = 'progress-restore.db';
// Nombre temporal DENTRO del directorio de SQLite para verificar una copia
// descargada antes de dejarla entrar: se abre como base independiente.
const VERIFY_DB = 'progress-verify.db';

export const snapshotUri = (): string => `${FileSystem.cacheDirectory}${SNAPSHOT_FILE}`;
export const restoreUri = (): string => `${FileSystem.cacheDirectory}${RESTORE_FILE}`;

export interface ProgressSummary {
  attempts: number;      // filas de elo_history (incluye la semilla del gráfico)
  solved: number;
  puzzles: number;       // puzles distintos jugados
  globalElo: number;
  lastPlayedAt: number;  // epoch ms, 0 si no hay nada
}

export const EMPTY_SUMMARY: ProgressSummary = {
  attempts: 0, solved: 0, puzzles: 0, globalElo: 0, lastPlayedAt: 0,
};

/**
 * Resumen barato del progreso. Sirve para dos cosas: enseñar al usuario qué hay
 * en cada lado antes de restaurar, y como número de revisión de la copia
 * automática (si `attempts` no ha cambiado, no hay nada nuevo que subir).
 *
 * Cada consulta va en su try: en una instalación recién restaurada puede faltar
 * alguna tabla (las crea ensureSchema en el arranque siguiente) y un resumen a
 * medias es mucho mejor que una excepción.
 */
export const summarizeProgress = async (
  db: SQLite.SQLiteDatabase,
): Promise<ProgressSummary> => {
  const summary: ProgressSummary = { ...EMPTY_SUMMARY };

  try {
    const row = await db.getFirstAsync<{ attempts: number; solved: number }>(
      `SELECT COUNT(*) AS attempts, COALESCE(SUM(is_success), 0) AS solved
       FROM elo_history WHERE puzzleID IS NOT NULL`,
    );
    summary.attempts = row?.attempts ?? 0;
    summary.solved = row?.solved ?? 0;
  } catch { /* tabla aún inexistente */ }

  try {
    const row = await db.getFirstAsync<{ elo: number }>(
      `SELECT elo FROM user_progress WHERE theme_id = 'global'`,
    );
    summary.globalElo = row?.elo ?? 0;
  } catch { /* idem */ }

  try {
    const row = await db.getFirstAsync<{ n: number; last: number | null }>(
      `SELECT COUNT(*) AS n, MAX(last_at) AS last FROM puzzle_stats`,
    );
    summary.puzzles = row?.n ?? 0;
    summary.lastPlayedAt = row?.last ?? 0;
  } catch { /* idem */ }

  return summary;
};

/** Número de revisión de la copia: cambia en cuanto el jugador puntúa un puzle. */
export const revisionOf = (s: ProgressSummary): string =>
  `${s.attempts}:${s.solved}:${s.puzzles}:${s.globalElo}`;

export interface Snapshot {
  uri: string;
  size: number;
  summary: ProgressSummary;
}

export const createSnapshot = async (db: SQLite.SQLiteDatabase): Promise<Snapshot> => {
  const uri = snapshotUri();
  // VACUUM INTO se niega a escribir sobre un fichero existente.
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});

  const summary = await summarizeProgress(db);
  // SQLite quiere una ruta del sistema de ficheros, no una URI file://.
  await db.runAsync('VACUUM main INTO ?', [uri.replace('file://', '')]);

  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new Error('snapshot-missing');
  return { uri, size: info.size ?? 0, summary };
};

export class InvalidSnapshotError extends Error {}

/**
 * Abre la copia descargada como base independiente y comprueba que es un
 * SQLite sano y que tiene pinta de ser NUESTRO progreso. Un fichero truncado a
 * medio descargar pasaría el `getInfoAsync` sin problema; aquí no pasa.
 *
 * Se copia al directorio de SQLite porque openDatabaseAsync trabaja con nombres
 * dentro de ese directorio, no con rutas sueltas de la caché.
 */
export const inspectSnapshot = async (uri: string): Promise<ProgressSummary> => {
  const target = `${SQLITE_DIR}/${VERIFY_DB}`;
  await FileSystem.makeDirectoryAsync(SQLITE_DIR, { intermediates: true }).catch(() => {});
  for (const suffix of ['', '-wal', '-shm']) {
    await FileSystem.deleteAsync(`${target}${suffix}`, { idempotent: true }).catch(() => {});
  }
  await FileSystem.copyAsync({ from: uri, to: target });

  let candidate: SQLite.SQLiteDatabase | null = null;
  try {
    candidate = await SQLite.openDatabaseAsync(VERIFY_DB);
    const integrity = await candidate.getFirstAsync<{ integrity_check: string }>(
      'PRAGMA integrity_check',
    );
    if (integrity?.integrity_check !== 'ok') throw new InvalidSnapshotError('integrity');

    const tables = await candidate.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name IN ('user_progress', 'elo_history')`,
    );
    if (tables.length < 2) throw new InvalidSnapshotError('schema');

    return await summarizeProgress(candidate);
  } catch (error) {
    if (error instanceof InvalidSnapshotError) throw error;
    throw new InvalidSnapshotError(String(error));
  } finally {
    if (candidate) { try { await candidate.closeAsync(); } catch { /* ya cerrada */ } }
    await SQLite.deleteDatabaseAsync(VERIFY_DB).catch(() => {});
    for (const suffix of ['', '-wal', '-shm']) {
      await FileSystem.deleteAsync(`${target}${suffix}`, { idempotent: true }).catch(() => {});
    }
  }
};

/**
 * Sustituye progress.db por la copia ya verificada. El -wal y el -shm del
 * progreso viejo se borran: dejar un WAL huérfano junto a un .db nuevo es
 * corrupción garantizada en la siguiente apertura.
 *
 * Al volver, NO hay base abierta: quien llama tiene que provocar un rearranque
 * (en la app, subir `bootAttempt`), que es quien vuelve a abrirla y a montar el
 * esquema que falte.
 */
export const applySnapshot = async (uri: string): Promise<void> => {
  await closeProgressDatabase();
  for (const suffix of ['', '-wal', '-shm']) {
    await FileSystem.deleteAsync(`${SQLITE_DIR}/${PROGRESS_DB}${suffix}`, { idempotent: true })
      .catch(() => {});
  }
  await FileSystem.makeDirectoryAsync(SQLITE_DIR, { intermediates: true }).catch(() => {});
  await FileSystem.copyAsync({ from: uri, to: `${SQLITE_DIR}/${PROGRESS_DB}` });
};

export const discardTempFiles = async (): Promise<void> => {
  await FileSystem.deleteAsync(snapshotUri(), { idempotent: true }).catch(() => {});
  await FileSystem.deleteAsync(restoreUri(), { idempotent: true }).catch(() => {});
};
