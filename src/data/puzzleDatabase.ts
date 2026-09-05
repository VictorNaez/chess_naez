import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';

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