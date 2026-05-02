import { PALETTE } from '@/src/components/colors';
import { Ionicons } from '@expo/vector-icons';
import MultiSlider from '@ptomasroos/react-native-multi-slider';
import { Chess, Square } from "chess.js";
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import * as NavigationBar from 'expo-navigation-bar';
import * as SQLite from 'expo-sqlite';
import React, { useEffect, useState } from "react";
import { Dimensions, Image, Modal, Platform, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Pressable } from 'react-native-gesture-handler';
import { CHESS_THEMES } from '../src/components/chess_themes';
import ChessBoard, { pieceImages } from "../src/components/ChessBoard";

let pieceIdentityMap: Record<string, string> = {};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Puzzle {
  id: string; fen: string; solution: string[]; rating: number; themes: string;
}

export default function App() {
  const [db, setDb] = useState<SQLite.SQLiteDatabase | null>(null);
  const [currentPuzzle, setCurrentPuzzle] = useState<Puzzle | null>(null);
  const [loading, setLoading] = useState(true);
  const [availableCount, setAvailableCount] = useState(0);
  const [eloRange, setEloRange] = useState([1400, 1800]);

  const [game, setGame] = useState(new Chess());
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalMoves, setLegalMoves] = useState<string[]>([]);
  const [hintSquare, setHintSquare] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [puzzleSolved, setPuzzleSolved] = useState(false);
  const [firstMoveDone, setFirstMoveDone] = useState(false);
  const [solutionStep, setSolutionStep] = useState(0);
  const [fenHistory, setFenHistory] = useState<string[]>([]);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>('w');
  const [isShowingSolution, setIsShowingSolution] = useState(false);
  const [promotionModalVisible, setPromotionModalVisible] = useState(false);
  const [pendingMove, setPendingMove] = useState<{ from: string, to: string } | null>(null);
  const [isBoardLocked, setIsBoardLocked] = useState(false);
  const [viewIndex, setViewIndex] = useState(0); // Qué movimiento del historial estamos viendo
  const [isReviewMode, setIsReviewMode] = useState(false); // Si estamos viendo el pasado o el presente

  const [pieces, setPieces] = useState<PieceItem[]>([]);
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);

  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);
  const [tempEloRange, setTempEloRange] = useState(eloRange);
  const [tempSelectedThemes, setTempSelectedThemes] = useState(selectedThemes);
  const [tempAvailableCount, setTempAvailableCount] = useState(0);
  const handleOpenFilters = () => {setTempEloRange(eloRange); setTempSelectedThemes(selectedThemes); setIsFilterModalVisible(true); };
  const applyFilters = () => {setEloRange(tempEloRange); setSelectedThemes(tempSelectedThemes); setIsFilterModalVisible(false);};

  const [isAnalysisMode, setIsAnalysisMode] = useState(false);

  const clearSelection = () => {setSelectedSquare(null); setLegalMoves([]);};
  const [isNextDisabled, setIsNextDisabled] = useState(false);
  const updateAvailableCount = async (activeDb: SQLite.SQLiteDatabase, range: number[]) => {
  const res = await activeDb.getFirstAsync<{ total: number }>(
      `SELECT COUNT(*) as total FROM puzzles WHERE rating BETWEEN ? AND ? ${getThemeCondition()}`, [range[0], range[1]]
    );
  setAvailableCount(res?.total || 0);
  };

  // Definimos el tipo de pieza (para animaciones, tenemos que saber qué pieza es individualmente)
  interface PieceItem {
    id: string;      // ID único (ej: 'wP1')
    type: string;    // 'p', 'n', etc.
    color: 'w' | 'b';
    square: string;  // 'e4', 'd4', etc.
  }

  // Función para sincronizar las piezas con el tablero de chess.js
  const syncPiecesFromGame = (chessGame: Chess) => {
    const board = chessGame.board();
    const newPieces: PieceItem[] = [];

    board.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        if (cell) {
          const square = String.fromCharCode(97 + colIndex) + (8 - rowIndex);
          
          // Si por alguna razón la pieza no está en el mapa (ej. coronación), le damos uno
          if (!pieceIdentityMap[square]) {
            pieceIdentityMap[square] = `${cell.type}-${cell.color}-${Math.random().toString(36).substring(2, 11)}`;
          }

          newPieces.push({
            id: pieceIdentityMap[square], // ID persistente
            type: cell.type,
            color: cell.color,
            square: square
          });
        }
      });
    });
    setPieces(newPieces);
  };

  // Función vital para mover la "etiqueta" de la pieza en nuestro mapa
  const moveIdentity = (from: string, to: string) => {
    const id = pieceIdentityMap[from];
    if (id) {
    // Si hay una pieza en el destino (captura), eliminamos su ID antiguo
    delete pieceIdentityMap[to]; 
    // Movemos el ID de la pieza que se mueve a la nueva casilla
    pieceIdentityMap[to] = id;
    // Limpiamos la casilla de origen
    delete pieceIdentityMap[from];
    }
  };

  const getThemeCondition = () => {
    if (selectedThemes.length === 0) return "";

    // Generamos una cadena tipo: (themes LIKE '%,1,%' OR themes LIKE '%,5,%')
    // Nota: Es un truco común concatenar comas al buscar para evitar confusiones entre "1" y "11"
    const themeConditions = selectedThemes
      .map(id => `(' ' || themes || ' ') LIKE '% ${id} %'`)
      .join(" AND ");

    return `AND (${themeConditions})`;
  };

  // Función para añadir/quitar temas
  const toggleTheme = (id: string) => {
    setSelectedThemes(prev => 
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const getThemeNames = (themeIdsString: string) => {
    if (!themeIdsString) return "";
    
    // Dividimos el string de la DB "1 22" en un array ["1", "22"]
    const ids = themeIdsString.split(" ");
    
    // Buscamos los nombres en tu constante CHESS_THEMES
    return ids
      .map(id => CHESS_THEMES.find(t => t.id === id)?.name)
      .filter(Boolean) // Eliminamos los que no encuentre
      .join(", ");     // Lo unimos con comas: "Fork, Pin"
  };

  const loadSinglePuzzle = async (activeDb?: SQLite.SQLiteDatabase | null) => {
    // Si el botón está bloqueado, no hacemos nada
    if (isNextDisabled) return;
    // Bloqueamos el botón inmediatamente
    setIsNextDisabled(true);
    setHintSquare(null);
    setIsBoardLocked(false);
    setIsReviewMode(false);
    setIsAnalysisMode(false);
    
    setMoveHistory([]);
    setMoveHistory(prev => prev.slice(0, 1));

    // Vaciamos el mapa de identidades para que el nuevo puzzle 
    // empiece con "identidades" limpias y las piezas hagan FadeIn.
    pieceIdentityMap = {};

    const databaseToUse = activeDb || db;
    if (!databaseToUse) return;

    setLoading(true);
    setMessage("");

    const result = await databaseToUse.getAllAsync<any>(
      `SELECT * FROM puzzles WHERE rating BETWEEN ? AND ? ${getThemeCondition()} ORDER BY RANDOM() LIMIT 1`, [eloRange[0], eloRange[1]]
    );

    if (result?.length > 0) {
      const row = result[0];
      const p = { id: String(row.ID ?? row.id), fen: row.FEN ?? row.fen, solution: (row.SOLUTION ?? row.solution).split(' '), rating: Number(row.RATING ?? row.rating), themes: row.themes ?? "" };
      setCurrentPuzzle(p);
      resetPuzzleState(p);
    }

    if (result.length === 0) {
    setMessage("No puzzles, adjust filters");
    setLoading(false);
    setCurrentPuzzle(null); // Limpia el tablero
    } 
    // Volvemos a habilitar el botón después de un pequeño delay
    setTimeout(() => {
      setIsNextDisabled(false);
    }, 800);
  };

  const resetPuzzleState = (puzzle: Puzzle) => {
    const newGame = new Chess(puzzle.fen);

    // --- LIMPIEZA DE UI ---
    setLegalMoves([]);      // Borra los puntitos de movimientos legales
    setSelectedSquare(null); // Quita el color de selección de la casilla
    setMessage("");         // Borra "Correcto/Incorrecto"
    setIsAnalysisMode(false);
    // ----------------------

    // Limpiamos y generamos IDs basados en la posición inicial
      pieceIdentityMap = {};
      newGame.board().forEach((row, rIdx) => {
        row.forEach((cell, cIdx) => {
          if (cell) {
            const sq = String.fromCharCode(97 + cIdx) + (8 - rIdx);
            pieceIdentityMap[sq] = `${cell.type}-${cell.color}-${sq}`;
          }
        });
      });

    // Sincronizamos las piezas inmediatamente para que el primer render tenga datos
    setGame(newGame);
    syncPiecesFromGame(newGame);
    //setPieces([]);
    setTimeout(() => syncPiecesFromGame(newGame), 10);
    setFenHistory([newGame.fen()]);
    setMessage("");
    setPuzzleSolved(false);
    setFirstMoveDone(false);
    setSolutionStep(0);

    // El color del jugador es el OPUESTO al que le toca mover en el FEN inicial,
    // porque la primera jugada de la solución la hace la máquina.
    const turnInFen = newGame.turn(); 
    const pColor = turnInFen === 'w' ? 'b' : 'w'; 
    setPlayerColor(pColor); // <--- Esto fija el texto para todo el puzzle

    // El pequeño delay para el primer movimiento de la máquina 
    // ahora se verá sobre el tablero ya cargado.
    setTimeout(() => {
      const firstMove = puzzle.solution[0];
      const from = firstMove.slice(0, 2) as Square;
      const to = firstMove.slice(2, 4) as Square;

      moveIdentity(from, to);

      const m0 = newGame.move({ from, to, promotion: 'q' });

      // guardamos el primer movimiento en formato san
      if (m0) {
        setMoveHistory([m0.san]); 
      }

      const nextFen = newGame.fen();
      setGame(new Chess(nextFen));
      syncPiecesFromGame(newGame);

      setFenHistory(prev => [...prev, newGame.fen()]);

      const firstMoveFen = newGame.fen();
      setFenHistory([puzzle.fen, firstMoveFen]); // Aquí no hace falta 'prev' porque reiniciamos el array
      setViewIndex(1);
      setIsReviewMode(false);

      setSolutionStep(1);
      setFirstMoveDone(true);
      setLoading(false); // Solo se usa al cargar la DB o un puzzle nuevo
    }, 1000);
  };

  const showSolution = async () => {
    if (!currentPuzzle || isShowingSolution) return;
    
    setIsShowingSolution(true);
    clearSelection();
    setHintSquare(null);

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
      moveIdentity(moveStr.slice(0, 2), moveStr.slice(2, 4));

      playbackGame.move({
        from: moveStr.slice(0, 2) as Square,
        to: moveStr.slice(2, 4) as Square,
        promotion: 'q'
      });

      // Actualizamos el estado visual
      setGame(new Chess(playbackGame.fen()));
      syncPiecesFromGame(playbackGame);
      
      // Guardamos en el historial para que el modo análisis funcione después
      setFenHistory(prev => [...prev, playbackGame.fen()]);

      // Pausa entre movimientos de la solución
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    setPuzzleSolved(true);
    setIsShowingSolution(false);
    setMessage("✅ SOLUCIÓN COMPLETADA");
  };

  const handleRetry = async () => {
    // Si estamos mostrando la solución o no hay historia para deshacer, cancelamos
    if (fenHistory.length < 2 || isShowingSolution) return;

    setHintSquare(null);
    setIsBoardLocked(false);
    setIsShowingSolution(true); // Bloqueamos interacciones durante el rebobinado
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
        // 1. Mover la identidad visual hacia ATRÁS
        const pieceId = pieceIdentityMap[fromSq];
        if (pieceId) {
          // Actualizamos el mapa de identidades
          delete pieceIdentityMap[fromSq];
          pieceIdentityMap[toSq] = pieceId;

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
    //setMoveHistory([]);
    setMoveHistory(prev => prev.slice(0, 1));
  };

// Reset cuando hemos acabado el puzzle correctamente y queremos repetirlo entero
const handleRestartPuzzle = () => {
  if (!currentPuzzle) return;
  //setLoading(true); // Para que se vea la transición
  setMessage("");
  setIsBoardLocked(false);
  setHintSquare(null);
  setPuzzleSolved(false);
  resetPuzzleState(currentPuzzle); // Reutiliza la lógica de carga completa
  setMoveHistory([]);
  setMoveHistory(prev => prev.slice(0, 1));
  };

  useEffect(() => {
    if (Platform.OS === 'android') {
        const hideNavBar = async () => {
          try {
            // Ocultar la barra
            await NavigationBar.setVisibilityAsync("hidden");
      
            // Si prefieres forzar el que tú querías:
            // await NavigationBar.setBehaviorAsync('sticky-swipe' as any);
          } catch (e) {
            console.log("Error configurando la NavigationBar", e);
          }
        };
      hideNavBar();
      StatusBar.setHidden(true); // Opcional: oculta también la de arriba
    }

    async function setup() {
      const dbName = "puzzles_v2.db";
      const dbUri = `${FileSystem.documentDirectory}SQLite/${dbName}`;
      if (!(await FileSystem.getInfoAsync(dbUri)).exists) {
        await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}SQLite`, { intermediates: true });
        const asset = await Asset.fromModule(require('../assets/puzzles_v2.db')).downloadAsync();
        if (asset.localUri) await FileSystem.copyAsync({ from: asset.localUri, to: dbUri });
      }
      const database = await SQLite.openDatabaseAsync(dbName);
      setDb(database);
      updateAvailableCount(database, eloRange);
      loadSinglePuzzle(database);
    }
    setup();
}, []);

// Actualizar contador y cargar nuevo puzzle cuando cambien los temas
useEffect(() => {
  if (db) {
    updateAvailableCount(db, eloRange);
    loadSinglePuzzle(db);
  }
}, [eloRange, selectedThemes]);

  // Efecto para actualizar el contador dentro del modal en tiempo real
useEffect(() => {
  if (db && isFilterModalVisible) {
    const updateTempCount = async () => {
      // Usamos los estados "temp" para la consulta
      const themeConditions = tempSelectedThemes.length === 0 ? "" : 
        "AND (" + tempSelectedThemes.map(id => `(' ' || themes || ' ') LIKE '% ${id} %'`).join(" AND ") + ")";
      
      const res = await db.getFirstAsync<{ total: number }>(
        `SELECT COUNT(*) as total FROM puzzles WHERE rating BETWEEN ? AND ? ${themeConditions}`, 
        [tempEloRange[0], tempEloRange[1]]
      );
      setTempAvailableCount(res?.total || 0);
    };
    updateTempCount();
  }
}, [tempEloRange, tempSelectedThemes, isFilterModalVisible, db]);

function onSquarePress(square: string) {
  // 1. BLOQUEOS DE SEGURIDAD
  // No permitimos interactuar si:
  // - No se ha hecho el primer movimiento de la máquina (firstMoveDone)
  // - No hay puzzle cargado
  // - El tablero está bloqueado por una animación o carga (isBoardLocked)
  // - Estamos viendo el pasado en el historial (isReviewMode) Y no estamos en modo análisis
  if (!firstMoveDone || !currentPuzzle || (isBoardLocked && !isAnalysisMode)) return;
  if (isReviewMode && !isAnalysisMode) return;

  const targetPiece = game.get(square as any);
  
  // 2. DETERMINAR QUÉ COLOR PUEDE MOVER
  // En Puzzle: Solo el color asignado al jugador (playerColor)
  // En Análisis: El color al que le toque mover según el estado actual del juego (game.turn())
  const turnColor = game.turn();
  const isPlayerTurn = isAnalysisMode 
    ? targetPiece?.color === turnColor 
    : targetPiece?.color === playerColor;

  // 3. LÓGICA DE SELECCIÓN (Si toco una pieza que me pertenece)
  if (isPlayerTurn) {
    if (selectedSquare === square) {
      clearSelection();
    } else {
      setSelectedSquare(square);
      const moves = game.moves({ square: square as any, verbose: true });
      setLegalMoves(moves.map(m => m.to));
    }
    return;
  }

  // 4. LÓGICA DE MOVIMIENTO (Si ya hay una pieza seleccionada e intento moverla)
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
      // Verificamos si es una coronación de peón
      const isPawn = movingPiece.type === 'p';
      const isPromotionRow = (movingPiece.color === 'w' && square[1] === '8') || 
                             (movingPiece.color === 'b' && square[1] === '1');

      if (isPawn && isPromotionRow) {
        setPendingMove({ from: selectedSquare, to: square });
        setPromotionModalVisible(true);
      } else {
        // Ejecutamos movimiento normal (Dama por defecto si no es promoción manual)
        executeMove(selectedSquare, square, 'q');
      }
    } else {
      // Si el movimiento no es legal y no toqué otra pieza mía, limpio la selección
      clearSelection();
    }
  }
}

const executeMove = (from: string, to: string, promotion: string) => {
  if (!currentPuzzle || (isBoardLocked && !isAnalysisMode)) return;

  // 1. Bloqueo de seguridad para evitar doble toque
  if (!isAnalysisMode) {
    setIsBoardLocked(true);
    setHintSquare(null);
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
      // --- A. LÓGICA PARA MODO ANÁLISIS ---
      if (isAnalysisMode) {
        moveIdentity(move.from, move.to);
        const nextFen = gameCopy.fen();

        setGame(new Chess(nextFen));
        syncPiecesFromGame(gameCopy);
        
        setMoveHistory(prev => [...prev, move.san]);
        setFenHistory(prev => {
          const newH = [...prev, nextFen];
          setViewIndex(newH.length - 1);
          return newH;
        });
        clearSelection();
        return; // Salimos, no evaluamos solución
      }

      // --- B. LÓGICA PARA MODO PUZZLE ---
      const expectedMove = currentPuzzle.solution[solutionStep];
      const isCorrect = playerMoveWithPromotion === expectedMove || moveStr === expectedMove;

      const playerSAN = move.san;
      setMoveHistory(prev => [...prev, playerSAN]);
      moveIdentity(move.from, move.to);
      
      const nextFen = gameCopy.fen();
      setGame(new Chess(nextFen));
      syncPiecesFromGame(gameCopy);

      if (isCorrect) {
        const nextStep = solutionStep + 1;

        if (nextStep === currentPuzzle.solution.length) {
          // PUZZLE FINALIZADO CON ÉXITO
          setFenHistory(prev => {
            const newH = [...prev, nextFen];
            setViewIndex(newH.length - 1);
            return newH;
          });
          setTimeout(() => { 
            setMessage("✅ CORRECTO"); 
            setPuzzleSolved(true); 
            setIsBoardLocked(false);
          }, 250);
        } else {
          // TURNO DE LA MÁQUINA (Respuesta automática)
          setSolutionStep(nextStep + 1);
          const resp = currentPuzzle.solution[nextStep];
          
          setTimeout(() => {
            const gameAfterResp = new Chess(gameCopy.fen());
            const mResp = gameAfterResp.move({ 
              from: resp.slice(0, 2) as Square, 
              to: resp.slice(2, 4) as Square, 
              promotion: 'q' 
            });
            
            if (mResp) {
              setMoveHistory(prev => [...prev, mResp.san]);
              moveIdentity(mResp.from, mResp.to);
            }
            
            const finalFen = gameAfterResp.fen();
            setGame(new Chess(finalFen));
            syncPiecesFromGame(gameAfterResp);

            setFenHistory(prevHistory => {
              const newHistory = [...prevHistory, nextFen, finalFen];
              setViewIndex(newHistory.length - 1);
              setIsReviewMode(false);
              return newHistory;
            });

            setIsBoardLocked(false); 
          }, 450);
        }
      } else {
        // MOVIMIENTO INCORRECTO
        setFenHistory(prev => {
          const newH = [...prev, nextFen];
          setViewIndex(newH.length - 1);
          return newH;
        });
        setTimeout(() => { 
          setMessage("❌ INCORRECTO"); 
          setPuzzleSolved(false); 
          // No desbloqueamos el tablero para forzar el uso de Retry o Solution
        }, 250);
      }
    }
  } catch (e) {
    // Movimiento ilegal según chess.js: no hacemos nada
    setIsBoardLocked(false);
  }
  
  clearSelection();
  setPromotionModalVisible(false);
  setPendingMove(null);
};

const RenderMoveList = () => {
  return (
    <View style={styles.moveListWrapper}>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.moveListContent}
      >
        {moveHistory.map((move, index) => {
          const isWhite = index % 2 === 0;
          const moveNumber = Math.floor(index / 2) + 1;

          return (
            <View key={index} style={styles.moveItem}>
              {isWhite && (
                <Text style={styles.moveNumberText}>{moveNumber}.</Text>
              )}
              <Text style={[
                styles.moveText,
                viewIndex === index + 1 && styles.activeMoveText // Resaltar si estamos navegando el historial
              ]}>
                {move}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

const navigateHistory = (direction: 'prev' | 'next') => {
  setFenHistory(currentHistory => {
    let newIndex = viewIndex;
    if (direction === 'prev' && viewIndex > 0) newIndex = viewIndex - 1;
    else if (direction === 'next' && viewIndex < currentHistory.length - 1) newIndex = viewIndex + 1;

    if (newIndex !== viewIndex) {
      const targetGame = new Chess(currentHistory[newIndex]);
      const targetBoard = targetGame.board();
      const nextMap: Record<string, string> = {};
      
      // 1. Mantenemos un registro de IDs del mapa anterior que ya hemos REUTILIZADO
      // para no asignarle el mismo ID a dos piezas diferentes en el nuevo estado.
      const usedOldKeys = new Set<string>();

      // PASO A: Prioridad absoluta - Piezas que NO se han movido de su casilla
      targetBoard.forEach((row, rIdx) => {
        row.forEach((cell, cIdx) => {
          if (cell) {
            const sq = String.fromCharCode(97 + cIdx) + (8 - rIdx);
            const oldId = pieceIdentityMap[sq];
            const pieceTypeColor = `${cell.type}-${cell.color}`;

            if (oldId && oldId.startsWith(pieceTypeColor)) {
              nextMap[sq] = oldId;
              usedOldKeys.add(sq);
            }
          }
        });
      });

      // PASO B: Piezas que sí se han movido (Buscamos su ID en el mapa viejo)
      targetBoard.forEach((row, rIdx) => {
        row.forEach((cell, cIdx) => {
          if (cell) {
            const sq = String.fromCharCode(97 + cIdx) + (8 - rIdx);
            if (nextMap[sq]) return; // Ya asignada en el Paso A

            const pieceTypeColor = `${cell.type}-${cell.color}`;
            
            // Buscamos en el mapa viejo una pieza igual que NO haya sido reclamada aún
            const originalSquare = Object.keys(pieceIdentityMap).find(oldSq => {
              const id = pieceIdentityMap[oldSq];
              return id.startsWith(pieceTypeColor) && !usedOldKeys.has(oldSq);
            });

            if (originalSquare) {
              nextMap[sq] = pieceIdentityMap[originalSquare];
              usedOldKeys.add(originalSquare);
            } else {
              // Si es una pieza totalmente nueva (ej: coronación), ID nuevo
              nextMap[sq] = `${pieceTypeColor}-${Math.random().toString(36).substring(2, 9)}`;
            }
          }
        });
      });

      pieceIdentityMap = nextMap;
      setViewIndex(newIndex);
      setIsReviewMode(newIndex !== currentHistory.length - 1);
      setGame(targetGame);
      syncPiecesFromGame(targetGame);
    }
    return currentHistory;
  });
};

const handleMovePress = (targetIndex: number) => {

  // Si pulsamos el mismo índice, no hacemos nada
  if (viewIndex === targetIndex) return;
  
  // Obtenemos el FEN correspondiente del historial
  const targetFen = fenHistory[targetIndex];
  
  if (targetFen) {
    // Actualizamos el motor de ajedrez y el estado visual
    const targetGame = new Chess(targetFen);
    
    // Al viajar al pasado, pieceIdentityMap puede no ser exacto,
    // así que lo limpiamos para que las piezas "aparezcan"
    pieceIdentityMap = {};
    
    setGame(targetGame);
    syncPiecesFromGame(targetGame);
    
    // Actualizamos el índice de vista y activamos el modo revisión
    setViewIndex(targetIndex);
  }
};

useEffect(() => {
  // Verificamos si estamos en la última posición del historial
  const isAtLastMove = viewIndex === fenHistory.length - 1;

  if (isAtLastMove) {
    // Si el puzzle ya fue resuelto, lo dejamos bloqueado de todas formas
    // Si no ha sido resuelto y estamos al final, permitimos jugar
    setIsBoardLocked(puzzleSolved ? true : false);
  } else {
    // Si estamos viendo cualquier movimiento anterior, bloqueamos el tablero
    setIsBoardLocked(true);
  }
}, [viewIndex, fenHistory.length, puzzleSolved]);

const getPromotionPieceImage = (type: string) => {
  // Si el jugador es blanco ('w'), usamos mayúsculas para el diccionario ('Q', 'N'...)
  // Si es negro ('b'), usamos minúsculas ('q', 'n'...)
  const pieceKey = playerColor === 'w' ? type.toUpperCase() : type.toLowerCase();
  return pieceImages[pieceKey];
};

const activeFiltersCount = selectedThemes.length

const handleHint = () => {
  if (!currentPuzzle || puzzleSolved || isBoardLocked) return;

  const moveStr = currentPuzzle.solution[solutionStep];
  if (moveStr) {
    const fromSquare = moveStr.slice(0, 2);
    console.log("Resaltando casilla:", fromSquare); // Debug
    
    setHintSquare(fromSquare);
  }
};

const startAnalysis = () => { // Función para activar el análisis
  setIsAnalysisMode(true);
  setIsBoardLocked(false);
  setIsReviewMode(false);
  setMessage("🔬 MODO ANÁLISIS");
  // Nos aseguramos de estar en el último movimiento del puzzle antes de analizar
  setViewIndex(fenHistory.length - 1);
};

return (
  <View style={styles.container}>
    <StatusBar barStyle="light-content" />
    
    {/* Fondo para deseleccionar piezas al tocar fuera */}
    <Pressable style={StyleSheet.absoluteFill}  onPress={clearSelection} />

      <View style={styles.mainWrapper}>
        
        {/* 1. BOTÓN FILTROS (ARRIBA IZQUIERDA) */}
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.openFiltersBtn} onPress={handleOpenFilters}>
            {/* NUEVO: Agrupamos icono y texto a la izquierda */}
            <View style={styles.filterLeftGroup}>
              <Ionicons name="options-outline" size={16} color={PALETTE.primary} />
              <Text style={styles.openFiltersText}>FILTERS</Text>
            </View>

            {/* El badge se mantiene a la derecha, separado orgánicamente */}
            {activeFiltersCount > 0 && (
              <View style={styles.filterBadgeCount}>
                <Text style={styles.filterBadgeText}>{activeFiltersCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* 2. INDICADOR DE TURNO */}
        <View style={styles.turnIndicatorFrame}>
          <View style={[
            styles.turnDot, 
            { 
              backgroundColor: playerColor === 'w' ? '#fff' : '#000',
              borderColor: '#555', // Este borde hace que el punto negro se vea
              borderWidth: playerColor === 'b' ? 1.5 : 0 
            }
          ]} />
          <Text style={styles.turnText}>
            {playerColor === 'w' ? "WHITE TO MOVE" : "BLACK TO MOVE"}
          </Text>
        </View>

        {/* 3. TABLERO DE AJEDREZ */}
        <View style={styles.boardSection}>
          <View style={styles.boardWrapper}>
            <View style={{ opacity: !currentPuzzle ? 0 : 1 }}>
              <ChessBoard 
                pieces={pieces}
                onSquarePress={onSquarePress} 
                selectedSquare={selectedSquare} 
                legalMoves={legalMoves} 
                orientation={playerColor}
                hintSquare={hintSquare} 
              />
            </View>
          </View>
        </View>

        {/* --- LISTA DE MOVIMIENTOS INTERACTIVA EN NOTACIÓN SAN --- */}
        <View style={styles.moveListWrapper}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.moveListContent}
            ref={(ref) => ref?.scrollToEnd({ animated: true })} // Auto-scroll al último movimiento
          >
            {moveHistory.length === 0 ? (
              <Text style={{ color: PALETTE.secondary, fontSize: 12, opacity: 0.5 }}>
                ...
              </Text>
            ) : (
              moveHistory.map((move, index) => {
                const isWhite = index % 2 === 0;
                const moveNumber = Math.floor(index / 2) + 1;
                
                // El índice del movimiento en moveHistory (0, 1, 2...)
                // se corresponde con el viewIndex (1, 2, 3...)
                const targetViewIndex = index + 1;

                return (
                  <View key={index} style={styles.moveItem}>
                    {isWhite && (
                      <Text style={styles.moveNumberText}>{moveNumber}.</Text>
                    )}
                    
                    {/* --- AQUÍ ESTÁ EL BOTÓN INTERACTIVO --- */}
                    <TouchableOpacity 
                      onPress={() => handleMovePress(targetViewIndex)}
                      style={styles.moveTouchArea}
                    >
                      <Text style={[
                        styles.moveText,
                        // Resaltamos el movimiento actual
                        viewIndex === targetViewIndex && { color: PALETTE.secondary, fontWeight: '900' }
                      ]}>
                        {move}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>

        {/* --- AREA DE MENSAJES DINÁMICOS --- */}
        <View style={styles.statusMessageContainer}>
          {message ? (
            <Text style={[
              styles.statusMessageText,
              message.includes('✅') && { color: PALETTE.success },
              message.includes('❌') && { color: PALETTE.error },
              message.includes('⏪') && { color: PALETTE.primary }
            ]}>
              {message}
            </Text>
          ) : (
            // Espacio vacío para que el layout no "salte" cuando no hay mensaje
            <View style={{ height: 20 }} />
          )}
        </View>

        {/* 4. ID PUZZLE · ELO (MINIMALISTA) */}
        {currentPuzzle && (
          <View style={styles.puzzleMetaContainer}>
            
            {/* FILA SUPERIOR: #ID · ELO */}
            <View style={styles.puzzleMetaRow}>
              <Text style={styles.puzzleMetaText}>
                #{String(currentPuzzle.id).toUpperCase()}
              </Text>
              
              <Text style={styles.bulletSeparator}>·</Text>
              
              <Text style={styles.puzzleMetaText}>
                ELO {currentPuzzle.rating}
              </Text>
            </View>

            {/* 5. FILA INFERIOR: CHIPS DE TEMAS (Asegúrate que getThemeNames devuelva algo) */}
            <View style={styles.themeTagsRow}>
              {getThemeNames(currentPuzzle.themes) ? (
                getThemeNames(currentPuzzle.themes).split(', ').map((name, index) => (
                  <View key={index} style={styles.minimalTag}>
                    <Text style={styles.minimalTagText}>{name.toUpperCase()}</Text>
                  </View>
                ))
              ) : null}
            </View>
            
          </View>
        )}

        {/* --- NUEVA FILA DE CONTROLES MODERNOS (Abajo del todo) --- */}
        <View style={styles.footerSection}>
          <View style={styles.modernControlsRow}>

            {/* IZQUIERDA: Flechas de navegación modernas */}
            <View style={styles.navigationGroup}>
              <TouchableOpacity
                style={[styles.modernNavBtn, viewIndex === 0 && styles.navBtnDisabled]}
                onPress={() => navigateHistory('prev')}
                disabled={viewIndex === 0}
              >
                <Ionicons name="arrow-back" size={24} color={PALETTE.primary}  />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modernNavBtn, viewIndex === fenHistory.length - 1 && styles.navBtnDisabled]}
                onPress={() => navigateHistory('next')}
                disabled={viewIndex === fenHistory.length - 1}
              >
                <Ionicons name="arrow-forward" size={24} color={PALETTE.primary} />
              </TouchableOpacity>
            </View>

            {/* DERECHA: Botón dinámico (Skip / Reintentar / Solución) */}
            <View style={styles.actionGroup}>
              {/* Si el puzzle terminó o se mostró la solución, mostramos ANALYZE */}
              
              {(puzzleSolved || message.includes('❌') || message.includes('SOLUCIÓN')) && !isAnalysisMode && (
                <TouchableOpacity 
                  style={[styles.smallBtn, { backgroundColor: PALETTE.primary, marginBottom: 8 }]} 
                  onPress={startAnalysis}
                >
                  <Ionicons name="analytics-outline" size={14} color="#fff" />
                  <Text style={styles.smallBtnText}>ANALYZE</Text>
                </TouchableOpacity>
              )}
              {message.includes('❌') && !isAnalysisMode ? (
                // Caso: Error
                <View style={styles.smallButtonRow}>
                  <TouchableOpacity style={[styles.smallBtn, { backgroundColor: PALETTE.error}]} onPress={handleRetry}>
                    <Text style={styles.smallBtnText}>RETRY</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.smallBtn, { backgroundColor: PALETTE.success }]} onPress={showSolution}>
                    <Text style={styles.smallBtnText}>SOLUTION</Text>
                  </TouchableOpacity>
                </View>
              ) : message.includes('✅') ? (
                // Caso: Éxito (Botón NEXT grande o similar)
                <View style={styles.smallButtonRow}>
                      <TouchableOpacity 
                        style={[styles.smallBtn, { backgroundColor: PALETTE.secondary }]} 
                        onPress={handleRestartPuzzle}
                      >
                        <Text style={styles.smallBtnText}>RESTART</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.skipBtn, { backgroundColor: PALETTE.success }]}
                        onPress={() => loadSinglePuzzle(db)}
                      >
                        <Text style={[styles.skipBtnText, { color: '#fff' }]}>NEXT</Text>
                      </TouchableOpacity>
                    </View>
              ) : (
                // 3. Caso por defecto: Estado normal (Solution + Skip)
                <View style={styles.smallButtonRow}>
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: PALETTE.primary }]}
                    onPress={handleHint}
                  >
                    <Ionicons name="bulb-outline" size={13} color="#fff" />
                    <Text style={styles.smallBtnText}>HINT</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: PALETTE.warning }]}
                    onPress={showSolution}
                  >
                    <Text style={styles.smallBtnText}>SOLUTION</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.skipBtn, isNextDisabled && { opacity: 1 }]}
                    onPress={() => loadSinglePuzzle(db)}
                    disabled={isNextDisabled}
                  >
                    <Text style={styles.skipBtnText}>SKIP</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>

    {/* --- MODALES --- */}

    {/* 1. Modal de Filtros */}
    <Modal visible={isFilterModalVisible} animationType="slide" transparent={true}>
      <View style={styles.modalOverlay}>
        <View style={styles.filterModalContent}>
          <Text style={styles.modalTitle}>Configurar Puzzles</Text>
          
          {/* CONTADOR DINÁMICO DENTRO DEL MODAL */}
          <View style={[styles.availableContainer, { alignSelf: 'center', marginBottom: 20 }]}>
            <Text style={[
              styles.availableBadge, 
              tempAvailableCount === 0 && { color: PALETTE.warning }
            ]}>
              {tempAvailableCount === 0 ? "SIN PUZZLES DISPONIBLES" : `${tempAvailableCount} PUZZLES ENCONTRADOS`}
            </Text>
          </View>

          <View style={styles.filterSection}>
            <Text style={styles.filterTitle}>DIFICULTAD ELO: {tempEloRange[0]} — {tempEloRange[1]}</Text>
            <MultiSlider 
              values={tempEloRange} 
              sliderLength={SCREEN_WIDTH * 0.7} 
              onValuesChange={setTempEloRange} 
              min={400} max={3000} step={50} 
              selectedStyle={{ backgroundColor: PALETTE.secondary }}
              trackStyle={{ height: 4, backgroundColor: PALETTE.surfaceLight }}
              markerStyle={styles.sliderMarker}
            />
          </View>

          <Text style={styles.filterTitle}>TEMAS TÁCTICOS</Text>
          <ScrollView contentContainerStyle={styles.modalThemesGrid}>
            {CHESS_THEMES.map((theme) => {
              const isSelected = tempSelectedThemes.includes(theme.id);
              return (
                <TouchableOpacity
                  key={theme.id}
                  onPress={() => {
                    setTempSelectedThemes(prev => 
                      isSelected ? prev.filter(id => id !== theme.id) : [...prev, theme.id]
                    );
                  }}
                  style={[styles.themeChip, isSelected && styles.themeChipActive]}
                >
                  <Text style={[styles.themeChipText, isSelected && styles.themeChipTextActive]}>
                    {theme.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity 
              style={[styles.modalBtn, styles.btnCancel]} 
              onPress={() => setIsFilterModalVisible(false)}
            >
              <Text style={styles.btnText}>CANCELAR</Text>
            </TouchableOpacity>

            {/* BOTÓN APLICAR: Se desactiva y cambia de color si no hay puzzles */}
            <TouchableOpacity 
              style={[
                styles.modalBtn, 
                styles.btnApply, 
                tempAvailableCount === 0 && { backgroundColor: PALETTE.disabled, opacity: 0.5 }
              ]} 
              onPress={applyFilters}
              disabled={tempAvailableCount === 0}
            >
              <Text style={styles.btnText}>
                {tempAvailableCount === 0 ? "REVISAR FILTROS" : "APLICAR"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    {/* 2. Modal de Coronación */}
    {promotionModalVisible && (
      <View style={styles.promotionOverlay}>
        <View style={styles.promotionGlassCard}>
          <Text style={styles.promotionTitle}>CORONACIÓN</Text>
          <View style={styles.promotionRow}>
            {['q', 'r', 'b', 'n'].map((p) => (
              <TouchableOpacity 
                key={p} 
                style={styles.promotionPieceContainer}
                onPress={() => pendingMove && executeMove(pendingMove.from, pendingMove.to, p)}
              >
                <View style={[styles.pieceCircle, { backgroundColor: playerColor === 'w' ? PALETTE.boardDark : PALETTE.boardLight }]}>
                  <Image source={getPromotionPieceImage(p)} style={styles.promotionImage} resizeMode="contain" />
                </View>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.cancelPromotion} onPress={() => { setPromotionModalVisible(false); clearSelection(); }}>
            <Text style={styles.cancelText}>CANCELAR</Text>
          </TouchableOpacity>
        </View>
      </View>
    )}

  </View>
);
}

const styles = StyleSheet.create({
  // --- CONTENEDORES PRINCIPALES ---
  container: { flex: 1, backgroundColor: PALETTE.background },
  mainWrapper: { flex: 1, paddingTop: 60, paddingBottom: 50, alignItems: 'center' },
  footerSection: { marginTop: 'auto', width: '100%', alignItems: 'center', marginBottom: 40 },
  loaderOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: PALETTE.surfaceDark },

  // --- CABECERA Y META-DATA ---
  headerRow: { width: '100%', paddingHorizontal: '6%', flexDirection: 'row', marginBottom: 20 },
  openFiltersBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: PALETTE.surface, paddingVertical: 10, paddingHorizontal: 15, borderRadius: 12, borderWidth: 1, borderColor: PALETTE.surfaceLight },
  filterLeftGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  openFiltersText: { color: PALETTE.primary, fontWeight: '800', fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase' },
  filterBadgeCount: { backgroundColor: PALETTE.primary, minWidth: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center', marginLeft: 10, paddingHorizontal: 3 },
  filterBadgeText: { color: PALETTE.surface, fontSize: 10, fontWeight: 'bold' },
  puzzleMetaContainer: { marginTop: 4, alignItems: 'center', width: '95%' },
  puzzleMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  puzzleMetaText: { color: PALETTE.primary, fontSize: 15, fontWeight: '700', letterSpacing: 1.5 },
  bulletSeparator: { color: PALETTE.primary, fontSize: 34, paddingHorizontal: 8 },
  themeTagsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  minimalTag: { backgroundColor: PALETTE.tagBg, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: PALETTE.tagBorder },
  minimalTagText: { color: PALETTE.primary, fontSize: 9, fontWeight: '800' },

  // --- INDICADOR DE TURNO Y MENSAJES ---
  turnIndicatorFrame: { flexDirection: 'row', alignItems: 'center', backgroundColor: PALETTE.surface, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 25, borderWidth: 1, borderColor: PALETTE.surfaceLight, marginBottom: 20, elevation: 4 },
  turnDot: { width: 14, height: 14, borderRadius: 7, marginRight: 12 },
  turnText: { color: PALETTE.accent, fontSize: 13, fontWeight: '800', letterSpacing: 1.2 },
  statusMessageContainer: { width: '100%', alignItems: 'center', justifyContent: 'center', height: 30, marginTop: 10, marginBottom: 5 },
  statusMessageText: { fontSize: 14, fontWeight: '800', letterSpacing: 1.2, textAlign: 'center', backgroundColor: PALETTE.boardLight, paddingHorizontal: 15, paddingVertical: 4, borderRadius: 20 },

  // --- SECCIÓN DEL TABLERO ---
  boardSection: { width: '100%', alignItems: 'center' },
  boardWrapper: { width: SCREEN_WIDTH, aspectRatio: 1, borderWidth: 0, borderColor: PALETTE.surface, borderRadius: 4, elevation: 0, shadowColor: '#000000', alignItems: 'center' },

  // --- CONTROLES DE NAVEGACIÓN Y ACCIÓN ---
  modernControlsRow: { flexDirection: 'row', width: '100%', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 25 },
  navigationGroup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modernNavBtn: { padding: 8, backgroundColor: PALETTE.glass, borderRadius: 10 },
  navBtnDisabled: { opacity: 0.35, backgroundColor: PALETTE.glass },
  historyControls: { flexDirection: 'row', alignItems: 'center', width: '90%', marginTop: 10, backgroundColor: PALETTE.surface, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: PALETTE.surfaceLight },
  historyStatusText: { color: PALETTE.primary, fontSize: 11, fontWeight: 'bold', letterSpacing: 0.5 },
  actionGroup: { alignItems: 'flex-end' },
  smallButtonRow: { flexDirection: 'row', gap: 8, alignItems: 'center', width: '100%' },
  smallBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 6 },
  smallBtnText: { color: '#ffffff', fontWeight: '900', fontSize: 10, letterSpacing: 1 },
  skipBtn: { backgroundColor: PALETTE.accent, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  skipBtnText: { color: PALETTE.surface, fontWeight: '900', fontSize: 12, letterSpacing: 1 },
  btnText: { color: PALETTE.surfaceDark, fontWeight: '900', fontSize: 14, letterSpacing: 1.5 },
  btn: { flex: 1, height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },

  // --- MODAL DE FILTROS ---
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  filterModalContent: { width: '90%', height: '80%', backgroundColor: PALETTE.surfaceDark, borderRadius: 30, padding: 25, borderWidth: 1, borderColor: PALETTE.chipBorder },
  modalTitle: { color: '#ffffff', fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  filterSection: { marginBottom: 30, alignItems: 'center' },
  filterTitle: { color: PALETTE.chipText, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8, marginLeft: '5%' },
  availableContainer: { marginTop: 5, backgroundColor: PALETTE.tagBg, paddingVertical: 4, paddingHorizontal: 12, borderRadius: 12 },
  availableBadge: { color: PALETTE.secondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  sliderMarker: { backgroundColor: '#ffffff', height: 20, width: 20, borderRadius: 10, borderWidth: 2, borderColor: PALETTE.secondary, elevation: 5, shadowColor: '#000000' },
  modalThemesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', paddingBottom: 20 },
  themesContainer: { width: '100%', marginTop: 15 },
  themesScrollContent: { paddingHorizontal: SCREEN_WIDTH * 0.05, paddingVertical: 4 },
  themeChip: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, backgroundColor: PALETTE.chipBg, marginRight: 10, borderWidth: 1, borderColor: PALETTE.chipBorder },
  themeChipActive: { backgroundColor: PALETTE.chipActiveBg, borderColor: PALETTE.secondary, borderWidth: 2 },
  themeChipTextActive: { color: PALETTE.secondary, fontWeight: '800' },
  themeChipText: { color: PALETTE.chipText, fontSize: 12, fontWeight: '600' },
  modalFooter: { flexDirection: 'row', gap: 12, marginTop: 10 },
  modalBtn: { flex: 1, height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  btnCancel: { backgroundColor: PALETTE.surfaceLight },
  btnApply: { backgroundColor: PALETTE.secondary },

  // --- MODAL DE CORONACIÓN ---
  promotionOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', zIndex: 1000, elevation: 25 },
  promotionGlassCard: { width: '85%', backgroundColor: PALETTE.surfaceDark, borderRadius: 28, padding: 25, alignItems: 'center', borderWidth: 1, borderColor: PALETTE.primary },
  promotionTitle: { color: PALETTE.secondary, fontSize: 16, fontWeight: '800', letterSpacing: 2, marginBottom: 5 },
  promotionRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', gap: 10 },
  promotionPieceContainer: { flex: 1, alignItems: 'center' },
  pieceCircle: { width: SCREEN_WIDTH * 0.15, height: SCREEN_WIDTH * 0.15, borderRadius: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: PALETTE.surface, borderWidth: 1, borderColor: PALETTE.surfaceLight },
  promotionImage: { width: '80%', height: '80%' },
  cancelPromotion: { marginTop: 30, paddingVertical: 10, paddingHorizontal: 20 },
  cancelText: { color: PALETTE.error, fontSize: 11, fontWeight: '800', letterSpacing: 1 },


  moveListWrapper: {
  height: 40,
  backgroundColor: PALETTE.surface,
  borderRadius: 8,
  marginVertical: 10,
  width: '98%',
  justifyContent: 'center',
  borderWidth: 1,
  borderColor: PALETTE.surfaceLight,
},
moveListContent: {
  alignItems: 'center',
  paddingHorizontal: 10,
},
moveItem: {
  flexDirection: 'row',
  marginRight: 12,
  alignItems: 'center',
},
moveNumberText: {
  color: PALETTE.secondary,
  fontSize: 12,
  marginRight: 4,
  fontWeight: '600',
},
moveText: {
  color: PALETTE.primary,
  fontSize: 14,
  fontWeight: 'bold',
},
activeMoveText: {
  color: PALETTE.secondary, // Color resaltado al navegar
  textDecorationLine: 'underline',
},
moveTouchArea: {
    paddingVertical: 5, // Aumenta el área táctil vertical
    paddingHorizontal: 2, // Pequeño padding horizontal
  },
});