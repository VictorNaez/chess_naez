import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import type { Puzzle } from '../types/puzzle';

const DB_NAME = 'puzzles_v2.db';

export const openPuzzleDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  const dbUri = `${FileSystem.documentDirectory}SQLite/${DB_NAME}`;

  if (!(await FileSystem.getInfoAsync(dbUri)).exists) {
    await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}SQLite`, { intermediates: true });
    const asset = await Asset.fromModule(require('../../assets/puzzles_v2.db')).downloadAsync();
    if (asset.localUri) {
      await FileSystem.copyAsync({ from: asset.localUri, to: dbUri });
    }
  }

  const database = await SQLite.openDatabaseAsync(DB_NAME);

  // Índice sobre rating: sin esto, cada carga de puzzle hace un full table scan
  // de las ~100k filas. IF NOT EXISTS lo hace idempotente y gratis en aperturas
  // posteriores una vez creado. Esto cubre tanto instalaciones nuevas como
  // usuarios ya existentes, cuya .db en disco nunca se sobreescribe con el asset.
  await database.execAsync(`CREATE INDEX IF NOT EXISTS idx_puzzles_rating ON puzzles(rating);`);

  return database;
};

let cachedMaxRowid: number | null = null;

export const getMaxRowid = async (db: SQLite.SQLiteDatabase): Promise<number> => {
  if (cachedMaxRowid !== null) return cachedMaxRowid;
  const row = await db.getFirstAsync<{ maxId: number }>('SELECT MAX(rowid) as maxId FROM puzzles');
  cachedMaxRowid = row?.maxId ?? 1;
  return cachedMaxRowid;
};

// Recupera un puzle concreto por su id. Lo usan el repaso post-partida
// (contrarreloj / supervivencia) y cualquier sitio que guarde solo el id.
// El id se prueba como texto y como número: según la columna, SQLite compara
// '12345' con 12345 sin coincidencia.
export const getPuzzleById = async (
  db: SQLite.SQLiteDatabase,
  id: string | number,
): Promise<Puzzle | null> => {
  let row = await db.getFirstAsync<any>('SELECT * FROM puzzles WHERE id = ?', [String(id)]);

  if (!row) {
    const numericId = Number(id);
    if (!Number.isNaN(numericId)) {
      row = await db.getFirstAsync<any>('SELECT * FROM puzzles WHERE id = ?', [numericId]);
    }
  }

  if (!row) return null;

  return {
    id: String(row.ID ?? row.id),
    fen: row.FEN ?? row.fen,
    solution: String(row.SOLUTION ?? row.solution).split(' '),
    rating: Number(row.RATING ?? row.rating),
    themes: row.themes ?? '',
  };
};
