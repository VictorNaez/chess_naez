import * as SQLite from 'expo-sqlite';
import { useEffect, useState } from 'react';

// Cuenta aciertos consecutivos desde el más reciente (rows viene ordenado DESC por id)
// hasta el primer fallo. Solo cuenta intentos reales (puzzleID no nulo).
const computeStreakFromRows = (rows: { is_success: number }[]) => {
  let streak = 0;
  for (const row of rows) {
    if (row.is_success === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
};

export const userProgress = (db: SQLite.SQLiteDatabase | null) => {
  const [userRatings, setUserRatings] = useState<Record<string, number>>({});
  const [currentStreak, setCurrentStreak] = useState(0);
  const [isLocked, setIsLocked] = useState(false);

  // =========================================================
  // 1. INICIALIZACIÓN DE TABLAS DE PROGRESO E HISTORIAL
  // =========================================================
  useEffect(() => {
    async function setupProgress() {
      if (!db) return;
      try {
        // Tabla principal de progreso por temas y global
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS user_progress (
            theme_id TEXT PRIMARY KEY,
            elo INTEGER DEFAULT 1200,
            solved_count INTEGER DEFAULT 0,
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);

        // Insertar el perfil global por defecto si no existe
        await db.runAsync(
          "INSERT OR IGNORE INTO user_progress (theme_id, elo) VALUES ('global', 1200)"
        );

        // Tabla de historial modificada para soportar la cuadrícula de 24 puzles con puzzleID
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS elo_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            elo INTEGER NOT NULL,
            puzzle_elo INTEGER DEFAULT 0,
            elo_change INTEGER DEFAULT 0,
            is_success INTEGER DEFAULT 1,
            puzzleID TEXT,
            solve_ms INTEGER DEFAULT 0,
            is_recommended INTEGER DEFAULT 0,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);

        // --- MIGRACIONES DE SEGURIDAD INTERNAS ---
        // Por si el usuario ya tenía la tabla creada del pasado, forzamos la inserción de las nuevas columnas
        try {
          await db.execAsync(`ALTER TABLE elo_history ADD COLUMN puzzle_elo INTEGER DEFAULT 0;`);
        } catch (e) { /* Ya existía la columna, ignorar */ }

        try {
          await db.execAsync(`ALTER TABLE elo_history ADD COLUMN elo_change INTEGER DEFAULT 0;`);
        } catch (e) { /* Ya existía la columna, ignorar */ }

        try {
          await db.execAsync(`ALTER TABLE elo_history ADD COLUMN is_success INTEGER DEFAULT 1;`);
        } catch (e) { /* Ya existía la columna, ignorar */ }

        try {
          await db.execAsync(`ALTER TABLE elo_history ADD COLUMN puzzleID TEXT;`);
        } catch (e) { /* Ya existía la columna, ignorar */ }

        try {
          await db.execAsync(`ALTER TABLE elo_history ADD COLUMN solve_ms INTEGER DEFAULT 0;`);
        } catch (e) { /* Ya existía la columna, ignorar */ }

        try {
          await db.execAsync(`ALTER TABLE elo_history ADD COLUMN is_recommended INTEGER DEFAULT NULL;`);
        } catch (e) { /* Ya existía la columna, ignorar */ }

        // Si el historial está completamente vacío, insertamos el punto de partida inicial de 1200
        const countHistory = await db.getAllAsync<{ count: number }>(
          "SELECT COUNT(*) as count FROM elo_history"
        );
        if (countHistory[0].count === 0) {
          await db.runAsync("INSERT INTO elo_history (elo, puzzle_elo, elo_change, is_success) VALUES (1200, 0, 0, 1)");
        }

        // Cargar los ratings actuales desde SQLite al estado de React
        const allProgress = await db.getAllAsync<{ theme_id: string; elo: number }>(
          "SELECT theme_id, elo FROM user_progress"
        );

        const ratingsMap: Record<string, number> = {};
        allProgress.forEach((row) => {
          ratingsMap[row.theme_id] = row.elo;
        });

        setUserRatings(ratingsMap);

        // Sembramos la racha actual leyendo el historial real (excluye el punto semilla sin puzzleID)
        const streakRows = await db.getAllAsync<{ is_success: number }>(
          "SELECT is_success FROM elo_history WHERE puzzleID IS NOT NULL ORDER BY id DESC LIMIT 200"
        );
        setCurrentStreak(computeStreakFromRows(streakRows));
        } catch (error) {
          console.error("Error al inicializar las tablas de progreso:", error);
        }
    }

    setupProgress();
  }, [db]);

  // =========================================================
  // 2. GUARDAR PUZLE RESUELTO (PROCESAR ACIERTO O FALLO)
  // =========================================================
  const saveResolvedPuzzle = async (
    puzzleId: string,
    themeList: string[],
    isSuccess: boolean,
    puzzleElo: number,
    solveMs: number = 0,
    isRecommendedMode: boolean = false,
  ) => {
    if (!db || isLocked) return 0;
    setIsLocked(true); // Activamos el cerrojo de seguridad

    const newRatingsBatch = { ...userRatings };
    const oldGlobalElo = userRatings['global'] || 1200;

    // --- FÓRMULA MATEMÁTICA DE AJEDREZ (EXPECTATIVA DE SISTEMA RATING) ---
    const expectedScore = 1 / (1 + Math.pow(10, (puzzleElo - oldGlobalElo) / 400));
    const actualScore = isSuccess ? 1 : 0;
    const K_FACTOR = 16; // Factor de peso del cambio

    let eloVariation = Math.round(K_FACTOR * (actualScore - expectedScore));

    // Forzar límites mínimos para que el resultado siempre altere el valor de forma visible
    if (isSuccess && eloVariation < 2) {
      eloVariation = 5; // Mínimo ganas 5 puntos al acertar
    } else if (!isSuccess && eloVariation > -2) {
      eloVariation = -5; // Mínimo pierdes 5 puntos al fallar
    }

    // Calcular el nuevo ELO global sin dejar que baje de un suelo crítico (ej: 100)
    const newGlobalElo = Math.max(100, oldGlobalElo + eloVariation);
    newRatingsBatch['global'] = newGlobalElo;

    try {
      // Actualizar el rating global del usuario
      await db.runAsync(
        `INSERT INTO user_progress (theme_id, elo, solved_count) VALUES ('global', ?, 1)
         ON CONFLICT(theme_id) DO UPDATE SET elo = ?, solved_count = solved_count + 1`,
        [newGlobalElo, newGlobalElo]
      );

      // INSERTAR EN EL HISTORIAL: Guardamos explícitamente el puzzleID recibido en el primer parámetro
      await db.runAsync(
        `INSERT INTO elo_history (elo, puzzle_elo, elo_change, is_success, puzzleID, solve_ms) VALUES (?, ?, ?, ?, ?, ?)`,
        [newGlobalElo, puzzleElo, eloVariation, isSuccess ? 1 : 0, puzzleId, Math.round(solveMs)]
      );

        // Racha: acierto suma, fallo la corta a 0. Misma fuente de verdad que is_success.
        setCurrentStreak(prev => (isSuccess ? prev + 1 : 0));

      // Actualizar de forma proporcional los ratings de cada tema/categoría táctica del puzle
      for (const themeId of themeList) {
        if (!themeId.trim()) continue; // Evitar strings vacíos si el split detecta huecos
        
        const currentThemeElo = userRatings[themeId] || 1200;
        const newThemeElo = Math.max(100, currentThemeElo + eloVariation);
        newRatingsBatch[themeId] = newThemeElo;

        await db.runAsync(
          `INSERT INTO user_progress (theme_id, elo, solved_count) VALUES (?, ?, 1) 
           ON CONFLICT(theme_id) DO UPDATE SET elo = ?, solved_count = solved_count + 1`,
          [themeId, newThemeElo, newThemeElo]
        );
      }

      // Actualizar el estado global en memoria de React
      setUserRatings(newRatingsBatch);

    } catch (error) {
      console.error("Error crítico al registrar progreso del puzle en SQLite:", error);
      eloVariation = 0;
    } finally {
      setIsLocked(false); // Abrimos de nuevo el cerrojo
    }

    await db.runAsync(
      `INSERT INTO elo_history (elo, puzzle_elo, elo_change, is_success, puzzleID, solve_ms, is_recommended)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newGlobalElo, puzzleElo, eloVariation, isSuccess ? 1 : 0, puzzleId, Math.round(solveMs), isRecommendedMode ? 1 : 0]
    );

    return eloVariation;
  };

  // =========================================================
  // 3. FUNCIONES AUXILIARES Y RETORNO
  // =========================================================
  
  // Destraba el cerrojo de seguridad de forma externa (requerido por tu index.txt)
  const resetLock = () => {
    setIsLocked(false);
  };

  // Resetea por completo los datos guardados del perfil (útil en pruebas)
  const resetProgress = async () => {
    if (!db) return;
    try {
      await db.runAsync("DELETE FROM user_progress");
      await db.runAsync("DELETE FROM elo_history");
      await db.runAsync("INSERT INTO user_progress (theme_id, elo) VALUES ('global', 1200)");
      await db.runAsync("INSERT INTO elo_history (elo, puzzle_elo, elo_change, is_success) VALUES (1200, 0, 0, 1)");
      setUserRatings({ global: 1200 });
      setCurrentStreak(0);
      } catch (error) {
      console.error("Error al reiniciar el progreso completo:", error);
    }
  };

  return {
    userRatings,
    currentStreak,
    isLocked,
    saveResolvedPuzzle,
    updateElo: saveResolvedPuzzle, // Alias exacto para solucionar el error de desestructuración del Index
    resetLock,                     // Expuesto formalmente en el scope correcto
    resetProgress,
  };
};