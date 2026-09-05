import { PALETTE } from '@/src/components/colors';
import { StreakBadge } from '@/src/components/header/StreakBadge';
import { PromotionModal } from '@/src/components/modals/PromotionModal';
import { CLOCK_TIMING } from '@/src/lib/clock';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Chess, Square } from "chess.js";
import * as SplashScreen from 'expo-splash-screen';
import * as SQLite from 'expo-sqlite';
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, Platform, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { AnalysisLines } from '../src/components/analysis/AnalysisLines';
import ChessBoard, { PieceItem, pieceImages } from "../src/components/ChessBoard";
import { ClockProgressGrid } from '../src/components/clock/ClockProgressGrid';
import { ClockScoreBar } from '../src/components/clock/ClockScoreBar';
import { CountdownTimer } from '../src/components/clock/CountdownTimer';
import { EloBadge } from '../src/components/header/EloBadge';
import { PuzzleTimer } from '../src/components/header/PuzzleTimer';
import { SessionEloSparkline } from '../src/components/header/SessionEloSparkline';
import { ClockResultModal } from '../src/components/modals/ClockResultModal';
import { ClockStartModal } from '../src/components/modals/ClockStartModal';
import { FilterModal } from '../src/components/modals/FilterModal';
import { HistoryModal } from '../src/components/modals/HistoryModal';
import { MainMenuModal } from '../src/components/modals/MainMenuModal';
import { SettingsModal } from '../src/components/modals/SettingsModal';
import { SupportModal } from '../src/components/modals/SupportModal';
import { BoardControls } from '../src/components/puzzle/BoardControls';
import { MoveList } from '../src/components/puzzle/MoveList';
import { Skeleton } from '../src/components/ui/Skeleton';
import { openPuzzleDatabase } from '../src/data/puzzleDatabase';
import { useAnalysisEngine } from '../src/hooks/useAnalysisEngine';
import { useClockMode } from '../src/hooks/useClockMode';
import { useDonations } from '../src/hooks/useDonations';
import { useEloHistory } from '../src/hooks/useEloHistory';
import { userProgress } from "../src/hooks/userProgress";
import { SettingsProvider, useSettings } from '../src/hooks/useSettings';
import { useSounds } from '../src/hooks/useSounds';
import { hapticError, hapticImpact, hapticSuccess } from '../src/lib/haptics';
import { applyMoveIdentity, buildPieceItems, getIdentityAt, getMoveBetweenFens, moveIdentity, seedIdentityMap, stepIdentityBetweenFens } from '../src/lib/pieceIdentity';
import { buildThemeCondition, getRecommendedRange } from '../src/lib/puzzleQueries';
import type { AppMode } from '../src/types/mode';
import type { Puzzle } from '../src/types/puzzle';
 
// ESTO ES UNA PRUEBA ESTO ES UNA PRUEBAESTO ES UNA PRUEBAESTO ES UNA PRUEBAESTO ES UNA PRUEBAESTO ES UNA PRUEBAESTO ES UNA PRUEBAESTO ES UNA PRUEBAESTO ES UNA PRUEBAESTO ES UNA PRUEBAESTO ES UNA PRUEBAESTO ES UNA PRUEBA

SplashScreen.preventAutoHideAsync().catch(() => {});

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// El provider tiene que envolver a App desde fuera: los hooks que consumen los
// ajustes (useSounds, useAnalysisEngine, la propia App) viven dentro de App.
export default function AppRoot() {
  return (
    <SettingsProvider>
      <App />
    </SettingsProvider>
  );
}

function App() {
  const [db, setDb] = useState<SQLite.SQLiteDatabase | null>(null);
  const [currentPuzzle, setCurrentPuzzle] = useState<Puzzle | null>(null);
  const [loading, setLoading] = useState(true);
  const [eloRange, setEloRange] = useState<[number, number]>([1400, 1800]);
  const {userRatings, updateElo, resetLock, currentStreak } = userProgress(db);
  const [eloFeedback, setEloFeedback] = useState<{ value: number } | null>(null);
  const settings = useSettings();
  const [isSettingsModalVisible, setIsSettingsModalVisible] = useState(false);
  const playSound = useSounds();
  const [game, setGame] = useState(new Chess());
  const boardStatus = useMemo(() => ({ inCheck: game.inCheck(), isMate: game.isCheckmate(), turn: game.turn(),  fen: game.fen(), }), [game]);
  const analysisEngine = useAnalysisEngine(boardStatus.fen);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalMoves, setLegalMoves] = useState<string[]>([]);
  const [lastMoveFrom, setLastMoveFrom] = useState<string | null>(null);
  const [lastMoveTo, setLastMoveTo] = useState<string | null>(null);
  const [hintSquare, setHintSquare] = useState<string | null>(null);
  const [hintMove, setHintMove] = useState<string | null>(null);
  const [successSquare, setSuccessSquare] = useState<string | null>(null);
  const [errorSquare, setErrorSquare] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [puzzleSolved, setPuzzleSolved] = useState(false);
  const [firstMoveDone, setFirstMoveDone] = useState(false);
  const [solutionStep, setSolutionStep] = useState(0);
  const [fenHistory, setFenHistory] = useState<string[]>([]);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>('w');
  const [isShowingSolution, setIsShowingSolution] = useState(false);
  const [solutionRevealed, setSolutionRevealed] = useState(false);
  const [promotionModalVisible, setPromotionModalVisible] = useState(false);
  const [pendingMove, setPendingMove] = useState<{ from: string, to: string } | null>(null);
  const [isBoardLocked, setIsBoardLocked] = useState(false);
  const [viewIndex, setViewIndex] = useState(0); // Qué movimiento del historial estamos viendo
  const [isReviewMode, setIsReviewMode] = useState(false); // Si estamos viendo el pasado o el presente
  const [isRetryMode, setIsRetryMode] = useState(false);
  const [pieces, setPieces] = useState<PieceItem[]>([]);
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);
  const [isSupportModalVisible, setIsSupportModalVisible] = useState(false);
  const [appMode, setAppMode] = useState<AppMode>('puzzles');
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const donations = useDonations();
  const clock = useClockMode(db);
  const isClockMode = appMode === 'clock';
  const [isRecommendedMode, setIsRecommendedMode] = useState(false);
  const [isHistoryMode, setIsHistoryMode] = useState<boolean>(false);
  const [sessionEloHistory, setSessionEloHistory] = useState<number[]>([]);
  const hasSeededSessionElo = useRef(false);
  const MOVE_LIST_HEIGHT = 40;   // altura en modo puzzle (historial SAN)
  const MULTI_PV_HEIGHT = settings.engineMultiPV * 32 + (settings.engineMultiPV - 1) + 20;   // 32px por fila (styles.analysisLineRow) + 1px de gap + 20px de paddingVertical del multiPvWrapper. Antes era 118 fijo, válido solo para 3 líneas.
  const moveListHeight = useSharedValue(MOVE_LIST_HEIGHT);
  const clearSelection = () => {setSelectedSquare(null); setLegalMoves([]); setHintMove(null);};
  const [isNextDisabled, setIsNextDisabled] = useState(false);
  const isAtLastMove = viewIndex === fenHistory.length - 1;
  const nextPuzzleRef = useRef<{ key: string; puzzle: Puzzle } | null>(null);
  const prefetchingRef = useRef(false);

  // --- ARRANQUE: true una sola vez, cuando ya hay datos reales que pintar ---
  const [hasBooted, setHasBooted] = useState(false);
  const hasBootedRef = useRef(false);

  useEffect(() => {
    if (hasBootedRef.current) return;
    const eloReady = userRatings['global'] !== undefined;
    const boardReady = (currentPuzzle !== null && firstMoveDone) || (!loading && currentPuzzle === null);
    if (eloReady && boardReady) {
      hasBootedRef.current = true;
      setHasBooted(true);
    }
  }, [userRatings, currentPuzzle, firstMoveDone, loading]);

  const splashHiddenRef = useRef(false);
  const onRootLayout = useCallback(() => {
    if (splashHiddenRef.current) return;
    splashHiddenRef.current = true;
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  // --- CRONÓMETRO DEL PUZZLE ---
  const [timerStartedAt, setTimerStartedAt] = useState<number | null>(null);
  const [solveElapsedMs, setSolveElapsedMs] = useState<number | null>(null);
  const [timerResult, setTimerResult] = useState<boolean | null>(null);
  // Ref paralelo al estado: necesitamos leer el tiempo dentro de executeMove sin esperar a React
  const timerStartRef = useRef<number | null>(null);

  const resetTimer = useCallback(() => {
    timerStartRef.current = null;
    setTimerStartedAt(null);
    setSolveElapsedMs(null);
    setTimerResult(null);
  }, []);

  const startTimer = useCallback(() => {
    const now = Date.now();
    timerStartRef.current = now;
    setTimerStartedAt(now);
    setSolveElapsedMs(null);
    setTimerResult(null);
  }, []);

  // Congela el crono y devuelve los ms empleados (0 si nunca llegó a arrancar)
  const stopTimer = useCallback((wasSuccess: boolean | null = null) => {
    if (timerStartRef.current === null) return 0;
    const elapsed = Date.now() - timerStartRef.current;
    timerStartRef.current = null;
    setSolveElapsedMs(elapsed);
    setTimerResult(wasSuccess);
    return elapsed;
  }, []);

const puzzleKey = (range: number[], themes: string[]) =>
  `${range[0]}-${range[1]}-${themes.join(',')}`;

// Extrae el cuerpo de la query de loadSinglePuzzle a una función pura
const queryPuzzle = useCallback(async (
  database: SQLite.SQLiteDatabase, range: number[], themes: string[]
): Promise<Puzzle | null> => {
  const rows = await database.getAllAsync<any>(
    `SELECT * FROM puzzles WHERE rating BETWEEN ? AND ? ${buildThemeCondition(themes)} ORDER BY RANDOM() LIMIT 1`,
    [range[0], range[1]]
  );
  if (!rows?.length) return null;
  const r = rows[0];
  return {
    id: String(r.ID ?? r.id),
    fen: r.FEN ?? r.fen,
    solution: (r.SOLUTION ?? r.solution).split(' '),
    rating: Number(r.RATING ?? r.rating),
    themes: r.themes ?? "",
  };
}, []);

const prefetchNext = useCallback(async (range: number[], themes: string[]) => {
  if (prefetchingRef.current) return;
  const key = puzzleKey(range, themes);
  if (nextPuzzleRef.current?.key === key) return;
  prefetchingRef.current = true;
  try {
    const p = await queryPuzzle(db!, range, themes);
    if (p) nextPuzzleRef.current = { key, puzzle: p };
  } finally {
    prefetchingRef.current = false;
  }
}, [db, queryPuzzle]);

// Función para sincronizar las piezas con el tablero de chess.js
const syncPiecesFromGame = (chessGame: Chess) => {
  setPieces(buildPieceItems(chessGame));
};


// Función para reiniciar el estado del puzzle, usada tanto al cargar un nuevo puzzle como al hacer Retry después de resolverlo
// isRetry: true SOLO cuando se reinicia un puzzle que el usuario ya intentó.
// Determina si el puzzle otorga ELO o no. Es explícito a propósito:
const resetPuzzleState = (puzzle: Puzzle, isInitialLoad = false, isRetry = false, isHistory = false, firstMoveDelayMs = 1000) => {
  if (!puzzle) return;
  
  setIsRetryMode(isRetry);
  setIsHistoryMode(isHistory);

  const newGame = new Chess(puzzle.fen);

  const localSolution = [...puzzle.solution];
  const initialFen = puzzle.fen;

  // --- LIMPIEZA DE UI ---
  setLegalMoves([]);      
  setSelectedSquare(null); 
  setMessage("");         
  analysisEngine.exitAnalysisMode();
  setSuccessSquare(null);
  setErrorSquare(null);
  setLastMoveFrom(null);
  setLastMoveTo(null);
  setHintSquare(null);
  setHintMove(null); 
  resetTimer();  

  seedIdentityMap(newGame);
  setGame(newGame);
  syncPiecesFromGame(newGame);
  
  setTimeout(() => syncPiecesFromGame(newGame), 10);
  setFenHistory([newGame.fen()]);
  setViewIndex(0);
  setIsReviewMode(false);
  setMessage("");
  setPuzzleSolved(false);
  setFirstMoveDone(false);
  setSolutionStep(0);

  const turnInFen = newGame.turn(); 
  const pColor = turnInFen === 'w' ? 'b' : 'w'; 
  setPlayerColor(pColor); 

  // SI ES CARGA INICIAL AL ABRIR LA APP, DETENEMOS AQUÍ EL FLUJO Y NO MOVEMOS LA MÁQUINA
  if (isInitialLoad) {
    // 1. En lugar de dar por hecho los movimientos guardados, reiniciamos el juego
    // al estado inicial del puzle (antes de que la máquina mueva en esta sesión)
    const initialChess = new Chess(puzzle.fen);
    setGame(initialChess);
    
    // 2. Reseteamos los historiales para que empiecen desde cero
    setFenHistory([puzzle.fen]);
    setMoveHistory([]);
    setViewIndex(0);
    
    // 3. Forzamos a que el tablero empiece bloqueado y que falte el primer movimiento
    setFirstMoveDone(false);
    setIsBoardLocked(true);
    setLoading(false);

  }

  // Movimiento normal retrasado de la máquina para puzles nuevos o del historial
  setTimeout(() => {
    if (!localSolution || localSolution.length === 0) return;
    
    const firstMove = localSolution[0];
    const from = firstMove.slice(0, 2) as Square;
    const to = firstMove.slice(2, 4) as Square;

    setLastMoveFrom(from);
    setLastMoveTo(to);

    const m0 = newGame.move({ from, to, promotion: 'q' });

    if (m0) {
      applyMoveIdentity(m0);
      setMoveHistory([m0.san]);
    }

    const nextFen = newGame.fen();
    setGame(new Chess(nextFen));
    syncPiecesFromGame(newGame);

    setFenHistory(prev => [...prev, newGame.fen()]);

    const firstMoveFen = newGame.fen();
    setFenHistory([initialFen, firstMoveFen]); 
    setViewIndex(1);
    setIsReviewMode(false);

    setSolutionStep(1);
    setFirstMoveDone(true);
    setLoading(false); 
    startTimer(); // el usuario ya puede mover, empieza a contar
  }, firstMoveDelayMs);
};

// Función para cargar un nuevo puzzle aleatorio desde la DB, con opciones de rango de ELO y temas, y reseteo completo del estado del tablero y UI
// options.fast: modo contrarreloj. Recorta los tiempos muertos (bloqueo del
// botón y retardo del primer movimiento), que en 3 minutos son ~20 segundos.
const loadSinglePuzzle = async (
  activeDb?: SQLite.SQLiteDatabase | null,
  overrideRange?: number[],
  overrideThemes?: string[],
  options?: { fast?: boolean }
) => {
  const isFast = options?.fast === true;
  if (isNextDisabled && !isFast) return;
  setIsNextDisabled(true);

  setSolutionRevealed(false);
  setIsRetryMode(false);
  resetLock();
  setHintSquare(null);
  setIsBoardLocked(false);
  setIsReviewMode(false);
  analysisEngine.exitAnalysisMode();
  setEloFeedback(null);
  resetTimer(); 

  setMoveHistory([]);

  const databaseToUse = activeDb || db;
  if (!databaseToUse) return;

  setLoading(true);
  setMessage("");

  let currentRange = overrideRange || eloRange;
  // En contrarreloj manda la escalera: ni filtros ni modo recomendado.
  if (!isFast && isRecommendedMode) {
    const globalElo = userRatings['global'] || 1200;
    currentRange = getRecommendedRange(globalElo);
  }

  const themesToUse = isFast ? [] : (overrideThemes || selectedThemes);

  // Intenta usar el puzzle precargado; si no coincide, va a la BD
  const cacheKey = puzzleKey(currentRange, themesToUse);
  let p: Puzzle | null = null;

  if (!isFast && nextPuzzleRef.current?.key === cacheKey) {
    p = nextPuzzleRef.current.puzzle;
    nextPuzzleRef.current = null;
  } else {
    p = await queryPuzzle(databaseToUse, currentRange, themesToUse);
    // En contrarreloj, si la ventana está vacía la ensanchamos
    if (!p && isFast) {
      console.warn('[CLOCK] ventana vacía', currentRange, '→ ampliando');
      p = await queryPuzzle(databaseToUse, [Math.max(0, currentRange[0] - 400), currentRange[1] + 400], themesToUse);
    }
  }

  if (p) {
    setCurrentPuzzle(p);
    resetPuzzleState(p, false, false, false, isFast ? CLOCK_TIMING.firstMove : 1000);
   // Precarga el siguiente mientras el usuario resuelve este
    if (!isFast) prefetchNext(currentRange, themesToUse);
  } else {
    setMessage("No puzzles, adjust filters");
    setLoading(false);
    setCurrentPuzzle(null);
  }

  setTimeout(() => {
    setIsNextDisabled(false);
  }, isFast ? 150 : 500);
}

// Aplica un puzzle del historial al tablero principal, sin otorgar/quitar ELO.
const openHistoryPuzzleOnBoard = useCallback((puzzle: Puzzle) => {
  resetPuzzleState(puzzle, false, false, true); // isHistory = true
  setCurrentPuzzle(puzzle);
}, [resetPuzzleState]);

const {
  isHistoryModalVisible,
  eloHistoryData,
  isHistoryListReady,
  recentPuzzles,
  selectedHistoryItem,
  openHistory,
  closeHistory,
  selectHistoryPuzzle,
} = useEloHistory(db, openHistoryPuzzleOnBoard);

// Función para rebobinar el puzzle paso a paso (usada en el botón Retry)
const handleRetry = async () => {
  // Si estamos mostrando la solución o no hay historia para deshacer, cancelamos
  if (fenHistory.length < 2 || isShowingSolution) return;

  setIsRetryMode(true);
// Si el puzzle ya fue resuelto (por Show Solution), se hace un reseteo directo
  if (puzzleSolved && currentPuzzle) {
    setMessage("");
    setIsBoardLocked(false);
    setHintSquare(null);
    setPuzzleSolved(false);
    setErrorSquare(null);
    setSuccessSquare(null);
    setLastMoveFrom(null);
    setLastMoveTo(null);
    
    // Cargamos el FEN original directamente
    resetPuzzleState(currentPuzzle, false, true);   // isRetry = true: no otorga ELO
    
    setMoveHistory([]);
    clearSelection();
    return; // Salimos de la función sin ejecutar el bucle while de rebobinado
  }

  setHintSquare(null);
  setHintMove(null);
  setIsBoardLocked(false);
  setIsShowingSolution(true); // Bloqueamos interacciones durante el rebobinado
  setErrorSquare(null);
  setSuccessSquare(null);
  setLastMoveFrom(null);
  setLastMoveTo(null);
  //setMessage("⏪ REBOBINANDO...");

  // Copiamos el historial para manipularlo
  const history = fenHistory.slice(0, viewIndex + 1);
  
  // Queremos volver hasta el índice 1 (la posición después del primer movimiento de la máquina)
  // Mientras el historial sea más largo que 2 (Inicio, PrimerMovMaquina)...
  while (history.length > 2) {
    const currentFen = history.pop(); // Sacamos el FEN actual (donde estamos)
    const targetFen = history[history.length - 1]; // El FEN al que queremos volver
    
    if (!currentFen || !targetFen) break;

    const gameCurrent = new Chess(currentFen);
    const gameTarget = new Chess(targetFen);

    // Identificamos qué pieza se movió comparando los dos estados
    let fromSq = ""; // Donde terminó la pieza (en el error)
    let toSq = "";   // De donde vino originalmente (el origen real)

    gameTarget.board().forEach((row, r) => {
      row.forEach((cell, c) => {
        const sq = String.fromCharCode(97 + c) + (8 - r);
        const pTarget = gameTarget.get(sq as any);
        const pCurrent = gameCurrent.get(sq as any);

        // Si en el destino (Target) había una pieza que ahora no está en Current
        // significa que esa casilla es el origen del movimiento que estamos deshaciendo
        if (pTarget && !pCurrent) toSq = sq;
        
        // Si en Current hay una pieza que no estaba en Target (o era distinta)
        // esa es la casilla desde la que rebobinamos
        if (pCurrent && JSON.stringify(pCurrent) !== JSON.stringify(pTarget)) {
          fromSq = sq;
        }
      });
    });

    if (fromSq && toSq) {
      const pieceId = getIdentityAt(fromSq);
      if (pieceId) {
        // 1. Mover la identidad visual hacia ATRÁS (misma lógica que un movimiento normal)
        moveIdentity(fromSq, toSq);

        // Actualizamos las piezas para disparar la animación de Reanimated
        setPieces(current => 
          current.map(p => p.id === pieceId ? { ...p, square: toSq } : p)
        );
      }
    }
    // 2. Actualizamos el motor de ajedrez al estado anterior
    setGame(new Chess(targetFen));
    syncPiecesFromGame(gameTarget);

    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // Finalización del estado
  setFenHistory([fenHistory[0], fenHistory[1]]);
  setViewIndex(1);
  setIsReviewMode(false);
  setSolutionStep(1);
  setPuzzleSolved(false);
  setMessage("");
  setIsShowingSolution(false); 
  clearSelection();
  setMoveHistory(prev => prev.slice(0, 1));
  startTimer(); 
};

// Función para mostrar la solución paso a paso, con animaciones, desde el punto donde el jugador se quedó
const showSolution = async () => {
  if (!currentPuzzle || isShowingSolution) return;
  
  setIsShowingSolution(true);
  setSolutionRevealed(true);
  stopTimer(false);
  clearSelection();
  setHintSquare(null);
  setHintMove(null);
  setSuccessSquare(null);
  setLastMoveFrom(null);
  setLastMoveTo(null);
  setErrorSquare(null);
  // 1. DESHACER EL ERROR DEL JUGADOR
  // El historial tiene: [Inicio, Máquina, Jugador(Error)]
  // Queremos volver al índice 1 (después del primer movimiento de la máquina)
  const historyClean = [...fenHistory];
  if (message.includes('❌') && historyClean.length > 2) {
    historyClean.pop(); // Quitamos el error
  }
  
  const lastValidFen = historyClean[historyClean.length - 1];
  const playbackGame = new Chess(lastValidFen);

  // Actualizamos el tablero para que la pieza "vuelva" a su sitio
  setGame(new Chess(lastValidFen));
  syncPiecesFromGame(playbackGame);
  setFenHistory(historyClean);
  setViewIndex(historyClean.length - 1);

  // 2. PAUSA DE ESPERA (800ms)
  await new Promise(resolve => setTimeout(resolve, 800));

  // 3. COMPLETAR LA SOLUCIÓN DESDE DONDE ESTABA
  // Usamos 'solutionStep' para saber por qué movimiento iba el puzzle
  for (let i = solutionStep; i < currentPuzzle.solution.length; i++) {
    const moveStr = currentPuzzle.solution[i];
    
    // Antes de mover, movemos la identidad para la animación
    const solutionMove = playbackGame.move({
      from: moveStr.slice(0, 2) as Square,
      to: moveStr.slice(2, 4) as Square,
      promotion: 'q'
    });
    if (solutionMove) applyMoveIdentity(solutionMove);

    // Actualizamos el estado visual
    setGame(new Chess(playbackGame.fen()));
    syncPiecesFromGame(playbackGame);

    setLastMoveFrom(moveStr.slice(0, 2))
    setLastMoveTo(moveStr.slice(2, 4));
    
    // Guardamos en el historial para que el modo análisis funcione después
    setFenHistory(prev => [...prev, playbackGame.fen()]);

    // Pausa entre movimientos de la solución
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  setPuzzleSolved(true);
  setIsShowingSolution(false);
  //setMessage("✅ SOLUCIÓN COMPLETADA");
};

// Función central para manejar la interacción del usuario con el tablero
function onSquarePress(square: string | null, isDraggingInteraction: boolean = false) {
  if (!square) {
    clearSelection();
    return;
  }

  if (!firstMoveDone || !currentPuzzle || (isBoardLocked && !analysisEngine.isAnalysisMode)) return;
  if (isReviewMode && !analysisEngine.isAnalysisMode) return;

  const targetPiece = game.get(square as any);
  
  const turnColor = game.turn();
  const isPlayerTurn = analysisEngine.isAnalysisMode 
    ? targetPiece?.color === turnColor 
    : targetPiece?.color === playerColor;

  // 1. Si el jugador interactúa con una pieza de su propio color
  if (isPlayerTurn) {
    if (selectedSquare === square) {
      // 🌟 CAMBIO CLAVE: Si ya está seleccionada pero la estamos ARRASTRANDO, NO la deseleccionamos.
      // Solo la deseleccionamos si es un click normal (tap) sobre ella misma.
      if (!isDraggingInteraction) {
        clearSelection();
      }
    } else {
      // Si toca otra pieza de su color, cambia la selección normalmente
      setSelectedSquare(square);
      const moves = game.moves({ square: square as any, verbose: true });
      const uniqueMoves = Array.from(new Set(moves.map(m => m.to)));
      setLegalMoves(uniqueMoves);
    }
    return;
  }

  // 2. Si el jugador hace click o interactúa con una casilla vacía o del rival
  if (selectedSquare) {
    const movingPiece = game.get(selectedSquare as any);
    if (!movingPiece) {
      clearSelection();
      return;
    }

    // Validamos si el movimiento es legal en el motor
    const moves = game.moves({ square: selectedSquare as any, verbose: true });
    const moveAttempt = moves.find(m => m.to === square);

    if (moveAttempt) {
      const fromSquare = selectedSquare; // Guardamos la casilla de origen temporalmente
      
      // Borramos instantáneamente los estados de selección y movimientos legales 
      // ANTES de ejecutar el movimiento o abrir modales, quitando el retraso visual en clicks.
      clearSelection(); 

      // Verificamos si es una coronación de peón
      const isPawn = movingPiece.type === 'p';
      const isPromotionRow = (movingPiece.color === 'w' && square[1] === '8') || 
                             (movingPiece.color === 'b' && square[1] === '1');

      if (isPawn && isPromotionRow) {
        setPendingMove({ from: fromSquare, to: square }); // Usamos la variable guardada
        setPromotionModalVisible(true);
      } else {
        executeMove(fromSquare, square, 'q'); // Usamos la variable guardada
      }
    } else {
      // Si el click fue en una casilla ilegal/vacía, limpiamos selección de inmediato
      clearSelection();
    }
  } else {
    clearSelection();
  }
}

// Función central para ejecutar un movimiento, tanto en modo puzzle como análisis
const executeMove = async (from: string, to: string, promotion: string = 'q') => {
  if (!currentPuzzle || (isBoardLocked && !analysisEngine.isAnalysisMode)) return;

  // 1. Bloqueo de seguridad para evitar doble toque
  if (!analysisEngine.isAnalysisMode) {
    setIsBoardLocked(true);
    setHintSquare(null);
    setHintMove(null);
  }

  const moveStr = `${from}${to}`;
  const playerMoveWithPromotion = moveStr + promotion;
  
  try {
    const gameCopy = new Chess(game.fen());
    const move = gameCopy.move({ 
      from: from as Square, 
      to: to as Square, 
      promotion: promotion 
    });

    if (move) {
      // Identificamos si el movimiento es una captura (chess.js incluye 'captured' si lo es)
      const isCapture = 'captured' in move;

      // --- A. LÓGICA PARA MODO ANÁLISIS ---
      if (analysisEngine.isAnalysisMode) {
        // Feedback táctil para modo análisis
        if (isCapture) {
          hapticImpact('heavy');
          playSound('capture');
        } else {
          hapticImpact('medium');
          playSound('move');
        }

        applyMoveIdentity(move);
        const nextFen = gameCopy.fen();

        setLastMoveFrom(move.from);
        setLastMoveTo(move.to);

        setGame(gameCopy);
        syncPiecesFromGame(gameCopy);
        
        setMoveHistory(prev => {
          const truncatedMoves = prev.slice(0, viewIndex);
          return [...truncatedMoves, move.san];
        });

        setFenHistory(prev => {
          const truncatedFens = prev.slice(0, viewIndex + 1);
          const newH = [...truncatedFens, nextFen];
          setViewIndex(newH.length - 1);
          return newH;
        });
        clearSelection();
        setPromotionModalVisible(false);
        setPendingMove(null);
        return; 
      }

      // --- B. LÓGICA PARA MODO PUZZLE ---
      const expectedMove = currentPuzzle.solution[solutionStep];
      const matchesSolution = playerMoveWithPromotion === expectedMove || moveStr === expectedMove;

      // La BD solo admite una línea por puzzle, pero hay posiciones con más de
      // un mate posible. Si el movimiento da mate, la partida ha terminado y no
      // hay nada que "fallar": lo damos por bueno.
      const isMateNow = gameCopy.isCheckmate();
      const isCorrect = matchesSolution || isMateNow;

      const playerSAN = move.san;
      setMoveHistory(prev => [...prev, playerSAN]);
      applyMoveIdentity(move);
      
      const nextFen = gameCopy.fen();
      setGame(gameCopy);
      syncPiecesFromGame(gameCopy);

      setLastMoveFrom(move.from);
      setLastMoveTo(move.to);

      if (isCorrect) {
        const nextStep = solutionStep + 1;

        // Con mate el puzzle acaba aquí aunque a la solución de la BD le queden
        // movimientos: la máquina no puede responder a un mate.
        const isPuzzleFinished = isMateNow || nextStep === currentPuzzle.solution.length;

        if (isPuzzleFinished) {
          // PUZZLE FINALIZADO CON ÉXITO: Vibración de victoria
          const solveMs = stopTimer(true);
          hapticSuccess();
          playSound('success');
          
          setFenHistory(prev => {
            const newH = [...prev, nextFen];
            setViewIndex(newH.length - 1);
            return newH;
          });
          setSuccessSquare(to);

          if (currentPuzzle) {
            if (isClockMode) {
              // Contrarreloj: no toca el ELO global, alimenta la escalera de la partida
              const { nextRange, timeUp } = clock.registerResult(true, currentPuzzle.id, currentPuzzle.rating, solveMs);
              if (!timeUp) swapClockPuzzle(nextRange, CLOCK_TIMING.afterSolve);
              
            } else if (!isHistoryMode && !isRetryMode) {
              const temasArray = currentPuzzle.themes.split(' ');
              const puntosGanados = await updateElo(currentPuzzle.id, temasArray, true, currentPuzzle.rating, solveMs);
              if (puntosGanados !== 0) {
                setEloFeedback({ value: puntosGanados });
              }
            }
          }

          setTimeout(() => { 
            setMessage("✅"); 
            setPuzzleSolved(true); 
            setIsBoardLocked(false);
          }, isClockMode ? 80 : 250);
        } else {
          // MOVIMIENTO CORRECTO (pero el puzzle sigue): Vibración de movimiento
          if (isCapture) {
            	hapticImpact('heavy');
            playSound('capture');
          } else {
            	hapticImpact('medium');
            playSound('move');
          }

          // TURNO DE LA MÁQUINA (Respuesta automática)
          setSolutionStep(nextStep + 1);
          const resp = currentPuzzle.solution[nextStep];
          
          setTimeout(() => {
            const gameAfterResp = new Chess(gameCopy.fen());
            const mResp = gameAfterResp.move({ 
              from: resp.slice(0, 2) as Square, 
              to: resp.slice(2, 4) as Square, 
              promotion: promotion
            });
            
            if (mResp) {
              // Vibración ligera cuando la máquina te responde (opcional, pero da un gran feedback)
              const machineCaptured = 'captured' in mResp;
              hapticImpact(machineCaptured ? 'medium' : 'light');

              setMoveHistory(prev => [...prev, mResp.san]);
              applyMoveIdentity(mResp);
            }
            
            const finalFen = gameAfterResp.fen();
            setGame(gameAfterResp);
            syncPiecesFromGame(gameAfterResp);

            setFenHistory(prevHistory => {
              const newHistory = [...prevHistory, nextFen, finalFen];
              setViewIndex(newHistory.length - 1);
              setIsReviewMode(false);
              return newHistory;
            });

            setIsBoardLocked(false); 
          }, isClockMode ? CLOCK_TIMING.machineReply : 450);
        }
      } else {
        // MOVIMIENTO INCORRECTO: Vibración de error
        const solveMs = stopTimer(false);
        hapticError();
        playSound('error');

        setFenHistory(prev => {
          const newH = [...prev, nextFen];
          setViewIndex(newH.length - 1);
          return newH;
        });
        setErrorSquare(to);
        // En contrarreloj no hay footer ni retry: el puzzle se sustituye solo,
        // así que el tablero debe seguir bloqueado hasta que cargue el siguiente.
        if (!isClockMode) {
          setTimeout(() => {
            setMessage("❌");
            setIsBoardLocked(false);
          }, 250);
        }

        if (currentPuzzle) {
          if (isClockMode) {
            // Fallo: NO baja de nivel, pero cambia de puzle al mismo rango
            const { nextRange, timeUp } = clock.registerResult(false, currentPuzzle.id, currentPuzzle.rating, solveMs);
            if (!timeUp) swapClockPuzzle(nextRange, CLOCK_TIMING.afterFail);

          } else if (!isHistoryMode && !isRetryMode) {
            const temasArray = currentPuzzle.themes.split(' ');
            const puntosPerdidos = await updateElo(currentPuzzle.id, temasArray, false, currentPuzzle.rating, solveMs);
            if (puntosPerdidos !== 0) {
              setEloFeedback({ value: puntosPerdidos });
            }
          }
        }
      }
    }
  } catch (e) {
    setIsBoardLocked(false);
  }
  clearSelection();
  setPromotionModalVisible(false);
  setPendingMove(null);
};

const handleDragMove = (from: string, to: string) => {
  // 1. Buscamos qué pieza se está moviendo
  const movingPiece = game.get(from as any);
  if (!movingPiece) return;

  // 2. Comprobamos si es un peón a punto de coronar
  const isPawn = movingPiece.type === 'p';
  const isPromotionRow = (movingPiece.color === 'w' && to[1] === '8') || 
                         (movingPiece.color === 'b' && to[1] === '1');

  // 3. DECISIÓN CLAVE:
  if (isPawn && isPromotionRow) {
    // Si es coronación, abrimos TU MODAL (que ya funciona perfecto)
    setPendingMove({ from, to });
    setPromotionModalVisible(true);
    clearSelection();
  } else {
    // Si es un movimiento normal, que se ejecute del tirón
    executeMove(from, to, 'q');
  }
};

// Refs para callbacks estables: ChessBoard nunca ve identidades nuevas
const handlersRef = useRef<{
  onSquarePress: typeof onSquarePress;
  handleDragMove: typeof handleDragMove;
  clearSelection: typeof clearSelection;
}>({ onSquarePress, handleDragMove, clearSelection });

useEffect(() => {
  handlersRef.current = { onSquarePress, handleDragMove, clearSelection };
});

const stableSquarePress = useCallback(
  (sq: string | null, dragging?: boolean) =>
    handlersRef.current.onSquarePress(sq, dragging),
  []
);
const stableDragMove = useCallback(
  (from: string, to: string) =>
    handlersRef.current.handleDragMove(from, to),
  []
);
const stableClearSelection = useCallback(
  () => handlersRef.current.clearSelection(),
  []
);

// Navegación única del historial: la usan tanto las flechas como la lista de
// jugadas, para que ambas dejen exactamente el mismo estado.
// (Antes handleMovePress no tocaba isReviewMode: si venías de pulsar la flecha
// atrás, el tablero se quedaba en modo revisión para siempre.)
const goToViewIndex = (targetIndex: number) => {
  if (targetIndex === viewIndex) return;
  if (targetIndex < 0 || targetIndex > fenHistory.length - 1) return;

  setSuccessSquare(null);
  setErrorSquare(null);
  setSelectedSquare(null);
  setLegalMoves([]);
  analysisEngine.clearBestMove();

  // Recorremos el historial de una posición a la CONTIGUA, nunca de un salto:
  // así cada paso se resuelve como un movimiento exacto y solo se anima la
  // pieza que de verdad se movió.
  const step = targetIndex > viewIndex ? 1 : -1;
  let targetGame = game;
  for (let i = viewIndex; i !== targetIndex; i += step) {
    targetGame = stepIdentityBetweenFens(fenHistory[i], fenHistory[i + step]);
  }

  // Resaltado de "última jugada" de la posición a la que llegamos
  const lastMove = targetIndex > 0
    ? getMoveBetweenFens(fenHistory[targetIndex - 1], fenHistory[targetIndex])
    : null;
  setLastMoveFrom(lastMove?.from ?? null);
  setLastMoveTo(lastMove?.to ?? null);

  setViewIndex(targetIndex);
  setIsReviewMode(targetIndex !== fenHistory.length - 1);
  setGame(targetGame);
  syncPiecesFromGame(targetGame);
};

const navigateHistory = (direction: 'prev' | 'next') => {
  goToViewIndex(direction === 'prev' ? viewIndex - 1 : viewIndex + 1);
};

const handleMovePress = (targetIndex: number) => {
  goToViewIndex(targetIndex);
};

// Función para obtener la imagen de la pieza en la promoción, basada en el color del jugador
const getPromotionPieceImage = (type: string) => {
  // Si el jugador es blanco ('w'), usamos mayúsculas para el diccionario ('Q', 'N'...)
  // Si es negro ('b'), usamos minúsculas ('q', 'n'...)
  const pieceKey = playerColor === 'w' ? type.toUpperCase() : type.toLowerCase();
  return pieceImages[pieceKey];
};

// Función para mostrar pistas, actualmente solo ilumina la pieza a mover
const handleHint = () => {
  if (!currentPuzzle || puzzleSolved || isBoardLocked) return;
  
  const moveStr = currentPuzzle.solution[solutionStep];
  if (moveStr) {
    const fromSquare = moveStr.slice(0, 2);
    
    // Si la casilla ya estaba iluminada, es el SEGUNDO click
    if (hintSquare === fromSquare) {
      setHintMove(moveStr); // Guardamos el movimiento completo ('e2e4') para la flecha
    } 
    // Si no estaba iluminada, es el PRIMER click
    else {
      setLegalMoves([]);
      setSelectedSquare(null);
      setHintSquare(fromSquare);
      setHintMove(null); // Nos aseguramos de ocultar la flecha si reiniciamos la pista
    }
  }
};

// Función para activar el modo análisis
const startAnalysis = () => { 
  analysisEngine.enterAnalysisMode();
  setIsBoardLocked(false);
  setIsReviewMode(false);
  setErrorSquare(null);
  setSuccessSquare(null);

  const targetIndex = fenHistory.length - 1;
  setViewIndex(targetIndex);
};

// Efecto para guardar el rango de ELO, temas seleccionados, modo recomendado y el puzzle 
// actual de manera asinclrona para persistencia entre sesiones (abrir y cerrar app).
useEffect(() => {
    const savePersistentData = async () => {
      try {
        await AsyncStorage.setItem('@elo_range', JSON.stringify(eloRange));
        await AsyncStorage.setItem('@selected_themes', JSON.stringify(selectedThemes));
        await AsyncStorage.setItem('@is_recommended_mode', JSON.stringify(isRecommendedMode));
        
        // VOLVEMOS A DEJAR ESTA LÍNEA ACTIVA: Guardar el puzle activo al cambiar
        if (currentPuzzle) {
          await AsyncStorage.setItem('@current_puzzle', JSON.stringify(currentPuzzle));
        }
      } catch (error) {
        console.error("Error al guardar los datos en AsyncStorage:", error);
      }
    };

    if (!loading || db) {
      savePersistentData();
    }
  }, [eloRange, selectedThemes, isRecommendedMode, currentPuzzle]);

// Efecto para bloquear el tablero si estamos viendo un movimiento anterior o si el puzzle ya fue resuelto
useEffect(() => {
  // Contrarreloj terminado: el tablero queda muerto pase lo que pase
  if (isClockMode && clock.phase === 'finished') {
    setIsBoardLocked(true);
    return;
  }
  if (isAtLastMove) {
    setIsBoardLocked(puzzleSolved ? true : false);
  } else {
    setIsBoardLocked(true);
  }
}, [viewIndex, fenHistory.length, puzzleSolved, isClockMode, clock.phase]);

// Efecto para ajustar el rango de ELO recomendado cuando se active el modo recomendado o cambie el ELO global del usuario
useEffect(() => {
  if (isRecommendedMode) {
    setEloRange(getRecommendedRange(userRatings['global'] || 1200));
  }
}, [isRecommendedMode, userRatings['global'] || 1200]);

useEffect(() => {
  // Misma duración que la eval bar (350ms) para que ambas transiciones se sientan sincronizadas
  moveListHeight.value = withTiming(
    analysisEngine.isAnalysisMode ? MULTI_PV_HEIGHT : MOVE_LIST_HEIGHT,
    { duration: 350 }
  );
}, [analysisEngine.isAnalysisMode, MULTI_PV_HEIGHT]);
const moveListWrapperAnimatedStyle = useAnimatedStyle(() => ({ height: moveListHeight.value, }));

// Sirve para el grafico de sesion actual (al lado del ELO)
useEffect(() => {
  const currentGlobalElo = userRatings['global'];
  if (currentGlobalElo === undefined) return; // Aún no cargó desde SQLite

  if (!hasSeededSessionElo.current) {
    // Primera carga real: sembramos el punto de partida de la sesión, no lo tratamos como "cambio"
    setSessionEloHistory([currentGlobalElo]);
    hasSeededSessionElo.current = true;
    return;
  }
  // El ELO global cambió (puzzle resuelto/fallado): añadimos el nuevo punto a la sesión
  setSessionEloHistory(prev => [...prev, currentGlobalElo]);
}, [userRatings['global']]);

const eloRowProgress = useSharedValue(1);
const ELO_ROW_HEIGHT = 76; // altura fija de la fila (badge + sparkline); ajusta si no encaja
const STREAK_SLOT_HEIGHT = 42; // 8 margin + 12 padding + ~18 texto + 2 borde
const CLOCK_ROW_HEIGHT = 136;// 3 filas de 34 + 2 gaps de 6 + 16 de padding + 2 de borde = 132; 136 deja holgura

useEffect(() => {
  eloRowProgress.value = withTiming(analysisEngine.isAnalysisMode ? 0 : 1, { duration: 350 });
}, [analysisEngine.isAnalysisMode]);


const eloRowAnimatedStyle = useAnimatedStyle(() => ({
  height: (isClockMode ? CLOCK_ROW_HEIGHT : ELO_ROW_HEIGHT + STREAK_SLOT_HEIGHT) * eloRowProgress.value,
  opacity: eloRowProgress.value,
  marginBottom: 12 * eloRowProgress.value,
}), [isClockMode]);

// --- TRANSICIÓN DE TABLERO EN CONTRARRELOJ ---
const BOARD_SLIDE_OUT = 70;
const BOARD_SLIDE_IN = 100;
const BOARD_GAP = 20; 
const boardSlideX = useSharedValue(0);
const boardSlideStyle = useAnimatedStyle(() => ({ transform: [{ translateX: boardSlideX.value }] }));

const hasSlidOnceRef = useRef(false);
const pendingEntryRef = useRef(false);
const entryFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

const runBoardEntry = useCallback(() => {
  if (!pendingEntryRef.current) return;
  pendingEntryRef.current = false;
  if (entryFallbackRef.current) { clearTimeout(entryFallbackRef.current); entryFallbackRef.current = null; }

  // Dos frames: el primero cierra el commit de React, el segundo deja que las
  // vistas nativas de las piezas se hayan creado antes de empezar a mover nada.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    boardSlideX.value = withDelay(
      BOARD_GAP,
      withTiming(0, { duration: BOARD_SLIDE_IN, easing: Easing.out(Easing.cubic) })
    );
  }));
}, []);

// 1) Puzle nuevo: aparcamos el tablero a la derecha y esperamos. Aquí NO se anima.
useEffect(() => {
  if (!currentPuzzle) return;

  // El primer puzle de la sesión no viene de ningún sitio: aparece sin deslizar
  if (!hasSlidOnceRef.current) {
    hasSlidOnceRef.current = true;
    boardSlideX.value = 0;
    return;
  }

  boardSlideX.value = SCREEN_WIDTH;
  pendingEntryRef.current = true;

  // Red de seguridad: si la solución viene vacía, firstMoveDone nunca se pone
  // a true y el tablero se quedaría fuera de pantalla para siempre.
  if (entryFallbackRef.current) clearTimeout(entryFallbackRef.current);
  entryFallbackRef.current = setTimeout(runBoardEntry, 1800);
}, [currentPuzzle?.id, runBoardEntry]);

// Entra en cuanto hay piezas; la máquina mueve ya en pantalla
useEffect(() => {
  if (pieces.length > 0) runBoardEntry();
}, [pieces.length, runBoardEntry]);

useEffect(() => () => { if (entryFallbackRef.current) clearTimeout(entryFallbackRef.current); }, []);

// Evita que un doble toque encadene dos salidas: durante los BOARD_SLIDE_OUT ms
// isNextDisabled todavía es false, porque loadSinglePuzzle aún no ha corrido.
const isSwappingRef = useRef(false);

// Salida por la izquierda -> carga -> la entrada la dispara el efecto de currentPuzzle.id
const slidePuzzle = useCallback((load: () => void, delayMs = 0) => {
  if (isSwappingRef.current) return;
  isSwappingRef.current = true;

  setTimeout(() => {
    // En contrarreloj el reloj pudo agotarse durante la pausa
    if (isClockMode && clock.phaseRef.current !== 'running') {
      isSwappingRef.current = false;
      return;
    }
    boardSlideX.value = withTiming(-SCREEN_WIDTH, { duration: BOARD_SLIDE_OUT, easing: Easing.in(Easing.cubic) });

    setTimeout(() => {
      isSwappingRef.current = false;
      if (isClockMode && clock.phaseRef.current !== 'running') return;
      load();
    }, BOARD_SLIDE_OUT);
  }, delayMs);
}, [isClockMode]);

const swapClockPuzzle = useCallback((nextRange: number[], delayMs: number) => {
  slidePuzzle(() => loadSinglePuzzle(db, nextRange, [], { fast: true }), delayMs);
}, [db, slidePuzzle]);

// Modo puzles: Next y Skip
const handleNextPuzzle = useCallback(() => {
  if (isNextDisabled) return;
  slidePuzzle(() => loadSinglePuzzle(db));
}, [db, isNextDisabled, slidePuzzle]);

const streakSlotAnimatedStyle = useAnimatedStyle(() => ({
  height: STREAK_SLOT_HEIGHT * eloRowProgress.value,
  opacity: eloRowProgress.value,
}));

const handleEngineSequencePress = async (moves: string[]) => {
  if (!moves || moves.length === 0) return;

  // Si ya hay una secuencia en curso, ignoramos el nuevo clic en vez de
  // dejar que compita con la llamada anterior.
  if (analysisEngine.isSequencePlayingRef.current) return;

  // 0. Pausamos el motor mientras se reproduce la secuencia animada,
  // para que no reposicione ni busque en cada posición intermedia.
  analysisEngine.isSequencePlayingRef.current = true;
  await analysisEngine.pauseSearch();

  // 1. Creamos copias locales del tablero y el índice actual.
  // Estas copias se irán actualizando en cada iteración del bucle,
  // esquivando el problema de que el estado de React no se actualice a tiempo.
  let localGame = new Chess(game.fen());
  let localViewIndex = viewIndex;

  for (let i = 0; i < moves.length; i++) {
    const uciMove = moves[i];
    if (!uciMove || uciMove.length < 4) continue;
    
    const from = uciMove.slice(0, 2) as Square;
    const to = uciMove.slice(2, 4) as Square;
    const promotion = uciMove.length === 5 ? uciMove[4] : 'q'; 
    
    // 2. Aplicamos el movimiento en nuestro motor local
    const move = localGame.move({ from, to, promotion });
    if (!move) continue; // Si es ilegal por algún motivo, saltamos
    
    const nextFen = localGame.fen();
    const isCapture = 'captured' in move;

    // 3. Feedback visual y sonoro (igual que en modo análisis)
    if (isCapture) {
      hapticImpact('heavy');
      playSound('capture');
    } else {
      hapticImpact('medium');
      playSound('move');
    }

    // 4. Movemos la identidad de la pieza para la animación (esto es síncrono)
    applyMoveIdentity(move);

    // 5. Actualizamos todos los estados de React basándonos en nuestras variables locales
    setLastMoveFrom(from);
    setLastMoveTo(to);
    
    setGame(new Chess(nextFen));
    syncPiecesFromGame(localGame);

    setMoveHistory(prev => {
      const truncated = prev.slice(0, localViewIndex);
      return [...truncated, move.san];
    });

    // Mantiene fenHistory en sincronía con viewIndex. Cortar en localViewIndex + 1
    // descarta cualquier rama "futura": si vuelves a "c" y juegas otra cosa,
    // "d" y "e" dejan de existir.
    setFenHistory(prev => {
      const truncated = prev.slice(0, localViewIndex + 1);
      return [...truncated, nextFen];
    });

    // 6. Incrementamos el índice local para el siguiente ciclo del bucle
    localViewIndex++;
    setViewIndex(localViewIndex);

    // 7. Pausa para dar tiempo a la animación de la pieza antes del siguiente movimiento
    if (i < moves.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 400));
    }
  }
  
  clearSelection();
  setIsReviewMode(false);

  // Reanudamos el análisis en la posición final (pausado en el paso 0), una sola vez
  analysisEngine.isSequencePlayingRef.current = false;
  
  if (analysisEngine.isAnalysisMode) {
    analysisEngine.restartSearch(localGame.fen());
  }
};

// Abrir un modal justo cuando otro se está cerrando parpadea en Android.
// Cerramos el menú y encolamos la apertura tras la animación de salida.
const openFromMenu = useCallback((open: () => void) => {
  setIsMenuVisible(false);
  setTimeout(open, 220);
}, []);

// El reloj no arranca al pulsar EMPEZAR, sino cuando el primer puzle ya es
// jugable: entre medias hay una consulta SQL y el movimiento de la máquina.
useEffect(() => {
  if (clock.phase === 'arming' && firstMoveDone && !loading) {
    clock.beginCountdown();
  }
}, [clock.phase, firstMoveDone, loading]);

useEffect(() => {
  if (firstMoveDone && db && !isClockMode) {
    prefetchNext(eloRange, selectedThemes);
  }
}, [firstMoveDone]);

const handleStartClockRun = useCallback((ms: number) => {
  const range = clock.armRun(ms);
  loadSinglePuzzle(db, range, [], { fast: true });
}, [db]);

const handleExitClock = useCallback(() => {
  clock.abortRun();
  setAppMode('puzzles');
  loadSinglePuzzle(db);
}, [db]);

const handleSelectMode = useCallback((mode: AppMode) => {
  setIsMenuVisible(false);
  if (mode === appMode) return;
  setAppMode(mode);
  if (mode === 'clock') {
    setTimeout(() => clock.openStart(), 220); // evita el parpadeo de modales en Android
  } else {
    clock.abortRun();
    loadSinglePuzzle(db);
  }
}, [appMode, db]);

// Carga inicial de la base de datos y primer puzzle
useEffect(() => {
  async function setup() {
    const database = await openPuzzleDatabase();
    setDb(database);

    let savedRange = eloRange;
    let savedThemes = selectedThemes;
    let restoredPuzzle: Puzzle | null = null;
    
    try {
      const localRange = await AsyncStorage.getItem('@elo_range');
      const localThemes = await AsyncStorage.getItem('@selected_themes');
      const localRecommended = await AsyncStorage.getItem('@is_recommended_mode');
      
      // VOLVEMOS A LEER EL PUZLE GUARDADO DE LA SESIÓN ANTERIOR
      const localPuzzle = await AsyncStorage.getItem('@current_puzzle');

      if (localRange) {
        const parsedRange = JSON.parse(localRange);
        setEloRange(parsedRange);
        savedRange = parsedRange; 
      }
      if (localThemes) {
        const parsedThemes = JSON.parse(localThemes);
        setSelectedThemes(parsedThemes);
        savedThemes = parsedThemes;
      }
      if (localRecommended) {
        setIsRecommendedMode(JSON.parse(localRecommended));
      }
      if (localPuzzle) {
        restoredPuzzle = JSON.parse(localPuzzle);
      }
    } catch (error) {
      console.error("Error al cargar los datos desde AsyncStorage:", error);
    }

    // EVALUAMOS: ¿Tenía un puzle guardado?
    if (restoredPuzzle) {
      // Inicializamos el estado visual sin forzar el movimiento automático corrupto
      resetPuzzleState(restoredPuzzle, true); 
      setCurrentPuzzle(restoredPuzzle);
      setSolutionRevealed(false);
    } else {
      // Si no tenía ningún puzle guardado de antes, traemos uno nuevo de forma normal
      loadSinglePuzzle(database, savedRange, savedThemes); 
    }
  }
  setup();
}, []);


return (
  <GestureHandlerRootView style={{ flex: 1 }}>
    <View style={styles.container} onLayout={onRootLayout}>
      <StatusBar barStyle="light-content" />

      {/* Fondo para deseleccionar piezas al tocar fuera */}
      <Pressable style={StyleSheet.absoluteFill} onPress={stableClearSelection} />

      <View style={styles.mainWrapper}>
          
      <View style={styles.headerRow}>
        {/* BOTÓN MENÚ (modos + análisis + ajustes) */}
        <TouchableOpacity style={styles.menuBtn} onPress={() => setIsMenuVisible(true)}>
          <Ionicons name="menu" size={34} color={PALETTE.primary} />
        </TouchableOpacity>

        <View style={styles.headerSpacer} />

        {/* BOTÓN FILTROS */}
        {!isClockMode && (
          <TouchableOpacity style={styles.openFiltersBtn} onPress={() => setIsFilterModalVisible(true)}>
            <View style={styles.filterLeftGroup}>
              <Ionicons name="options-outline" size={16} color={PALETTE.primary} />
              <Text style={styles.openFiltersText}>FILTERS</Text>
            </View>

            {selectedThemes.length > 0 && (
              <View style={styles.filterBadgeCount}>
                <Text style={styles.filterBadgeText}>{selectedThemes.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* BOTÓN HISTORIAL */}
        {!isClockMode && (
          <TouchableOpacity style={styles.openFiltersBtn} onPress={() => openHistory()}>
            <View style={styles.filterLeftGroup}>
              <Ionicons name="stats-chart-outline" size={16} color={PALETTE.primary} />
              <Text style={styles.openFiltersText}>HISTORY</Text>
            </View>
          </TouchableOpacity>              
        )}
      </View>


      {/* ELO Global + evolución de la sesión (se colapsa en modo análisis) */}
      <Animated.View style={[styles.eloSessionRowOuter, eloRowAnimatedStyle]}>
        {isClockMode ? (
          <ClockProgressGrid attempts={clock.attempts} />
        ) : (
          <>
            <View style={styles.eloSessionRow}>
              {hasBooted ? (
                <>
                  <EloBadge target={userRatings['global']} feedback={eloFeedback} />
                  <SessionEloSparkline data={sessionEloHistory} globalElo={userRatings['global'] || 1200} />
                </>
              ) : (
                <>
                  <Skeleton width={90} height={50} radius={14} />
                  <Skeleton height={70} radius={14} style={{ flex: 1 }} />
                </>
              )}
            </View>

            <Animated.View style={[styles.streakSlot, streakSlotAnimatedStyle]}>
              {currentStreak >= 2 && <StreakBadge streak={currentStreak} />}
            </Animated.View>
          </>
        )}
      </Animated.View>

      <View style={styles.containerMainContent}>


        {/* 2. CRONÓMETRO + INDICADOR DE TURNO */}
        <View style={styles.turnRow}>
          <View style={styles.turnRowSide}>
            {isClockMode ? (
              <CountdownTimer
                endsAt={clock.endsAt}
                durationMs={clock.durationMs}
                isFinished={clock.phase === 'finished'}
              />
            ) : (
              settings.isSettingsLoaded && settings.showTimer && (
                <PuzzleTimer startedAt={timerStartedAt} frozenMs={solveElapsedMs} result={timerResult} />
              )
            )}
          </View>
          
          <View style={styles.turnIndicatorFrame}>
            <View style={[
              styles.turnDot, 
              { 
                backgroundColor: playerColor === 'w' ? '#fff' : '#000',
                borderColor: '#555',
                borderWidth: playerColor === 'b' ? 1.5 : 0 
              }
            ]} />
            <Text style={styles.turnText}>
              {playerColor === 'w' ? "WHITE TO MOVE" : "BLACK TO MOVE"}
            </Text>
          </View>

          {/* Columna fantasma: mantiene el pill exactamente centrado */}
          <View style={styles.turnRowSide} />
        </View>

          {/* 3. TABLERO DE AJEDREZ */}
          <View style={styles.boardSection}>
              <Animated.View
                style={[styles.boardWrapper, boardSlideStyle]}
                renderToHardwareTextureAndroid
                shouldRasterizeIOS
                collapsable={false}
              >
              <ChessBoard 
                pieces={pieces}
                onSquarePress={stableSquarePress} 
                onDragMove={stableDragMove}
                selectedSquare={selectedSquare} 
                legalMoves={legalMoves} 
                orientation={playerColor}
                hintSquare={isAtLastMove ? hintSquare : null} 
                hintMove={isAtLastMove ? hintMove : null}
                successSquare={successSquare}
                errorSquare={errorSquare}
                inCheck={boardStatus.inCheck}
                isMate={boardStatus.isMate}
                turn={boardStatus.turn}
                lastMoveFrom={lastMoveFrom}
                lastMoveTo={lastMoveTo}
                bestEngineMove={analysisEngine.bestEngineMove}
                isAnalysisMode={analysisEngine.isAnalysisMode}
                centipawnScore={analysisEngine.centiPawnScore}
                mateInMoves={analysisEngine.mateInMoves}
                showLegalMoves={settings.showLegalMoves}
                moveDurationMs={isClockMode ? CLOCK_TIMING.pieceMove : undefined}
              />
            </Animated.View>
          </View>
    
            {/* 3. ID PUZZLE · ELO (MINIMALISTA) */}
            <View style={styles.puzzleMetaContainer}>
              <View style={styles.puzzleMetaRow}>
                {hasBooted && currentPuzzle ? (
                  <>
                    <Text style={styles.puzzleMetaText}>
                      #{String(currentPuzzle.id).toUpperCase()}
                    </Text>
                    <Text style={styles.bulletSeparator}>·</Text>
                    <Text style={styles.puzzleMetaText}>
                      PUZZLE ELO {currentPuzzle.rating}
                    </Text>
                  </>
                ) : (
                  <>
                    <Skeleton width={70} height={12} />
                    <View style={{ width: 20 }} />
                    <Skeleton width={120} height={12} />
                  </>
                )}
              </View>
            </View>

            {/* 4. ÁREA DINÁMICA: HISTORIAL SAN o MULTI-PV */}
            <Animated.View style={[styles.moveListWrapper, analysisEngine.isAnalysisMode && styles.multiPvWrapper, moveListWrapperAnimatedStyle]}>
              {isClockMode ? (
                // Sin entering/exiting: el modo no cambia a mitad de partida y una animación
                // anidada bloquearía el exiting del padre
                <ClockScoreBar solved={clock.solved} failed={clock.failed} />
              ) : !analysisEngine.isAnalysisMode ? (
                <Animated.View key="move-history" entering={FadeIn.duration(200).delay(120)} exiting={FadeOut.duration(120)} style={{ flex: 1, justifyContent: 'center' }}>
                  <MoveList moveHistory={moveHistory} viewIndex={viewIndex} onMovePress={handleMovePress} />
                </Animated.View>
              ) : (
                <Animated.View key="multi-pv" entering={FadeIn.duration(200).delay(120)} exiting={FadeOut.duration(120)} style={styles.analysisLinesContainer}>
                  <AnalysisLines 
                    engineLines={analysisEngine.engineLines} 
                    fen={boardStatus.fen} onSequencePress={handleEngineSequencePress} 
                    isEvaluating={analysisEngine.isEvaluating} 
                    placeholderHeight={MULTI_PV_HEIGHT - 20}/>
                </Animated.View>
              )}
            </Animated.View>

        </View>

        {isClockMode ? (
          <View style={styles.clockFooterSpacer} />
        ) : (
          <BoardControls
            viewIndex={viewIndex}
            fenHistoryLength={fenHistory.length}
            onNavigate={navigateHistory}
            message={message}
            isAnalysisMode={analysisEngine.isAnalysisMode}
            solutionRevealed={solutionRevealed}
            onShowSolution={showSolution}
            onStartAnalysis={startAnalysis}
            onRetry={handleRetry}
            onNextPuzzle={handleNextPuzzle}
            onHint={handleHint}
            isNextDisabled={isNextDisabled}
          />
        )}

      </View>

    {/* --- MODALES --- */}

    <MainMenuModal
      visible={isMenuVisible}
      onClose={() => setIsMenuVisible(false)}
      currentMode={appMode}
      onSelectMode={handleSelectMode}
      onOpenSupport={() => openFromMenu(() => setIsSupportModalVisible(true))}
      onOpenSettings={() => openFromMenu(() => setIsSettingsModalVisible(true))}
    />

    <FilterModal
      visible={isFilterModalVisible}
      onClose={() => setIsFilterModalVisible(false)}
      db={db}
      currentEloRange={eloRange}
      currentSelectedThemes={selectedThemes}
      currentIsRecommendedMode={isRecommendedMode}
      globalElo={userRatings['global'] || 1200}
      onApply={(newRange, newThemes, newRecommendedMode) => {
        setEloRange(newRange);
        setSelectedThemes(newThemes);
        setIsRecommendedMode(newRecommendedMode);
        setIsFilterModalVisible(false);
        loadSinglePuzzle(db, newRange, newThemes);
      }}
    />

    <SettingsModal
      visible={isSettingsModalVisible}
      onClose={() => setIsSettingsModalVisible(false)}
      onPreviewSound={() => playSound('move')}
    />
    
    <HistoryModal
      visible={isHistoryModalVisible}
      onClose={closeHistory}
      globalElo={userRatings['global'] || 1200}
      eloHistoryData={eloHistoryData}
      recentPuzzles={recentPuzzles}
      isHistoryListReady={isHistoryListReady}
      selectedHistoryItem={selectedHistoryItem}
      onSelectPuzzle={selectHistoryPuzzle}
    />

    <PromotionModal
      visible={promotionModalVisible}
      playerColor={playerColor}
      getPieceImage={getPromotionPieceImage}
      onSelect={(piece) => pendingMove && executeMove(pendingMove.from, pendingMove.to, piece)}
      onCancel={() => {
        setPromotionModalVisible(false);
        setPendingMove(null);
        clearSelection();
        syncPiecesFromGame(game);
      }}
    />

    <SupportModal
      visible={isSupportModalVisible}
      onClose={() => {
        setIsSupportModalVisible(false);
        // Reseteamos con retardo para que no se vea el cambio de texto
        // mientras el modal se está cerrando.
        setTimeout(donations.resetStatus, 400);
      }}
      products={donations.products}
      status={donations.status}
      isAvailable={donations.isAvailable}
      connected={donations.connected}
      onDonate={donations.donate}
    />

      <ClockStartModal
        visible={clock.isStartVisible}
        db={db}
        onClose={() => { clock.closeStart(); if (clock.phase === 'idle') setAppMode('puzzles'); }}
        onStart={handleStartClockRun}
      />

    <ClockResultModal
      visible={clock.isResultVisible}
      summary={clock.summary}
      ranking={clock.ranking}
      onPlayAgain={() => { clock.closeResult(); handleStartClockRun(clock.durationMs); }}
      onExit={() => { clock.closeResult(); handleExitClock(); }}
    />

    {analysisEngine.isAnalysisMode && (
      <View style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}>
        {analysisEngine.StockfishWebView}
      </View>
    )}
  </View>
</GestureHandlerRootView>
);
}

const styles = StyleSheet.create({
// --- CONTENEDORES PRINCIPALES ---
container: { flex: 1, backgroundColor: PALETTE.background },
mainWrapper: { flex: 1, paddingTop: 40, paddingBottom: 10, alignItems: 'center' },
containerMainContent: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', marginTop: 60, marginBottom: 30 },

  // --- CABECERA Y META-DATA ---
headerRow: { flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', gap: 10, width: SCREEN_WIDTH * 0.95, alignSelf: 'center', marginTop: Platform.OS === 'ios' ? 10 : 20, marginBottom: 15, paddingHorizontal: 5 },
headerLeftGroup: { flexDirection: 'row', alignItems: 'center', },
supportBtn: { marginLeft: 8, marginRight: 4, flexDirection: 'row', alignItems: 'center', backgroundColor: PALETTE.surface, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: PALETTE.surfaceLight },
openFiltersBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: PALETTE.surface, paddingVertical: 10, paddingHorizontal: 15, borderRadius: 12, borderWidth: 1, borderColor: PALETTE.surfaceLight },
filterLeftGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
iconBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: PALETTE.surface, borderRadius: 12, borderWidth: 1, borderColor: PALETTE.surfaceLight },
menuBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginLeft: -6, marginRight: 2 },
openFiltersText: { color: PALETTE.primary, fontWeight: '800', fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase' },
filterBadgeCount: { backgroundColor: PALETTE.primary, minWidth: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center', marginLeft: 10, paddingHorizontal: 3 },
filterBadgeText: { color: PALETTE.surface, fontSize: 10, fontWeight: 'bold' },
puzzleMetaContainer: { marginTop: 1, marginBottom: 1, alignItems: 'center', width: '95%' },
puzzleMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 40 },
puzzleMetaText: { color: PALETTE.primary, fontSize: 13, fontWeight: '700', letterSpacing: 1.5, alignSelf: 'center', textAlign: 'center' },
bulletSeparator: { color: PALETTE.primary, fontSize: 34, paddingHorizontal: 8 },
minimalTag: { backgroundColor: PALETTE.tagBg, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: PALETTE.tagBorder },
headerSpacer: { flex: 1 },

// --- INDICADOR DE TURNO
turnIndicatorFrame: { flexDirection: 'row', alignItems: 'center', backgroundColor: PALETTE.surface, paddingVertical: 6, paddingHorizontal: 20, borderRadius: 25, borderWidth: 1, borderColor: PALETTE.surfaceLight, elevation: 4 },
turnDot: { width: 14, height: 14, borderRadius: 7, marginRight: 12 },
turnText: { color: PALETTE.accent, fontSize: 13, fontWeight: '800', letterSpacing: 1.2 },
turnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: SCREEN_WIDTH * 0.98, alignSelf: 'center', marginBottom: 10 },
turnRowSide: { flex: 1, alignItems: 'flex-end', paddingRight: 8 },

// --- SECCIÓN DEL TABLERO ---
boardSection: { width: '100%', alignItems: 'center', overflow: 'hidden' },
boardWrapper: { width: SCREEN_WIDTH, borderWidth: 0, borderColor: PALETTE.surface, borderRadius: 4, elevation: 0, shadowColor: '#000000', alignItems: 'center' },

// --- CONTROLES DE NAVEGACIÓN Y ACCIÓN ---
multiPvWrapper: { paddingVertical: 10, justifyContent: 'flex-start', backgroundColor: 'transparent', borderWidth: 0, borderRadius: 0, },
analysisLinesContainer: { width: '100%', alignItems: 'center', gap: 1, justifyContent: 'flex-start', },
streakSlot: { width: '100%', alignItems: 'center', justifyContent: 'flex-start', overflow: 'hidden' },

// --- MODAL DE FILTROS ---
moveListWrapper: { height: 40, backgroundColor: PALETTE.surface, borderRadius: 8, marginTop: 1, marginBottom: 2, width: '98%', justifyContent: 'center', borderWidth: 1, borderColor: PALETTE.surfaceLight },
eloSessionRowOuter: { width: SCREEN_WIDTH * 0.95, alignSelf: 'center', overflow: 'hidden' },
eloSessionRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },

// --- MODO CONTRARELOJ ---
clockFooterSpacer: { height: 69, marginTop: 'auto', marginBottom: 20 },
});