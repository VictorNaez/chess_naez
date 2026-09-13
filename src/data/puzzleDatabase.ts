import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import type { Puzzle } from '../types/puzzle';

// =========================================================
// DOS FICHEROS, UNA CONEXIÓN
// =========================================================
//   progress.db      -> main. Todo lo del jugador. Lo escribe la app, lo
//                       respalda Android, no lo toca nunca un release.
//   puzzles_v2.db    -> adjunta como `catalog`. Copia del asset, solo lectura.
//                       Al no haber progreso dentro, se puede reemplazar por
//                       una versión nueva en cualquier release.
//
// SQLite resuelve los nombres sin cualificar buscando primero en main y luego
// en las bases adjuntas, así que los JOIN de statsQueries y repasoQueue entre
// elo_history/review_queue y puzzles siguen funcionando sin cambios. El DDL es
// la excepción: SIEMPRE apunta a main salvo que lleve prefijo (ver más abajo).
const CATALOG_DB = 'puzzles_v2.db';
const PROGRESS_DB = 'progress.db';
const SQLITE_DIR = `${FileSystem.documentDirectory}SQLite`;

// Súbela cuando publiques un catálogo nuevo: al no arrastrar ya el progreso,
// el asset se puede sobrescribir sin miedo.
const CATALOG_VERSION = 1;
const CATALOG_VERSION_KEY = 'catalog_version';

const provisionCatalog = async (db: SQLite.SQLiteDatabase | null) => {
  const catalogUri = `${SQLITE_DIR}/${CATALOG_DB}`;
  const exists = (await FileSystem.getInfoAsync(catalogUri)).exists;

  // db es null en el primer arranque: aún no hay conexión con la que leer la
  // versión instalada, pero tampoco hace falta, porque no hay fichero.
  let installed = 0;
  if (exists && db) {
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM app_meta WHERE key = ?',
      [CATALOG_VERSION_KEY],
    );
    installed = Number(row?.value ?? 0);
  }

  if (exists && installed >= CATALOG_VERSION) return false;

  await FileSystem.makeDirectoryAsync(SQLITE_DIR, { intermediates: true });
  const asset = await Asset.fromModule(require('../../assets/puzzles_v2.db')).downloadAsync();
  if (asset.localUri) {
    // copyAsync sobrescribe. El catálogo viejo se va entero, índice incluido:
    // el CREATE INDEX de abajo lo reconstruye.
    await FileSystem.copyAsync({ from: asset.localUri, to: catalogUri });
  }
  return true;
};

export const openPuzzleDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  await provisionCatalog(null);

  // expo-sqlite crea progress.db vacío si no existe. En una instalación limpia
  // sin copia de seguridad eso es exactamente lo que queremos: las tablas las
  // montan después ensureSchema / setupRunTables / setupRepasoTable.
  // Si Android restauró un progress.db de la instalación anterior, se abre tal
  // cual y no hace falta ni una línea de código de restauración.
  const database = await SQLite.openDatabaseAsync(PROGRESS_DB);

  // ATTACH quiere una ruta del sistema de ficheros, no una URI file://.
  // Va por runAsync y no execAsync para no interpolar la ruta en el SQL.
  await database.runAsync('ATTACH DATABASE ? AS catalog', [
    `${SQLITE_DIR}/${CATALOG_DB}`.replace('file://', ''),
  ]);

  // El prefijo `catalog.` es obligatorio: sin él, SQLite intenta crear el
  // índice en main y falla con "no such table: main.puzzles". Los SELECT sí
  // caen en cascada a la base adjunta, el DDL no.
  await database.execAsync(
    'CREATE INDEX IF NOT EXISTS catalog.idx_puzzles_rating ON puzzles(rating);',
  );

  // Los PRAGMA son POR BASE. Estos caen sobre main, o sea progress.db, que es
  // donde va el 100% de las escrituras. El catálogo solo se lee y le da igual.
  // Bonus del reparto: el WAL y los fsync ahora operan sobre un fichero de
  // pocos MB en vez de sobre uno de 12.
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
  `);

  if (__DEV__) {
    const mode = await database.getFirstAsync<{ journal_mode: string }>('PRAGMA main.journal_mode');
    console.log('[DB] progress journal_mode =', mode?.journal_mode);
  }

  return database;
};

// Llamar cuando la app pase a segundo plano. Android hace la copia con la app
// ya cerrada: si el WAL tiene transacciones sin volcar y solo se respaldara el
// .db, se perderían. TRUNCATE deja el .db completo por sí solo y el -wal a cero.
export const checkpointProgress = async (db: SQLite.SQLiteDatabase) => {
  try {
    await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch (error) {
    console.warn('[DB] checkpoint fallido:', error);
  }
};

// Reemplaza el catálogo si el asset del bundle es más nuevo que el instalado.
// Se llama DESPUÉS de que exista la conexión, porque la versión vive en
// app_meta, que está en progress.db.
export const syncCatalogVersion = async (db: SQLite.SQLiteDatabase) => {
  const replaced = await provisionCatalog(db);
  if (!replaced) return false;

  // Reabrir la adjunta para que la conexión vea el fichero nuevo.
  await db.execAsync('DETACH DATABASE catalog;');
  await db.runAsync('ATTACH DATABASE ? AS catalog', [
    `${SQLITE_DIR}/${CATALOG_DB}`.replace('file://', ''),
  ]);
  await db.execAsync(
    'CREATE INDEX IF NOT EXISTS catalog.idx_puzzles_rating ON puzzles(rating);',
  );
  await db.runAsync('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)', [
    CATALOG_VERSION_KEY,
    String(CATALOG_VERSION),
  ]);

  cachedMaxRowid = null; // el catálogo nuevo tiene otro número de filas
  return true;
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
