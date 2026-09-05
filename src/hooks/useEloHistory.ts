import { Chess, Square } from 'chess.js';
import * as SQLite from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { InteractionManager } from 'react-native';
import type { Puzzle } from '../types/puzzle';

export interface EloPoint {
  value: number;
  timestamp: number;
}

export function useEloHistory(
  db: SQLite.SQLiteDatabase | null,
  onOpenHistoryPuzzle: (puzzle: Puzzle) => void
) {
  const [isHistoryModalVisible, setIsHistoryModalVisible] = useState(false);
  const [eloHistoryData, setEloHistoryData] = useState<EloPoint[]>([
    { value: 1200, timestamp: Date.now() },
  ]);
  const [isHistoryListReady, setIsHistoryListReady] = useState(false);
  const [recentPuzzles, setRecentPuzzles] = useState<any[]>([]);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<any>(null);

  const loadEloHistory = useCallback(async () => {
    if (!db) return;
    try {
      // En vez de cortar a los últimos N (perdiendo el origen del historial),
      // muestreamos de forma uniforme a lo largo de TODO el historial,
      // conservando siempre el primer y el último punto.
      const MAX_POINTS = 300;

      const rows = await db.getAllAsync<{ elo: number; ts: number }>(
        `
        WITH numbered AS (
          SELECT id, elo, timestamp, 
                 ROW_NUMBER() OVER (ORDER BY id) as rn, 
                 COUNT(*) OVER () as total
          FROM elo_history
        ),
        sampled AS (
          SELECT id, elo, timestamp FROM numbered
          WHERE rn = 1 
             OR rn = total 
             OR rn % MAX(1, CAST(total / CAST(? AS REAL) AS INTEGER)) = 0
        )
        SELECT elo, strftime('%s', timestamp) * 1000 as ts 
        FROM sampled 
        ORDER BY id ASC
        `,
        [MAX_POINTS]
      );

      if (rows.length > 0) {
        // Ya viene ordenado ASC desde SQL, no hace falta .reverse()
        const formattedPoints = rows.map(r => ({
          value: r.elo,
          timestamp: Number(r.ts) || Date.now(),
        }));
        setEloHistoryData(formattedPoints);
      }
    } catch (error) {
      console.error("Error cargando historial de ELO:", error);
    }
  }, [db]);

  const loadHistoryGrid = useCallback(async () => {
    if (!db) return;
    try {
      const rows = await db.getAllAsync<any>(
        `SELECT * FROM elo_history ORDER BY id DESC LIMIT 20`
      );

      // Recopilamos todos los IDs de puzzle necesarios y los traemos en UNA sola consulta.
      const idVariants = new Set<string | number>();
      rows.forEach((r) => {
        if (!r.puzzleID) return;
        idVariants.add(String(r.puzzleID));
        const n = Number(r.puzzleID);
        if (!isNaN(n)) idVariants.add(n);
      });
      const idList = Array.from(idVariants);

      let puzzleMap: Record<string, any> = {};

      if (idList.length > 0) {
        const placeholders = idList.map(() => '?').join(',');
        const puzzleRows = await db.getAllAsync<any>(
          `SELECT id, FEN, SOLUTION, themes FROM puzzles WHERE id IN (${placeholders})`,
          idList
        );

        puzzleRows.forEach((p) => {
          const rawId = p.id ?? p.ID;
          puzzleMap[String(rawId)] = p;
        });
      }

      const enrichedRows = rows.map((row) => {
        if (!row.puzzleID) return row;

        const puzzleRow = puzzleMap[String(row.puzzleID)];
        if (!puzzleRow) return row;

        // Aplicamos el primer movimiento (el forzado del rival) para mostrar
        // la posición real desde la que el jugador resuelve el puzzle
        let displayFen = puzzleRow.FEN ?? puzzleRow.fen ?? null;
        const solutionStr = puzzleRow.SOLUTION ?? puzzleRow.solution ?? "";
        const firstMove = solutionStr ? solutionStr.split(' ')[0] : null;

        if (displayFen && firstMove && firstMove.length >= 4) {
          try {
            const scratch = new Chess(displayFen);
            const from = firstMove.slice(0, 2) as Square;
            const to = firstMove.slice(2, 4) as Square;
            const promotion = firstMove.length === 5 ? firstMove[4] : 'q';
            const moveResult = scratch.move({ from, to, promotion });
            if (moveResult) {
              displayFen = scratch.fen();
            }
          } catch (moveError) {
            // Si el movimiento no es válido, nos quedamos con el FEN original
          }
        }

        return {
          ...row,
          puzzle_fen: displayFen,
          puzzle_themes: puzzleRow.themes ?? "",
        };
      });

      setRecentPuzzles(enrichedRows);
      if (enrichedRows.length > 0) {
        setSelectedHistoryItem(enrichedRows[0]);
      }
    } catch (error) {
      console.error("Error cargando cuadrícula de historial:", error);
    }
  }, [db]);

  const openHistory = useCallback(() => {
    loadEloHistory();
    loadHistoryGrid();
    setIsHistoryModalVisible(true);
    setIsHistoryListReady(false);

    InteractionManager.runAfterInteractions(() => {
      setIsHistoryListReady(true);
    });
  }, [loadEloHistory, loadHistoryGrid]);

  const closeHistory = useCallback(() => {
    setIsHistoryModalVisible(false);
  }, []);

  // Selecciona un puzzle de la lista del historial: lo marca como seleccionado
  // en la UI y, si existe en la tabla de puzzles, lo carga en el tablero
  // principal delegando en onOpenHistoryPuzzle (vive en usePuzzleSession/App).
  const selectHistoryPuzzle = useCallback(async (historyItem: any) => {
    setSelectedHistoryItem(historyItem);

    if (!db || !historyItem || !historyItem.puzzleID) {
      console.warn("No hay un identificador válido para este puzle en el historial.");
      return;
    }

    try {
      const searchIdStr = String(historyItem.puzzleID);
      const searchIdNum = Number(historyItem.puzzleID);

      let row = await db.getFirstAsync<any>(
        `SELECT * FROM puzzles WHERE id = ?`,
        [searchIdStr]
      );

      if (!row && !isNaN(searchIdNum)) {
        row = await db.getFirstAsync<any>(
          `SELECT * FROM puzzles WHERE id = ?`,
          [searchIdNum]
        );
      }

      if (row) {
        const formattedPuzzle: Puzzle = {
          id: String(row.ID ?? row.id),
          fen: row.FEN ?? row.fen,
          solution: (row.SOLUTION ?? row.solution).split(' '),
          rating: Number(row.RATING ?? row.rating),
          themes: row.themes ?? "",
        };

        setIsHistoryModalVisible(false);
        onOpenHistoryPuzzle(formattedPuzzle);
      } else {
        console.warn(`[SQLite] No se encontró el puzle con ID: ${historyItem.puzzleID} en la tabla 'puzzles'.`);
      }
    } catch (error) {
      console.error("Error al cargar el puzle desde el historial:", error);
    }
  }, [db, onOpenHistoryPuzzle]);

  return {
    isHistoryModalVisible,
    eloHistoryData,
    isHistoryListReady,
    recentPuzzles,
    selectedHistoryItem,
    openHistory,
    closeHistory,
    selectHistoryPuzzle,
  };
}