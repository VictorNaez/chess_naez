import * as SQLite from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';

// =========================================================
// CONSTANTES
// =========================================================
const DEFAULT_ELO = 1200;
const MIN_ELO = 100;      // suelo: por debajo de esto el rating deja de tener sentido
const K_FACTOR = 16;      // peso del ajuste por intento
const MIN_ELO_STEP = 5;   // el resultado siempre tiene que moverse de forma visible

// Columnas que se añadieron después del primer release. Las DB que ya estaban
// en dispositivos no se sobreescriben nunca, así que hay que parchearlas en
// caliente. El ALTER falla si la columna ya existe: ese error es el caso normal.
const LEGACY_COLUMNS = [
  'puzzle_elo INTEGER DEFAULT 0',
  'elo_change INTEGER DEFAULT 0',
  'is_success INTEGER DEFAULT 1',
  'puzzleID TEXT',
  'solve_ms INTEGER DEFAULT 0',
  // DEFAULT NULL a propósito: los intentos anteriores a que existiera el modo
  // aparecen como "sin clasificar" en las estadísticas, no como manuales.
  'is_recommended INTEGER DEFAULT NULL',
];

// Marca de migración ya aplicada. Vive en app_meta para que la limpieza corra
// una sola vez por dispositivo en lugar de en cada arranque.
const DEDUP_FLAG = 'dedup_elo_history_v1';

// =========================================================
// HELPERS
// =========================================================

// Cuenta aciertos consecutivos desde el más reciente (rows viene ordenado DESC
// por id) hasta el primer fallo. Solo intentos reales (puzzleID no nulo).
const computeStreakFromRows = (rows: { is_success: number }[]) => {
  let streak = 0;
  for (const row of rows) {
    if (row.is_success === 1) streak++;
    else break;
  }
  return streak;
};

const ensureSchema = async (db: SQLite.SQLiteDatabase) => {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS user_progress (
      theme_id TEXT PRIMARY KEY,
      elo INTEGER DEFAULT ${DEFAULT_ELO},
      solved_count INTEGER DEFAULT 0,
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS elo_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      elo INTEGER NOT NULL,
      puzzle_elo INTEGER DEFAULT 0,
      elo_change INTEGER DEFAULT 0,
      is_success INTEGER DEFAULT 1,
      puzzleID TEXT,
      solve_ms INTEGER DEFAULT 0,
      is_recommended INTEGER DEFAULT NULL,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  for (const column of LEGACY_COLUMNS) {
    try {
      await db.execAsync(`ALTER TABLE elo_history ADD COLUMN ${column};`);
    } catch {
      // La columna ya existía. Es el camino habitual, no hay nada que hacer.
    }
  }

  // statsQueries filtra por timestamp en todas sus consultas y el repaso futuro
  // buscará por puzzleID. Sin índices son dos escaneos completos del historial.
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_elo_history_ts ON elo_history(timestamp);
    CREATE INDEX IF NOT EXISTS idx_elo_history_puzzle ON elo_history(puzzleID);
  `);
};

// Limpia los intentos que quedaron duplicados por el doble INSERT que hacía
// saveResolvedPuzzle. Los dos INSERT eran consecutivos (id y id+1, la tabla es
// AUTOINCREMENT y el cerrojo impide intercalados) y solo se diferenciaban en
// is_recommended, así que emparejamos por adyacencia + igualdad de valores y
// nos quedamos con la segunda fila, que es la que sí trae el modo.
const dedupeEloHistory = async (db: SQLite.SQLiteDatabase): Promise<number> => {
  const alreadyDone = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_meta WHERE key = ?',
    [DEDUP_FLAG]
  );
  if (alreadyDone) return 0;

  const result = await db.runAsync(`
    DELETE FROM elo_history
    WHERE id IN (
      SELECT a.id
      FROM elo_history a
      JOIN elo_history b ON b.id = a.id + 1
      WHERE a.puzzleID IS NOT NULL
        AND a.puzzleID = b.puzzleID
        AND IFNULL(a.elo, 0)        = IFNULL(b.elo, 0)
        AND IFNULL(a.puzzle_elo, 0) = IFNULL(b.puzzle_elo, 0)
        AND IFNULL(a.elo_change, 0) = IFNULL(b.elo_change, 0)
        AND IFNULL(a.is_success, 1) = IFNULL(b.is_success, 1)
        AND IFNULL(a.solve_ms, 0)   = IFNULL(b.solve_ms, 0)
    );
  `);

  await db.runAsync(
    'INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)',
    [DEDUP_FLAG, String(Date.now())]
  );

  if (result.changes > 0) {
    console.log(`[userProgress] Historial deduplicado: ${result.changes} filas eliminadas`);
  }
  return result.changes;
};

// =========================================================
// HOOK
// =========================================================
export const userProgress = (db: SQLite.SQLiteDatabase | null) => {
  const [userRatings, setUserRatings] = useState<Record<string, number>>({});
  const [currentStreak, setCurrentStreak] = useState(0);
  const [isLocked, setIsLocked] = useState(false);

  // El cerrojo real es la ref. El estado solo existe para quien quiera pintarlo:
  // dos llamadas seguidas dentro del mismo render leerían el mismo `isLocked`
  // en false y las dos entrarían, que es justo lo que el cerrojo debe impedir.
  const lockRef = useRef(false);

  // ---------------------------------------------------------
  // 1. INICIALIZACIÓN: esquema, migraciones y carga en memoria
  // ---------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    const setupProgress = async () => {
      if (!db) return;
      try {
        await ensureSchema(db);
        await dedupeEloHistory(db);

        await db.runAsync(
          `INSERT OR IGNORE INTO user_progress (theme_id, elo) VALUES ('global', ?)`,
          [DEFAULT_ELO]
        );

        // Punto de partida del gráfico. Solo si el historial está vacío del todo.
        const seed = await db.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) as count FROM elo_history'
        );
        if ((seed?.count ?? 0) === 0) {
          await db.runAsync(
            'INSERT INTO elo_history (elo, puzzle_elo, elo_change, is_success) VALUES (?, 0, 0, 1)',
            [DEFAULT_ELO]
          );
        }

        const allProgress = await db.getAllAsync<{ theme_id: string; elo: number }>(
          'SELECT theme_id, elo FROM user_progress'
        );

        const streakRows = await db.getAllAsync<{ is_success: number }>(
          'SELECT is_success FROM elo_history WHERE puzzleID IS NOT NULL ORDER BY id DESC LIMIT 200'
        );

        if (cancelled) return;

        const ratingsMap: Record<string, number> = {};
        allProgress.forEach(row => { ratingsMap[row.theme_id] = row.elo; });
        setUserRatings(ratingsMap);
        setCurrentStreak(computeStreakFromRows(streakRows));
      } catch (error) {
        console.error('[userProgress] Error al inicializar las tablas de progreso:', error);
      }
    };

    setupProgress();
    return () => { cancelled = true; };
  }, [db]);

  // ---------------------------------------------------------
  // 2. GUARDAR PUZLE RESUELTO
  // ---------------------------------------------------------
  const saveResolvedPuzzle = useCallback(async (
    puzzleId: string,
    themeList: string[],
    isSuccess: boolean,
    puzzleElo: number,
    solveMs: number = 0,
    isRecommendedMode: boolean = false,
  ): Promise<number> => {
    if (!db || lockRef.current) return 0;
    lockRef.current = true;
    setIsLocked(true);

    try {
      const themes = Array.from(new Set(
        themeList.map(t => t.trim()).filter(Boolean)
      ));

      // Los ratings se leen de SQLite, no de userRatings: el estado de React es
      // una caché que puede ir un render por detrás, y dos puzles resueltos
      // seguidos partirían del mismo ELO viejo.
      const placeholders = themes.map(() => '?').join(',');
      const rows = await db.getAllAsync<{ theme_id: string; elo: number }>(
        `SELECT theme_id, elo FROM user_progress
         WHERE theme_id = 'global'${themes.length ? ` OR theme_id IN (${placeholders})` : ''}`,
        themes
      );

      const current: Record<string, number> = {};
      rows.forEach(row => { current[row.theme_id] = row.elo; });

      // --- Fórmula de expectativa tipo Elo ---
      const oldGlobalElo = current['global'] ?? DEFAULT_ELO;
      const expectedScore = 1 / (1 + Math.pow(10, (puzzleElo - oldGlobalElo) / 400));
      const actualScore = isSuccess ? 1 : 0;

      let eloVariation = Math.round(K_FACTOR * (actualScore - expectedScore));

      // Suelo de movimiento: acertar nunca da menos de +5 ni fallar menos de -5.
      if (isSuccess) eloVariation = Math.max(MIN_ELO_STEP, eloVariation);
      else eloVariation = Math.min(-MIN_ELO_STEP, eloVariation);

      const newGlobalElo = Math.max(MIN_ELO, oldGlobalElo + eloVariation);

      const nextRatings: Record<string, number> = { global: newGlobalElo };
      for (const themeId of themes) {
        const base = current[themeId] ?? DEFAULT_ELO;
        nextRatings[themeId] = Math.max(MIN_ELO, base + eloVariation);
      }

      // Una transacción: o se escribe el rating global, los temas y el historial,
      // o no se escribe nada. Antes un fallo a mitad dejaba el ELO subido sin
      // fila en el historial, o al revés.
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `INSERT INTO user_progress (theme_id, elo, solved_count) VALUES ('global', ?, 1)
           ON CONFLICT(theme_id) DO UPDATE SET
             elo = excluded.elo,
             solved_count = solved_count + 1,
             last_updated = CURRENT_TIMESTAMP`,
          [newGlobalElo]
        );

        for (const themeId of themes) {
          await db.runAsync(
            `INSERT INTO user_progress (theme_id, elo, solved_count) VALUES (?, ?, 1)
             ON CONFLICT(theme_id) DO UPDATE SET
               elo = excluded.elo,
               solved_count = solved_count + 1,
               last_updated = CURRENT_TIMESTAMP`,
            [themeId, nextRatings[themeId]]
          );
        }

        // UN SOLO INSERT en el historial. Aquí había dos.
        await db.runAsync(
          `INSERT INTO elo_history
             (elo, puzzle_elo, elo_change, is_success, puzzleID, solve_ms, is_recommended)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            newGlobalElo,
            puzzleElo,
            eloVariation,
            isSuccess ? 1 : 0,
            puzzleId,
            Math.round(solveMs),
            isRecommendedMode ? 1 : 0,
          ]
        );
      });

      // El estado solo se toca cuando la escritura ya ha cuajado.
      setUserRatings(prev => ({ ...prev, ...nextRatings }));
      setCurrentStreak(prev => (isSuccess ? prev + 1 : 0));

      return eloVariation;
    } catch (error) {
      console.error('[userProgress] Error al registrar el progreso del puzle:', error);
      return 0;
    } finally {
      lockRef.current = false;
      setIsLocked(false);
    }
  }, [db]);

  // ---------------------------------------------------------
  // 3. AUXILIARES
  // ---------------------------------------------------------
  const resetLock = useCallback(() => {
    lockRef.current = false;
    setIsLocked(false);
  }, []);

  const resetProgress = useCallback(async () => {
    if (!db) return;
    try {
      await db.withTransactionAsync(async () => {
        await db.runAsync('DELETE FROM user_progress');
        await db.runAsync('DELETE FROM elo_history');
        await db.runAsync(
          `INSERT INTO user_progress (theme_id, elo) VALUES ('global', ?)`,
          [DEFAULT_ELO]
        );
        await db.runAsync(
          'INSERT INTO elo_history (elo, puzzle_elo, elo_change, is_success) VALUES (?, 0, 0, 1)',
          [DEFAULT_ELO]
        );
      });
      setUserRatings({ global: DEFAULT_ELO });
      setCurrentStreak(0);
    } catch (error) {
      console.error('[userProgress] Error al reiniciar el progreso completo:', error);
    }
  }, [db]);

  return {
    userRatings,
    currentStreak,
    isLocked,
    saveResolvedPuzzle,
    updateElo: saveResolvedPuzzle, // alias que consume app/index.tsx
    resetLock,
    resetProgress,
  };
};
