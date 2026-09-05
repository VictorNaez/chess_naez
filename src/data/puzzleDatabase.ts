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

  return SQLite.openDatabaseAsync(DB_NAME);
};