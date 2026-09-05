import { MaterialIcons } from '@expo/vector-icons';
import { Chess } from "chess.js";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, runOnJS, SharedValue, useAnimatedReaction, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from "react-native-reanimated";
import Svg, { G, Path, Rect } from 'react-native-svg';
import { hapticImpact } from '../lib/haptics';
import { PALETTE } from "./colors";


export interface PieceItem {
  id: string;
  type: string;
  color: 'w' | 'b';
  square: string;
}

interface ChessBoardProps {
  pieces: PieceItem[];
  onSquarePress: (square: string | null, isDraggingInteraction?: boolean) => void;
  onDragMove: (from: string, to: string) => void;
  selectedSquare: string | null;
  legalMoves: string[];
  orientation: 'w' | 'b';
  hintSquare?: string | null;
  hintMove?: string | null;
  successSquare?: string | null; 
  errorSquare?: string | null; 
  inCheck?: boolean;
  isMate?: boolean;
  turn?: 'w' | 'b';
  lastMoveFrom?: string | null;
  lastMoveTo?: string | null;
  bestEngineMove?: string | null;
  isAnalysisMode?: boolean;
  centipawnScore?: string | null;
  mateInMoves?: string | null;
  showLegalMoves?: boolean;
  moveDurationMs?: number;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const boardSize = Math.floor(SCREEN_WIDTH * 0.98);
const squareSize = boardSize / 8;
const LAYER_FADE_OUT = 130;
const LAYER_FADE_IN = 180;

export const pieceImages: Record<string, any> = {
  'p': require('../../assets/pieces/bP.png'),
  'n': require('../../assets/pieces/bN.png'),
  'b': require('../../assets/pieces/bB.png'),
  'r': require('../../assets/pieces/bR.png'),
  'q': require('../../assets/pieces/bQ.png'),
  'k': require('../../assets/pieces/bK.png'),
  'P': require('../../assets/pieces/wP.png'),
  'N': require('../../assets/pieces/wN.png'),
  'B': require('../../assets/pieces/wB.png'),
  'R': require('../../assets/pieces/wR.png'),
  'Q': require('../../assets/pieces/wQ.png'),
  'K': require('../../assets/pieces/wK.png'),
};


const EvalBar = ({ centipawnScore, mateInMoves, turn }: { centipawnScore: number | null | undefined; mateInMoves?: number | null; turn?: 'w' | 'b' }) => {
  const animatedWidth = useSharedValue(50);
  
  const hasMate = mateInMoves !== null && mateInMoves !== undefined;
  const isLoading = (centipawnScore === null || centipawnScore === undefined) && !hasMate;

  useEffect(() => {
    if (isLoading) {
      animatedWidth.value = withTiming(50, { duration: 500 });
      return;
    }

    if (hasMate) {
      // Mate a favor de blancas (positivo) -> barra llena; a favor de negras -> vacía
      // M0 (mate ya consumado): el lado que le toca mover (turn) es el que está mateado, así que gana el contrario
      const percentage = mateInMoves! > 0
        ? 100
        : mateInMoves! < 0
          ? 0
          : (turn === 'w' ? 0 : 100);
      animatedWidth.value = withTiming(percentage, { duration: 500 });
      return;
    }

    const val = centipawnScore ?? 0;
    const percentage = 50 + Math.tanh(val / 4) * 50;
    animatedWidth.value = withTiming(Math.min(Math.max(percentage, 5), 95), { duration: 500 });
  }, [centipawnScore, mateInMoves, isLoading, hasMate]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${animatedWidth.value}%`,
  }));

  const displayText = isLoading
    ? " "//"Descargando Motor..."
    : hasMate
      ? `M${Math.abs(mateInMoves!)}`
      : String(centipawnScore);

  return (
    <View style={styles.evalBarContainer}>
      <View style={styles.blackBar} />
      <Animated.View style={[styles.whiteBar, animatedStyle]} />
      <View style={styles.badgeWrapper}>
        <View style={styles.badgeContainer}>
          <Text style={styles.evalText}>
            {displayText}
          </Text>
        </View>
      </View>
    </View>
  );
};

const getSquareCenter = (sq: string, orientation: 'w' | 'b') => {
  // sq[0] es la letra (a-h), sq[1] es el número (1-8)
  const file = sq.charCodeAt(0) - 'a'.charCodeAt(0); // 'a' -> 0, 'b' -> 1, etc.
  const rank = 8 - parseInt(sq[1], 10); // Fila 8 arriba (0), Fila 1 abajo (7)

  // Invertimos si la orientación es 'b' (negras abajo)
  const x = orientation === 'w' ? file : 7 - file;
  const y = orientation === 'w' ? rank : 7 - rank;

  return {
    x: x * squareSize + squareSize / 2,
    y: y * squareSize + squareSize / 2,
  };
};

// --- COMPONENTE DE PIEZA INDIVIDUAL ---
const AnimatedPiece = React.memo(({ 
  p, visualRow, visualCol, isSuccess, isError, isSelected, isKingInCheck, orientation, onSquarePress, onDragMove, legalMoves,
  shadowX, shadowY, showShadow, turn, selectedSquare, capturedSquareValue, onInvalidTarget, moveDurationMs, swapping
}: { 
  p: PieceItem, visualRow: number, visualCol: number, isSuccess: boolean, isError: boolean, isSelected: boolean, isKingInCheck: boolean, orientation: 'w' | 'b', 
  onSquarePress: (sq: string | null, isDraggingInteraction?: boolean) => void,  onDragMove: (from: string, to: string) => void, legalMoves: string[],
  shadowX: SharedValue<number>, shadowY: SharedValue<number>, showShadow: SharedValue<boolean>, turn: 'w' | 'b', selectedSquare: string | null, capturedSquareValue: SharedValue<string | null>,
  onInvalidTarget: (square: string) => void, moveDurationMs: number, swapping: boolean
}) => {
  
  const targetX = visualCol * squareSize;
  const targetY = visualRow * squareSize;

  const posX = useSharedValue(targetX);
  const posY = useSharedValue(targetY);
  const scale = useSharedValue(1);
  const isDragging = useSharedValue(false);

  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);

  // Orígenes de la UI estables en memoria nativa
  const originX = useSharedValue(targetX);
  const originY = useSharedValue(targetY);

  useEffect(() => {
    originX.value = targetX;
    originY.value = targetY;
    if (!isDragging.value) {
      posX.value = withTiming(targetX, { duration: moveDurationMs });
      posY.value = withTiming(targetY, { duration: moveDurationMs });
    } else {
      posX.value = targetX;
      posY.value = targetY;
    }
  }, [visualRow, visualCol, targetX, targetY, moveDurationMs]);

  useEffect(() => {
    if (isSelected && !isDragging.value) {
      scale.value = withSequence(
        withTiming(1.15, { duration: 90 }),
        withTiming(0.95, { duration: 70 }),
        withTiming(1, { duration: 90 })
      );
    }
  }, [isSelected]);

  useEffect(() => {
    const isKing = p.type.toLowerCase() === 'k';
    if (isKing && isKingInCheck) {
      scale.value = withDelay(
        200,
        withSequence(
          withTiming(1.20, { duration: 95 }),
          withTiming(0.93, { duration: 75 }),
          withTiming(1.03, { duration: 95 })
        )
      );
    }
  }, [isKingInCheck]);

  // --- GESTO DE CLICK (TAP) ---
  const tapGesture = useMemo(() =>
    Gesture.Tap()
      .numberOfTaps(1)
      .onStart(() => {
        if (p.color === turn) {
          runOnJS(onSquarePress)(p.square);
          return;
        }

        const isMoveLegal = legalMoves.includes(p.square);
        if (selectedSquare && isMoveLegal) {
          runOnJS(onDragMove)(selectedSquare, p.square);
        } else {
          if (selectedSquare) {
            runOnJS(onInvalidTarget)(p.square); 
          }
          runOnJS(onSquarePress)(null);
        }
      }),
    [p.square, p.color, turn, selectedSquare, legalMoves, onSquarePress, onDragMove]
  );

  // --- GESTO DE ARRASTRE (PAN) ---
  const panGesture = useMemo(() =>
    Gesture.Pan()
      .onBegin(() => {
        if (p.color === turn) {
          runOnJS(onSquarePress)(p.square, true);
        }
      })
      .onStart(() => {
        if (p.color !== turn) return;
        isDragging.value = true;
        scale.value = 1.3;
        showShadow.value = true; 
      })
      .onUpdate((event) => {
        if (p.color !== turn) return;
        dragX.value = event.translationX;
        dragY.value = event.translationY - 40;

        const finalX = originX.value + event.translationX + (squareSize / 2);
        const finalY = originY.value + event.translationY + (squareSize / 2);

        let targetColIdx = Math.floor(finalX / squareSize);
        let targetRowIdx = Math.floor(finalY / squareSize);

        if (targetColIdx < 0) targetColIdx = 0;
        if (targetColIdx > 7) targetColIdx = 7;
        if (targetRowIdx < 0) targetRowIdx = 0;
        if (targetRowIdx > 7) targetRowIdx = 7;

        shadowX.value = targetColIdx * squareSize;
        shadowY.value = targetRowIdx * squareSize;
      })
      .onEnd((event) => {     
        if (p.color !== turn) return;

        const finalX = originX.value + event.translationX + (squareSize / 2);
        const finalY = originY.value + event.translationY + (squareSize / 2);
        const targetColIdx = Math.floor(finalX / squareSize);
        const targetRowIdx = Math.floor(finalY / squareSize);

        let isLegalMoveExecuted = false;
        let targetSquare = "";

        if (targetColIdx >= 0 && targetColIdx < 8 && targetRowIdx >= 0 && targetRowIdx < 8) {
          const c = orientation === 'w' ? targetColIdx : 7 - targetColIdx;
          const r = orientation === 'w' ? targetRowIdx : 7 - targetRowIdx;
          targetSquare = String.fromCharCode(97 + c) + (8 - r);

          const isMoveLegal = legalMoves.includes(targetSquare);
          
          if (targetSquare !== p.square && isMoveLegal) {
            isLegalMoveExecuted = true;
          }
        }

        if (isLegalMoveExecuted) {
          const destX = targetColIdx * squareSize;
          const destY = targetRowIdx * squareSize;
          capturedSquareValue.value = targetSquare; 

          posX.value = posX.value + dragX.value;
          posY.value = posY.value + dragY.value;
          dragX.value = 0;
          dragY.value = 0;
          isDragging.value = false;
          showShadow.value = false;

          scale.value = withTiming(1, { duration: 100 });
          posX.value = withTiming(destX, { duration: 100 });
          posY.value = withTiming(destY, { duration: 100 }, (finished) => {
            if (finished) {
              runOnJS(onSquarePress)(null, false);
              runOnJS(onDragMove)(p.square, targetSquare);
            }
          });
        } else {
          isDragging.value = false;
          showShadow.value = false;

          scale.value = withTiming(1, { duration: 120 });
          posX.value = posX.value + dragX.value;
          posY.value = posY.value + dragY.value;
          dragX.value = 0;
          dragY.value = 0;

          posX.value = withTiming(targetX, { duration: 120 });
          posY.value = withTiming(targetY, { duration: 120 });
        }
      }),
    [p.square, p.color, turn, orientation, legalMoves, targetX, targetY, onSquarePress, onDragMove]
  );
    
  const combinedGesture = useMemo(
    () => Gesture.Exclusive(panGesture, tapGesture),
    [panGesture, tapGesture]
  );

  const animatedStyle = useAnimatedStyle(() => {
    const isBeingCaptured = capturedSquareValue.value === p.square;

    return {
      transform: [
        { translateX: posX.value + dragX.value },
        { translateY: posY.value + dragY.value },
        { scale: scale.value },
      ],
      opacity: isBeingCaptured ? withTiming(0, { duration: 60 }) : 1,
      zIndex: isDragging.value ? 100 : 10,
    };
  });

  const imageKey = p.color === 'w' ? p.type.toUpperCase() : p.type.toLowerCase();

  return (
    <GestureDetector gesture={combinedGesture}>
      <Animated.View style={[styles.pieceContainer, { zIndex: 10 }, animatedStyle]}>
        <Animated.View
          entering={swapping ? undefined : FadeIn.duration(300)}
          exiting={swapping ? undefined : FadeOut.duration(300)}
        >
          <Image 
            source={pieceImages[imageKey]} 
            style={{ width: squareSize * 0.95, height: squareSize * 0.95 }}
          />
          {isSuccess && (
            <Animated.View entering={FadeIn.delay(200)} style={styles.successIconContainer}>
              <MaterialIcons name="check" size={squareSize * 0.40} color='#fff' />
            </Animated.View>
          )}
          {isError && (
            <Animated.View entering={FadeIn.delay(100)} style={styles.errorIconContainer}>
              <MaterialIcons name="close" size={squareSize * 0.40} color='#fff' />
            </Animated.View>
          )}
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}, (prev, next) => {
  // Comparación por VALOR, no por identidad de objeto: `p` es un objeto nuevo
  // en cada sync (syncPiecesFromGame reconstruye el array entero), así que
  // comparar prev.p === next.p siempre daría "distinto" aunque nada cambiara.
  return (
    prev.p.square === next.p.square &&
    prev.p.color === next.p.color &&
    prev.p.type === next.p.type &&
    prev.p.id === next.p.id &&
    prev.visualRow === next.visualRow &&
    prev.visualCol === next.visualCol &&
    prev.isSuccess === next.isSuccess &&
    prev.isError === next.isError &&
    prev.isSelected === next.isSelected &&
    prev.isKingInCheck === next.isKingInCheck &&
    prev.orientation === next.orientation &&
    prev.turn === next.turn &&
    prev.selectedSquare === next.selectedSquare &&
    prev.legalMoves === next.legalMoves &&
    prev.onSquarePress === next.onSquarePress &&
    prev.onDragMove === next.onDragMove &&
    prev.onInvalidTarget === next.onInvalidTarget  &&
    prev.swapping === next.swapping
  );
});

// --- DATOS ESTÁTICOS DEL TABLERO (calculados una sola vez al cargar el módulo) ---
const SQUARE_CELLS = Array.from({ length: 64 }, (_, i) => {
  const r = Math.floor(i / 8);
  const c = i % 8;
  return {
    r, c,
    square: String.fromCharCode(97 + c) + (8 - r),
    isDark: (r + c) % 2 === 1,
    rankLabel: String(8 - r),
    fileLabel: String.fromCharCode(97 + c),
  };
});

// --- CASILLA INDIVIDUAL: hooks aquí, no dentro de un .map() ---
interface BoardSquareProps {
  square: string;
  vRow: number;
  vCol: number;
  isDark: boolean;
  isSelected: boolean;
  isHint: boolean;
  isLegal: boolean;
  isCapture: boolean;
  isLastMove: boolean;
  hasKingInMate: boolean;
  showNumber: boolean;
  showLabel: boolean;
  rankLabel: string;
  fileLabel: string;
  onSquarePress: (sq: string | null, isDragging?: boolean) => void;
  isInvalidTarget: boolean;
  invalidFlashSquare: SharedValue<string | null>;
  invalidFlashNonce: SharedValue<number>;
  onInvalidTarget: (square: string) => void;
}

const BoardSquare = React.memo(({
  square, vRow, vCol, isDark,
  isSelected, isHint, isLegal, isCapture,
  isLastMove, hasKingInMate,
  showNumber, showLabel, rankLabel, fileLabel,
  onSquarePress, 
  isInvalidTarget, invalidFlashSquare, invalidFlashNonce, onInvalidTarget,
}: BoardSquareProps) => {

  const baseColor = isSelected
    ? PALETTE.boardSelect
    : isHint
      ? PALETTE.lightSuccess
      : isDark ? PALETTE.boardDark : PALETTE.boardLight;

  const bgSharedColor = useSharedValue(baseColor);

  useEffect(() => {
    if (hasKingInMate) {
      bgSharedColor.value = withDelay(400, withTiming(PALETTE.error, { duration: 200 }));
    } else {
      bgSharedColor.value = baseColor;
    }
  }, [hasKingInMate, baseColor]);

  const animatedSquareStyle = useAnimatedStyle(() => ({
    backgroundColor: bgSharedColor.value,
  }));

    // --- FLASH ROJO EN CLICK INVÁLIDO ---
  const flashOpacity = useSharedValue(0);

  useAnimatedReaction(
    () => invalidFlashNonce.value,
    (nonce, prevNonce) => {
      if (nonce !== prevNonce && invalidFlashSquare.value === square) {
        flashOpacity.value = withSequence(
          withTiming(0.85, { duration: 70 }),
          withTiming(0, { duration: 260 })
        );
      }
    },
    [square]
  );

  const invalidFlashStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));


  const coordColor = isDark ? PALETTE.boardLight : PALETTE.boardDark;

  return (
    <Pressable
      onPress={() => {
        if (isInvalidTarget) {
          onInvalidTarget(square);
        }
        onSquarePress(square);
      }}
      hitSlop={4}
      style={[
        styles.square,
        { left: vCol * squareSize, top: vRow * squareSize, width: squareSize + 0.5, height: squareSize + 0.5 },
      ]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, animatedSquareStyle]} />
      {isLastMove && !isSelected && !isHint && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: PALETTE.boardLastMove }]} />
      )}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: PALETTE.error }, invalidFlashStyle]}
      />
      {showNumber && (
        <Text style={[styles.coordText, styles.coordNumber, { color: coordColor }]}>
          {rankLabel}
        </Text>
      )}
      {showLabel && (
        <Text style={[styles.coordText, styles.coordLetter, { color: coordColor }]}>
          {fileLabel}
        </Text>
      )}
      {isLegal && (
        isCapture
          ? <View style={styles.captureRing} />
          : <View style={styles.legalMoveDot} />
      )}
    </Pressable>
  );
});

// --- COMPONENTE PRINCIPAL ---
function ChessBoard({ 
  pieces = [], 
  onSquarePress, 
  onDragMove,
  selectedSquare, 
  legalMoves = [], 
  orientation = 'w' ,
  hintSquare = null,
  hintMove = null,
  successSquare = null,
  errorSquare = null,
  inCheck = false,
  isMate = false,
  turn = 'w',
  lastMoveFrom = null,
  lastMoveTo = null,
  bestEngineMove = null,
  isAnalysisMode = false,
  centipawnScore = null,
  mateInMoves = null,
  showLegalMoves = true,
  moveDurationMs = 200
}: ChessBoardProps) {

  const shadowX = useSharedValue(0);
  const shadowY = useSharedValue(0);
  const showShadow = useSharedValue(false);
  const capturedSquareValue = useSharedValue<string | null>(null);

  // --- SEÑAL DE CLICK INVÁLIDO (flash rojo + haptic) ---
  const invalidFlashSquare = useSharedValue<string | null>(null);
  const invalidFlashNonce = useSharedValue(0);
  const triggerInvalidTarget = useCallback((square: string) => {
    invalidFlashSquare.value = square;
    invalidFlashNonce.value = invalidFlashNonce.value + 1;
    hapticImpact('light');
  }, []);

  const analysisProgress = useSharedValue(isAnalysisMode ? 1 : 0);

  useEffect(() => {
    analysisProgress.value = withTiming(isAnalysisMode ? 1 : 0, { duration: 350 });
  }, [isAnalysisMode]);

    // --- TRANSICIÓN ENTRE PUZZLES ---
  // Si NINGUNA pieza sobrevive de un render al siguiente, no es una jugada:
  // es otra posición. Entonces fundimos la capa entera en lugar de animar
  // pieza a pieza. Con los IDs salados, esto solo se cumple al cargar puzzle
  // o al reiniciar, nunca al mover.
  const layerOpacity = useSharedValue(1);
  const layerScale = useSharedValue(1);

  const [rendered, setRendered] = useState({ pieces, orientation });
  const [swapping, setSwapping] = useState(false);
  const pendingRef = useRef({ pieces, orientation });
  const prevIdsRef = useRef<Set<string>>(new Set());

  const finishSwap = useCallback(() => setSwapping(false), []);

  const commitPosition = useCallback(() => {
    setRendered(pendingRef.current);
    layerScale.value = withTiming(1, { duration: LAYER_FADE_IN });
    layerOpacity.value = withTiming(1, { duration: LAYER_FADE_IN }, (finished) => {
      if (finished) runOnJS(finishSwap)();
    });
  }, [finishSwap]);

  useEffect(() => {
    pendingRef.current = { pieces, orientation };

    const prevIds = prevIdsRef.current;
    const isFullSwap =
      prevIds.size > 0 && pieces.length > 0 && pieces.every(p => !prevIds.has(p.id));
    prevIdsRef.current = new Set(pieces.map(p => p.id));

    if (!isFullSwap) {
      setRendered({ pieces, orientation });
      return;
    }

    // Apagamos las animaciones por pieza ANTES de desmontarlas: `exiting` se
    // lee del último render del elemento, no del commit que lo elimina.
    setSwapping(true);
    layerScale.value = withTiming(0.96, { duration: LAYER_FADE_OUT });
    layerOpacity.value = withTiming(0, { duration: LAYER_FADE_OUT }, (finished) => {
      if (finished) runOnJS(commitPosition)();
    });
  }, [pieces, orientation, commitPosition]);

  const pieceLayerStyle = useAnimatedStyle(() => ({
    opacity: layerOpacity.value,
    transform: [{ scale: layerScale.value }],
  }));

  useEffect(() => {
      capturedSquareValue.value = null;
  }, [pieces]);

  const animatedShadowStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: shadowX.value },
      { translateY: shadowY.value }
    ],
    opacity: showShadow.value ? 1 : 0,
  }));

  const EVAL_BAR_BLOCK_HEIGHT = 30; // 20 de altura de la barra + 10 de marginBottom

  const evalBarWrapperStyle = useAnimatedStyle(() => ({
    height: analysisProgress.value * EVAL_BAR_BLOCK_HEIGHT,
    opacity: analysisProgress.value,
    transform: [{ translateY: (1 - analysisProgress.value) * -8 }],
  }));
  
// --- GENERADOR DE FLECHAS REUTILIZABLE ---
  const renderArrow = (moveStr: string, color: string) => {
    if (!moveStr || moveStr.length < 4) return null;
    
    const fromSq = moveStr.substring(0, 2);
    const toSq = moveStr.substring(2, 4);
    
    const centerStart = getSquareCenter(fromSq, orientation);
    const end = getSquareCenter(toSq, orientation);

    const dx = end.x - centerStart.x;
    const dy = end.y - centerStart.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const offset = squareSize * 0.3;
    
    const startX = distance > 0 ? centerStart.x + (dx / distance) * offset : centerStart.x;
    const startY = distance > 0 ? centerStart.y + (dy / distance) * offset : centerStart.y;
    
    const headSize = squareSize * 0.3;
    const strokeW = 12;
    const neckX = end.x - (headSize * Math.cos(angle));
    const neckY = end.y - (headSize * Math.sin(angle));

    return (
      <G opacity={0.8}>
        <Path
          d={`M ${startX} ${startY} L ${neckX} ${neckY}`}
          stroke={color}
          strokeWidth={strokeW}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d={`M ${end.x} ${end.y} 
              L ${neckX - (headSize * Math.cos(angle + Math.PI/2))} ${neckY - (headSize * Math.sin(angle + Math.PI/2))}
              L ${neckX - (headSize * Math.cos(angle - Math.PI/2))} ${neckY - (headSize * Math.sin(angle - Math.PI/2))}
              Z`}
          fill={color}
        />
      </G>
    );
  };

  // --- Conjuntos derivados: O(n) una sola vez por render ---
  const occupiedSquares = useMemo(() => new Set(rendered.pieces.map(p => p.square)), [rendered.pieces]);
  const legalSet = useMemo(() => new Set(legalMoves), [legalMoves]);
  const mateKingSquare = useMemo(() => {
    if (!isMate) return null;
    const king = rendered.pieces.find(p => p.type.toLowerCase() === 'k' && p.color === turn);
    return king?.square ?? null;
  }, [isMate, rendered.pieces, turn]);

  return (
      <View style={styles.container}>
        
      <Animated.View style={[{ width: boardSize, overflow: 'hidden' }, evalBarWrapperStyle]}>
        <View style={{ marginBottom: 10 }}>
          <EvalBar
            centipawnScore={
              centipawnScore === null || centipawnScore === undefined
                ? null
                : Number(centipawnScore)
            }
            mateInMoves={
              mateInMoves === null || mateInMoves === undefined
                ? null
                : Number(mateInMoves)
            }
            turn={turn}
          />
        </View>
      </Animated.View>

      <View style={styles.board}>
        {/* CAPA: INDICADOR / SOMBRA DE PREVISUALIZACIÓN */}
        <Animated.View 
          pointerEvents="none"
          style={[
            styles.targetShadow, 
            { width: squareSize*2, height: squareSize*2, marginLeft: -squareSize*0.5, marginTop: -squareSize*0.5 }, 
            animatedShadowStyle
          ]} 
        />

        {/* CAPA DE CASILLAS */}
        {SQUARE_CELLS.map(({ r, c, square, isDark, rankLabel, fileLabel }) => {
          const vRow = rendered.orientation === 'w' ? r : 7 - r;
          const vCol = rendered.orientation === 'w' ? c : 7 - c;
          const isLegal = legalSet.has(square);
          const isInvalidTarget = !!selectedSquare && square !== selectedSquare && !isLegal;
          // El ajuste solo apaga la PISTA VISUAL. isInvalidTarget y la validación
          // de los gestos siguen usando el legalSet real, o el tablero dejaría
          // de aceptar jugadas con la opción desactivada.
          const showDot = showLegalMoves && isLegal;

          return (
            <BoardSquare
              key={square}
              square={square}
              vRow={vRow}
              vCol={vCol}
              isDark={isDark}
              isSelected={square === selectedSquare}
              isHint={hintSquare === square}
              isLegal={showDot}
              isCapture={showDot && occupiedSquares.has(square)}
              isLastMove={square === lastMoveFrom || square === lastMoveTo}
              hasKingInMate={mateKingSquare === square}
              showNumber={vCol === 0}
              showLabel={vRow === 7}
              rankLabel={rankLabel}
              fileLabel={fileLabel}
              onSquarePress={onSquarePress}
              isInvalidTarget={isInvalidTarget}
              invalidFlashSquare={invalidFlashSquare}
              invalidFlashNonce={invalidFlashNonce}
              onInvalidTarget={triggerInvalidTarget}
            />
          );
        })}

        {/* CAPA DE PIEZAS */}
        <Animated.View
          style={[StyleSheet.absoluteFill, { zIndex: 10 }, pieceLayerStyle]}
          pointerEvents={swapping ? 'none' : 'box-none'}
        >
          {rendered.pieces
            .slice()
            .sort((a: PieceItem, b: PieceItem) => {
              if (a.square === selectedSquare) return 1;
              if (b.square === selectedSquare) return -1;
              return 0;
            })
            .map((p: PieceItem) => {
              const col = p.square.charCodeAt(0) - 97;
              const row = 8 - parseInt(p.square[1]);
              
              const isKing = p.type.toLowerCase() === 'k';
              const isThisKingInCheck = inCheck && isKing && p.color === turn;

              return (
                <AnimatedPiece 
                  key={p.id} 
                  p={p} 
                  visualRow={rendered.orientation === 'w' ? row : 7 - row}
                  visualCol={rendered.orientation === 'w' ? col : 7 - col}
                  isSuccess={p.square === successSquare}
                  isError={p.square === errorSquare}
                  isSelected={p.square === selectedSquare} 
                  isKingInCheck={isThisKingInCheck}
                  orientation={rendered.orientation}
                  onSquarePress={onSquarePress}
                  onDragMove={onDragMove}
                  legalMoves={legalMoves}
                  shadowX={shadowX}      
                  shadowY={shadowY}
                  showShadow={showShadow}
                  turn={turn}
                  selectedSquare={selectedSquare}
                  capturedSquareValue={capturedSquareValue}
                  onInvalidTarget={triggerInvalidTarget}
                  moveDurationMs={moveDurationMs}
                  swapping={swapping}
                />
              );
            })}
          </Animated.View>

          {/* CAPA DE FLECHAS */}
          {((bestEngineMove && bestEngineMove.length >= 4 )|| hintMove) && (
            <View style={[StyleSheet.absoluteFill, { zIndex: 100 }]} pointerEvents="none">
              <Svg width="100%" height="100%">
                {/* Flecha verde para el motor de análisis */}
                {bestEngineMove && renderArrow(bestEngineMove, PALETTE.success || "#2ecc71")}
                
                {/* Flecha azul (primary) para la segunda pista del jugador */}
                {hintMove && renderArrow(hintMove, PALETTE.primary || "rgba(52, 152, 219, 1)")}
              </Svg>
            </View>
          )}
          
      </View>
    </View>
  );
}

export default React.memo(ChessBoard);

// --- MINI TABLERO ESTÁTICO (para listas de historial, previsualizaciones, etc.) ---
// A diferencia de ChessBoard, este NO es interactivo: sin gestos, sin depender
// del ancho de pantalla. Solo dibuja las piezas de un FEN dado.
interface MiniBoardPreviewProps {
  fen?: string | null;
  size?: number;
}

const MINI_BOARD_DEFAULT_SIZE = 60;
const MINI_DARK_PATH_CACHE: Record<number, string> = {};// El damero es idéntico para todas las previews: lo cacheamos como un único Path.

const getDarkSquaresPath = (squareSize: number) => {
  if (MINI_DARK_PATH_CACHE[squareSize]) return MINI_DARK_PATH_CACHE[squareSize];
  let d = '';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) {
        d += `M${c * squareSize} ${r * squareSize}h${squareSize}v${squareSize}h-${squareSize}z`;
      }
    }
  }
  MINI_DARK_PATH_CACHE[squareSize] = d;
  return d;
};

export const MiniBoardPreview = React.memo(({ fen, size = MINI_BOARD_DEFAULT_SIZE }: MiniBoardPreviewProps) => {
  const squareSize = size / 8;

  const pieces = useMemo(() => {
    if (!fen) return [];
    try {
      const chess = new Chess(fen);
      const board = chess.board();
      const list: { key: string; pieceKey: string; row: number; col: number }[] = [];

      board.forEach((rowArr, r) => {
        rowArr.forEach((cell, c) => {
          if (cell) {
            const pieceKey = cell.color === 'w' ? cell.type.toUpperCase() : cell.type.toLowerCase();
            list.push({ key: `${pieceKey}-${r}-${c}`, pieceKey, row: r, col: c });
          }
        });
      });
      return list;
    } catch (e) {
      return [];
    }
  }, [fen]);

  return (
    <View style={[miniBoardStyles.board, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Rect x={0} y={0} width={size} height={size} fill={PALETTE.boardLight} />
        <Path d={getDarkSquaresPath(squareSize)} fill={PALETTE.boardDark} />
      </Svg>
      {pieces.map((p) => (
        <Image
          key={p.key}
          source={pieceImages[p.pieceKey]}
          style={{
            position: 'absolute',
            left: p.col * squareSize,
            top: p.row * squareSize,
            width: squareSize,
            height: squareSize,
          }}
          resizeMode="contain"
        />
      ))}
    </View>
  );
});

const miniBoardStyles = StyleSheet.create({
  board: { borderRadius: 6, overflow: 'hidden', backgroundColor: PALETTE.boardDark },
});

const styles = StyleSheet.create({
  container: { alignItems: 'center', width: '100%', },
  board: { width: boardSize, height: boardSize, borderRadius: 4, overflow: 'hidden', marginBottom: 4 },
  square: { position: "absolute", justifyContent: 'center', alignItems: 'center', zIndex: 1 },
  coordNumber: { top: 2, left: 2 },
  coordLetter: { bottom: 2, right: 4 },
  pieceContainer: { position: "absolute", width: squareSize, height: squareSize, justifyContent: 'center', alignItems: 'center' },
  legalMoveDot: { width: squareSize * 0.30, height: squareSize * 0.30, borderRadius: 100, backgroundColor: PALETTE.boardLegal, zIndex: 5 },
  captureRing: { width: squareSize, height: squareSize, borderRadius: squareSize, borderWidth: 5, borderColor: PALETTE.boardLegal, backgroundColor: 'transparent', zIndex: 5 },
  coordText: { position: 'absolute', fontSize: 10, fontWeight: '800', opacity: 0.6, zIndex: 2 },
  successIconContainer: { position: 'absolute', top: -2, right: -2, backgroundColor: PALETTE.success, borderRadius: 100, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 2, zIndex: 20 },
  errorIconContainer: { position: 'absolute', top: -2, right: -2, backgroundColor: PALETTE.error, borderRadius: 100, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 2, zIndex: 20 },
  targetShadow: { position: 'absolute', backgroundColor: 'rgba(65, 65, 65, 0.33)', borderColor: '#ffffff00', borderWidth: 4, borderStyle: 'solid', borderRadius: 80, zIndex: 2 },
  evalBarContainer: { height: 20, width: '100%', backgroundColor: '#4a4a4a', borderRadius: 6, overflow: 'hidden', flexDirection: 'row',},
    blackBar: { ...StyleSheet.absoluteFillObject,  backgroundColor: '#202020',
    }, whiteBar: { height: '100%',  backgroundColor: '#ffffff', },
  badgeWrapper: { ...StyleSheet.absoluteFillObject,  justifyContent: 'center',  alignItems: 'center', },
  badgeContainer: { backgroundColor: 'rgba(0, 0, 0, 0.5)',  paddingHorizontal: 6,  paddingVertical: 2,  borderRadius: 4, },
  evalText: { fontSize: 9, color: '#ffffff', fontWeight: '700', textAlign: 'center', },
});