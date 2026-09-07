import * as SQLite from 'expo-sqlite';
import type { Puzzle } from '../types/puzzle';
import {
  EMPTY_REPASO_STATS,
  REPASO_REASON,
  type RepasoOrder,
  type RepasoReason,
  type RepasoStats,
} from '../types/repaso';

const TABLE = 'review_queue';

// Guardamos epoch ms en INTEGER, NO CURRENT_TIMESTAMP: SQLite escribe UTC sin
// 'Z' y `new Date()` lo interpreta como local, lo que rompe cualquier filtro
// por fecha. Mismo criterio que en `types/runs.ts`.
//
// `rating` y `themes` están desnormalizados (también viven en `puzzles`) para
// que el modal de inicio calcule ELO mín/med/máx sin JOIN: es la consulta que
// se dispara cada vez que fallas un puzle, y así cuesta microsegundos.
const CREATE_SQL = `
  CREATE TABLE IF NOT EXISTS ${TABLE} (
    puzzle_id      TEXT PRIMARY KEY,
    rating         INTEGER NOT NULL DEFAULT 0,
    themes         TEXT    NOT NULL DEFAULT '',
    reason         INTEGER NOT NULL DEFAULT 3,
    fail_count     INTEGER NOT NULL DEFAULT 0,
    review_count   INTEGER NOT NULL DEFAULT 0,
    added_at       INTEGER NOT NULL,
    last_review_at INTEGER NOT NULL DEFAULT 0,
    due_at         INTEGER NOT NULL DEFAULT 0
  );
`;

// `due_at` es la clave de orden de la sesión y el gancho para la repetición
// espaciada del futuro: hoy vale "cuándo entró / cuándo lo repasaste por
// última vez", pero un día puede valer "no me lo enseñes hasta dentro de 3
// días" sin migrar nada.
export const setupRepasoTable = async (db: SQLite.SQLiteDatabase) => {
  await db.execAsync(CREATE_SQL);
  await db.execAsync(
    `CREATE INDEX IF NOT EXISTS idx_${TABLE}_due ON ${TABLE} (due_at, added_at);`
  );
};

// =========================================================
// ENTRADA EN LA COLA
// =========================================================
// UPSERT: si el puzle ya estaba, no duplicamos. El motivo sólo puede SUBIR
// (MAX): si un día pediste pista y otro lo fallaste, se queda en 'fail'.
//
// `due_at` NO se toca en el conflicto a propósito: volver a fallar un puzle que
// ya estaba en la cola lo hace más urgente, no menos, así que conserva su
// posición original en el orden "antiguos primero".
export const enqueueRepaso = async (
  db: SQLite.SQLiteDatabase,
  puzzle: { id: string; rating: number; themes: string },
  reason: RepasoReason
): Promise<void> => {
  const now = Date.now();
  const rank = REPASO_REASON[reason];

  await db.runAsync(
    `INSERT INTO ${TABLE}
       (puzzle_id, rating, themes, reason, fail_count, review_count, added_at, last_review_at, due_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?)
     ON CONFLICT(puzzle_id) DO UPDATE SET
       reason     = MAX(reason, excluded.reason),
       fail_count = fail_count + excluded.fail_count,
       rating     = excluded.rating,
       themes     = excluded.themes`,
    [
      String(puzzle.id),
      Number(puzzle.rating) || 0,
      puzzle.themes ?? '',
      rank,
      rank === REPASO_REASON.fail ? 1 : 0,
      now,
      now,
    ]
  );
};

// =========================================================
// RESULTADO DE UN REPASO
// =========================================================
// Acierto: fuera de la cola. Es la única forma de sacar un puzle de aquí.
export const clearFromRepaso = (db: SQLite.SQLiteDatabase, puzzleId: string) =>
  db.runAsync(`DELETE FROM ${TABLE} WHERE puzzle_id = ?`, [String(puzzleId)]);

// Fallo (o resuelto con pista/solución): se queda. `due_at = now` lo manda al
// final de la cola, así que en la próxima sesión no te sale el primero.
export const markRepasoFailed = (db: SQLite.SQLiteDatabase, puzzleId: string) => {
  const now = Date.now();
  return db.runAsync(
    `UPDATE ${TABLE}
        SET fail_count     = fail_count + 1,
            review_count   = review_count + 1,
            last_review_at = ?,
            due_at         = ?
      WHERE puzzle_id = ?`,
    [now, now, String(puzzleId)]
  );
};

// Saltado sin contestar: no cuenta como fallo (no sube fail_count), pero sí
// pasa al final para no bloquear la cola con el mismo puzle.
export const markRepasoSkipped = (db: SQLite.SQLiteDatabase, puzzleId: string) => {
  const now = Date.now();
  return db.runAsync(
    `UPDATE ${TABLE}
        SET last_review_at = ?,
            due_at         = ?
      WHERE puzzle_id = ?`,
    [now, now, String(puzzleId)]
  );
};

// =========================================================
// LECTURA
// =========================================================
interface StatsRow {
  count: number;
  minRating: number;
  maxRating: number;
  avgRating: number;
  oldestAt: number;
  hint: number;
  solution: number;
  fail: number;
}

// Sobre una tabla vacía MIN/MAX/AVG/SUM devuelven NULL, de ahí los COALESCE.
export const getRepasoStats = async (
  db: SQLite.SQLiteDatabase
): Promise<RepasoStats> => {
  const row = await db.getFirstAsync<StatsRow>(
    `SELECT
       COUNT(*)                                                    AS count,
       COALESCE(MIN(rating), 0)                                    AS minRating,
       COALESCE(MAX(rating), 0)                                    AS maxRating,
       COALESCE(CAST(ROUND(AVG(rating)) AS INTEGER), 0)            AS avgRating,
       COALESCE(MIN(added_at), 0)                                  AS oldestAt,
       COALESCE(SUM(CASE WHEN reason = 1 THEN 1 ELSE 0 END), 0)    AS hint,
       COALESCE(SUM(CASE WHEN reason = 2 THEN 1 ELSE 0 END), 0)    AS solution,
       COALESCE(SUM(CASE WHEN reason = 3 THEN 1 ELSE 0 END), 0)    AS fail
     FROM ${TABLE}`
  );

  if (!row) return EMPTY_REPASO_STATS;

  return {
    count: row.count,
    minRating: row.minRating,
    maxRating: row.maxRating,
    avgRating: row.avgRating,
    byReason: { hint: row.hint, solution: row.solution, fail: row.fail },
    oldestAt: row.oldestAt > 0 ? row.oldestAt : null,
  };
};

// ORDER BY RANDOM() aquí SÍ vale: la tabla que manda es review_queue (decenas
// de filas), no `puzzles` (100k). El JOIN va por PRIMARY KEY. Medido sobre la
// BD real: <1 ms en los tres órdenes.
const ORDER_SQL: Record<RepasoOrder, string> = {
  oldest: 'q.due_at ASC, q.added_at ASC',
  random: 'RANDOM()',
  hardest: 'q.rating DESC, q.due_at ASC',
};

// JOIN (no LEFT JOIN) a propósito: si un puzle de la cola ya no existe en
// `puzzles` simplemente no se sirve. No debería pasar nunca —los ids salen de
// esa misma tabla— pero así una BD rara no revienta la sesión.
export const getRepasoBatch = async (
  db: SQLite.SQLiteDatabase,
  order: RepasoOrder,
  limit: number
): Promise<Puzzle[]> => {
  const rows = await db.getAllAsync<any>(
    `SELECT p.id AS id, p.fen AS fen, p.solution AS solution,
            p.rating AS rating, p.themes AS themes
       FROM ${TABLE} q
       JOIN puzzles p ON p.id = q.puzzle_id
      ORDER BY ${ORDER_SQL[order]}
      LIMIT ?`,
    [limit]
  );

  return rows.map((r) => ({
    id: String(r.id),
    fen: r.fen,
    solution: String(r.solution ?? '').split(' ').filter(Boolean),
    rating: Number(r.rating) || 0,
    themes: r.themes ?? '',
  }));
};

// Para un botón de "vaciar repaso" en ajustes, si algún día lo quieres.
export const clearRepasoQueue = (db: SQLite.SQLiteDatabase) =>
  db.runAsync(`DELETE FROM ${TABLE}`);
