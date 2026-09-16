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
// la excepción: SIEMPRE apunta a main salvo que lleve prefijo.
//
// ORDEN DE ARRANQUE. Es lo único delicado de este fichero:
//   1. abrir progress.db          -> necesitamos conexión para lo demás
//   2. crear app_meta             -> ahí vive la versión del catálogo
//   3. leer la versión instalada
//   4. copiar el asset si procede -> ANTES de adjuntar, nunca con la base abierta
//   5. adjuntar e indexar
// Invertir 2 y 3 fue el bug del "no such table: app_meta": app_meta la creaba
// ensureSchema, que corre en un efecto posterior. Y leer la versión sin
// conexión hacía que el catálogo se recopiara (12 MB) en cada arranque.
const CATALOG_DB = 'puzzles_v2.db';
const PROGRESS_DB = 'progress.db';
const SQLITE_DIR = `${FileSystem.documentDirectory}SQLite`;

// Súbela cuando publiques un catálogo nuevo: al no arrastrar ya el progreso,
// el asset se puede sobrescribir sin miedo.
const CATALOG_VERSION = 1;
const CATALOG_VERSION_KEY = 'catalog_version';

// ATTACH quiere una ruta del sistema de ficheros, no una URI file://.
const catalogPath = () => `${SQLITE_DIR}/${CATALOG_DB}`.replace('file://', '');

// =========================================================
// UNA CONEXIÓN POR PROCESO, NO POR MONTAJE
// =========================================================
// Android puede destruir y recrear la Activity sin matar el proceso: al
// maximizar una ventana flotante en tablet, al cambiar el tamaño de fuente del
// sistema... React Native vuelve a montar la app en el MISMO runtime de JS, así
// que el arranque se ejecuta dos veces. Y expo-sqlite cachea las conexiones por
// nombre (useNewConnection = false por defecto): el segundo openDatabaseAsync
// devuelve la conexión nativa del primero, con el catálogo aún adjuntado, y el
// ATTACH revienta con "database catalog is already in use".
//
// Por eso la apertura se comparte a nivel de módulo: todos los montajes reciben
// la misma promesa. Si falla, se olvida, para que "Reintentar" vuelva a probar.
let openPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// Handle crudo en cuanto existe, aunque el arranque falle después. El reset lo
// necesita: si el fallo fue a mitad de openPuzzleDatabase, index.tsx nunca
// llegó a recibir el db y le pasa null, pero la conexión nativa sigue abierta.
let rawConnection: SQLite.SQLiteDatabase | null = null;

const isCatalogAttached = async (db: SQLite.SQLiteDatabase): Promise<boolean> => {
  const rows = await db.getAllAsync<{ name: string }>('PRAGMA database_list');
  return rows.some(r => r.name === 'catalog');
};

const attachCatalog = async (db: SQLite.SQLiteDatabase) => {
  // Idempotente: un reintento tras un fallo posterior al ATTACH llega aquí con
  // la misma conexión cacheada y el alias ya ocupado.
  if (!(await isCatalogAttached(db))) {
    await db.runAsync('ATTACH DATABASE ? AS catalog', [catalogPath()]);
  }

  // El prefijo `catalog.` es obligatorio: sin él, SQLite intenta crear el
  // índice en main y falla con "no such table: main.puzzles". Los SELECT sí
  // caen en cascada a la base adjunta, el DDL no.
  await db.execAsync(
    'CREATE INDEX IF NOT EXISTS catalog.idx_puzzles_rating ON puzzles(rating);',
  );
};

export const openPuzzleDatabase = (): Promise<SQLite.SQLiteDatabase> => {
  if (!openPromise) {
    openPromise = openPuzzleDatabaseOnce().catch((err: unknown) => {
      openPromise = null;
      throw err;
    });
  }
  return openPromise;
};

const openPuzzleDatabaseOnce = async (): Promise<SQLite.SQLiteDatabase> => {
  if (__DEV__) {
  const p = await FileSystem.getInfoAsync(`${SQLITE_DIR}/${PROGRESS_DB}`);
  const c = await FileSystem.getInfoAsync(`${SQLITE_DIR}/${CATALOG_DB}`);
  console.log('[DB] arranque -> progress:', p.exists ? `${p.size} B` : 'NO',
              '| catalog:', c.exists ? `${c.size} B` : 'NO');
}
  // 1. expo-sqlite crea progress.db vacío si no existe. En una instalación
  // limpia sin copia de seguridad eso es justo lo que queremos: las tablas de
  // progreso las montan después ensureSchema / setupRunTables / setupRepasoTable.
  // Si Android restauró un progress.db de la instalación anterior, se abre tal
  // cual y no hace falta ni una línea de código de restauración.
  const database = await SQLite.openDatabaseAsync(PROGRESS_DB);
  rawConnection = database;

  // Los PRAGMA son POR BASE. Estos caen sobre main, o sea progress.db, que es
  // donde va el 100% de las escrituras. El catálogo solo se lee y le da igual.
  // Bonus del reparto: el WAL y los fsync operan sobre un fichero de pocos MB
  // en vez de sobre uno de 12.
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
  `);

  // 2. app_meta antes que nadie. ensureSchema la vuelve a declarar más tarde
  // con IF NOT EXISTS, así que duplicarla aquí no cuesta nada y rompe la
  // dependencia de orden con el efecto de userProgress.
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // 3 y 4. Versión instalada contra versión del bundle.
  const catalogUri = `${SQLITE_DIR}/${CATALOG_DB}`;
  const catalogExists = (await FileSystem.getInfoAsync(catalogUri)).exists;

  const versionRow = await database.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_meta WHERE key = ?',
    [CATALOG_VERSION_KEY],
  );
  const installed = Number(versionRow?.value ?? 0);

  if (!catalogExists || installed < CATALOG_VERSION) {
    // Una conexión cacheada de un montaje anterior podría tener el catálogo
    // adjuntado: soltarlo antes de sobrescribir el fichero.
    if (await isCatalogAttached(database)) {
      await database.execAsync('DETACH DATABASE catalog;');
    }
    await FileSystem.makeDirectoryAsync(SQLITE_DIR, { intermediates: true });
    const asset = await Asset.fromModule(require('../../assets/puzzles_v2.db')).downloadAsync();
    if (asset.localUri) {
      // copyAsync sobrescribe. Se hace con el catálogo SIN adjuntar: cambiar el
      // fichero por debajo de una conexión abierta es corrupción asegurada.
      await FileSystem.copyAsync({ from: asset.localUri, to: catalogUri });
    }
    await database.runAsync(
      'INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)',
      [CATALOG_VERSION_KEY, String(CATALOG_VERSION)],
    );
    cachedMaxRowid = null; // el catálogo nuevo puede tener otro número de filas
    if (__DEV__) console.log('[DB] catálogo provisionado ->', CATALOG_VERSION);
  }

  // 5.
  await attachCatalog(database);

  if (__DEV__) {
    const mode = await database.getFirstAsync<{ journal_mode: string }>('PRAGMA main.journal_mode');
    const count = await database.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM puzzles');
    console.log('[DB] progress journal_mode =', mode?.journal_mode, '| puzzles =', count?.n);
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

let cachedMaxRowid: number | null = null;

// Válvula de escape de la pantalla de error fatal. Borra SOLO el progreso: el
// catálogo se queda donde está, pero como `catalog_version` vive en app_meta
// (dentro de progress.db), al siguiente arranque `installed` vuelve a ser 0 y
// openPuzzleDatabase recopia el asset por encima. Un solo borrado arregla
// tanto un progress.db corrupto como un catálogo a medio copiar.
//
// El -wal y el -shm se borran a mano: deleteDatabaseAsync no siempre los
// arrastra si la conexión murió de forma sucia, y dejar un -wal huérfano junto
// a un .db nuevo es corrupción garantizada en el siguiente ATTACH.
export const resetProgressDatabase = async (
  db?: SQLite.SQLiteDatabase | null,
): Promise<void> => {
  // Cerrar primero: borrar el fichero por debajo de una conexión abierta deja a
  // SQLite escribiendo en un inode fantasma. Si el arranque falló a medias,
  // quien llama no tiene el handle (db = null) pero la conexión nativa existe:
  // se usa la que guardamos al abrir. Cerrarla también la saca de la caché de
  // expo-sqlite, así que el siguiente arranque abre una conexión limpia.
  const handles = new Set([db, rawConnection].filter((h): h is SQLite.SQLiteDatabase => !!h));
  for (const handle of handles) {
    try { await handle.closeAsync(); } catch { /* ya estaba cerrada o nunca se abrió */ }
  }
  rawConnection = null;
  openPromise = null;

  try {
    await SQLite.deleteDatabaseAsync(PROGRESS_DB);
  } catch {
    // Si la API nativa se queja (handle abierto en otro sitio, fichero a
    // medias), vamos al sistema de ficheros directamente.
  }

  for (const suffix of ['', '-wal', '-shm']) {
    await FileSystem
      .deleteAsync(`${SQLITE_DIR}/${PROGRESS_DB}${suffix}`, { idempotent: true })
      .catch(() => {});
  }

  cachedMaxRowid = null;
};

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
