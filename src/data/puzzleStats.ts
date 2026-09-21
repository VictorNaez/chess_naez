import * as SQLite from 'expo-sqlite';
import { themeFilter } from '../lib/puzzleQueries';

// =========================================================
// CONTADORES POR PUZLE
// =========================================================
// Una fila por puzle DISTINTO que el jugador ha jugado en modo normal, no una
// por intento (eso ya lo guarda elo_history). Sirve para dos cosas:
//   - no volver a proponer puzles ya resueltos (UNSOLVED_FILTER)
//   - saber cuántas veces se ha resuelto / fallado cada uno sin agregar
//     sobre elo_history
//
// Vive en progress.db, NO en el catálogo: es dato del jugador, se respalda con
// Android y sobrevive a cualquier cambio de catálogo.
//
// La clave es el PuzzleId de Lichess, nunca el rowid: el rowid se reasigna cada
// vez que se regenera el catálogo (v2 -> v3 ya lo hizo), el id de Lichess no.
// Si un catálogo futuro quita un puzle, su fila se queda huérfana: ocupa unos
// bytes y el NOT EXISTS no la encuentra nunca. No hace falta limpiarla.
//
// WITHOUT ROWID porque la única forma de acceder es por puzzle_id: la tabla
// ES el índice y cada búsqueda es un solo descenso de B-tree.
//
// `last_at` en epoch ms, mismo criterio que runs y review_queue.
const TABLE = 'puzzle_stats';

export const setupPuzzleStatsTable = async (db: SQLite.SQLiteDatabase) => {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      puzzle_id TEXT PRIMARY KEY,
      solved    INTEGER NOT NULL DEFAULT 0,
      failed    INTEGER NOT NULL DEFAULT 0,
      last_at   INTEGER NOT NULL DEFAULT 0
    ) WITHOUT ROWID;
  `);
};

// Pensada para llamarse DENTRO de la transacción de saveResolvedPuzzle: o se
// guarda el intento en elo_history y el contador, o ninguno de los dos.
export const recordPuzzleResult = async (
  db: SQLite.SQLiteDatabase,
  puzzleId: string,
  isSuccess: boolean,
): Promise<void> => {
  const s = isSuccess ? 1 : 0;
  await db.runAsync(
    `INSERT INTO ${TABLE} (puzzle_id, solved, failed, last_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(puzzle_id) DO UPDATE SET
       solved  = solved + excluded.solved,
       failed  = failed + excluded.failed,
       last_at = excluded.last_at`,
    [puzzleId, s, 1 - s, Date.now()],
  );
};

export const clearPuzzleStats = async (db: SQLite.SQLiteDatabase) => {
  await db.runAsync(`DELETE FROM ${TABLE}`);
};

// Fragmento para añadir al WHERE de una consulta sobre `puzzles`. Excluye los
// resueltos al menos una vez; los fallados sin resolver siguen saliendo.
//
// No rompe el seek por rowid: el plan sigue siendo
//   SEARCH puzzles USING INTEGER PRIMARY KEY (rowid>?)
//   + CORRELATED SCALAR SUBQUERY -> SEARCH s USING PRIMARY KEY (puzzle_id=?)
// Medido sobre el catálogo de 500k, banda 1450-1550 (26.766 puzles):
//   0 resueltos -> 0,013 ms | 74% de la banda -> 0,021 ms | 99% -> 0,20 ms
// frente a 0,010 ms sin el filtro.
export const UNSOLVED_FILTER =
  `AND NOT EXISTS (SELECT 1 FROM ${TABLE} s WHERE s.puzzle_id = puzzles.id AND s.solved > 0)`;

// Cuántos puzles del filtro ha resuelto ya el jugador (contador del FilterModal).
//
// El CROSS JOIN NO es decorativo: fija el orden del join. Así SQLite recorre
// puzzle_stats (lo que ha jugado este usuario, miles de filas como mucho) y
// busca cada una en el catálogo por su clave. Con un JOIN normal el planificador
// prefería recorrer el catálogo por idx_puzzles_rating y buscar en puzzle_stats
// desde ahí. Medido sobre el catálogo de 500k, rango 400-3400:
//   JOIN       -> 560-740 ms, con 0 o con 30.000 puzles jugados
//   CROSS JOIN -> 0,01 ms con 0 | 1,2 ms con 1.000 | 8,6 ms con 10.000 | 20 ms con 30.000
// El coste escala con lo jugado, no con el catálogo ni con la anchura del rango.
export const countSolvedPuzzles = async (
  db: SQLite.SQLiteDatabase,
  range: readonly [number, number] | number[],
  themes: readonly string[],
): Promise<number> => {
  if (range[1] < range[0]) return 0;
  const f = themeFilter(themes);
  const r = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n
       FROM ${TABLE} s CROSS JOIN puzzles p ON p.id = s.puzzle_id
      WHERE s.solved > 0 AND p.rating BETWEEN ? AND ? ${f.sql}`,
    [range[0], range[1], ...f.params],
  );
  return r?.n ?? 0;
};
