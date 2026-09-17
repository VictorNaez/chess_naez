import { MaterialIcons } from '@expo/vector-icons';
import { Chess } from "chess.js";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, LayoutAnimationConfig, runOnJS, SharedValue, useAnimatedReaction, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from "react-native-reanimated";
import Svg, { G, Path, Rect } from 'react-native-svg';
import { useEngineOutput, type EngineOutputStore } from '../lib/engineOutput';
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
  isAnalysisMode?: boolean;
  /**
   * Salida del motor (flecha y barra de evaluación). Se pasa el store y no los
   * valores: así cada actualización del motor re-renderiza solo la barra y la
   * capa de flechas, ni App ni el tablero.
   */
  engineOutput?: EngineOutputStore | null;
  showLegalMoves?: boolean;
  showCoordinates?: boolean;
  moveDurationMs?: number;
  /** Lado del tablero en dp. Lo calcula quien lo monta (ancho y alto disponibles). */
  size: number;
  /**
   * Identifica la posición de origen (el id del puzle). Si cambia a la vez que
   * todas las piezas, App está deslizando el tablero y la capa de piezas no se
   * funde; si no cambia (reintentar, salir del análisis) entra con un fundido.
   */
  positionKey?: string | null;
  /**
   * Ignora todo toque y arrastre (p.ej. mientras se reproduce una línea del
   * motor). Se comprueba en los worklets: bloquear solo en JS no basta, porque
   * la pieza se levantaría y seguiría al dedo antes de que JS diga que no.
   */
  inputLocked?: boolean;
}

/** Alto que añade la eval bar en modo análisis: 20 de barra + 10 de marginBottom. */
export const EVAL_BAR_BLOCK_HEIGHT = 30;
const LAYER_FADE_IN = 180;
const LAYER_SWAP_SCALE = 0.96;

// Una sola instancia por tipo de animación, compartida por las 32 piezas. Con
// un `FadeOut.duration(300)` inline cada re-render de una pieza llegaba con un
// objeto nuevo y Reanimated, en componentDidUpdate, reconstruía y volvía a
// registrar la animación de salida por JSI (compara por identidad).
const PIECE_ENTERING = FadeIn.duration(300);
const PIECE_EXITING = FadeOut.duration(300);

/** Lo que hay pintado en la capa de piezas. `key` cambia en cada cambio completo de posición. */
interface PieceLayer {
  pieces: PieceItem[];
  orientation: 'w' | 'b';
  positionKey: string | null;
  key: number;
  fadeIn: boolean;
}

/** Cambio completo de posición detectado en el render y pendiente de pintar. */
interface PendingSwap {
  pieces: PieceItem[];
  orientation: 'w' | 'b';
  positionKey: string | null;
  fadeIn: boolean;
}

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


const EvalBar = ({ engineOutput, turn }: { engineOutput?: EngineOutputStore | null; turn?: 'w' | 'b' }) => {
  const centipawnText = useEngineOutput(engineOutput, (s) => s.centipawn);
  const mateText = useEngineOutput(engineOutput, (s) => s.mateIn);
  const centipawnScore = centipawnText === null ? null : Number(centipawnText);
  const mateInMoves = mateText === null ? null : Number(mateText);
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

const getSquareCenter = (sq: string, orientation: 'w' | 'b', squareSize: number) => {
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

// --- GENERADOR DE FLECHAS REUTILIZABLE ---
const renderArrow = (moveStr: string, color: string, orientation: 'w' | 'b', squareSize: number) => {
  if (!moveStr || moveStr.length < 4) return null;

  const fromSq = moveStr.substring(0, 2);
  const toSq = moveStr.substring(2, 4);

  const centerStart = getSquareCenter(fromSq, orientation, squareSize);
  const end = getSquareCenter(toSq, orientation, squareSize);

  const dx = end.x - centerStart.x;
  const dy = end.y - centerStart.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  const offset = squareSize * 0.3;

  const startX = distance > 0 ? centerStart.x + (dx / distance) * offset : centerStart.x;
  const startY = distance > 0 ? centerStart.y + (dy / distance) * offset : centerStart.y;

  const headSize = squareSize * 0.3;
  const strokeW = Math.max(6, Math.round(squareSize * 0.24)); // 12 en un móvil típico
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

// --- CAPA DE FLECHAS ---
// Componente propio y suscrito al store: la flecha del motor cambia con cada
// actualización de la búsqueda sin re-renderizar el tablero.
const ArrowLayer = React.memo(function ArrowLayer({ engineOutput, hintMove, orientation, squareSize }: {
  engineOutput?: EngineOutputStore | null;
  hintMove: string | null;
  orientation: 'w' | 'b';
  squareSize: number;
}) {
  const bestEngineMove = useEngineOutput(engineOutput, (s) => s.bestMove);
  if (!((bestEngineMove && bestEngineMove.length >= 4) || hintMove)) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 100 }]} pointerEvents="none">
      <Svg width="100%" height="100%">
        {/* Flecha verde para el motor de análisis */}
        {bestEngineMove && renderArrow(bestEngineMove, PALETTE.success || "#2ecc71", orientation, squareSize)}

        {/* Flecha azul (primary) para la segunda pista del jugador */}
        {hintMove && renderArrow(hintMove, PALETTE.primary || "rgba(52, 152, 219, 1)", orientation, squareSize)}
      </Svg>
    </View>
  );
});

// --- COMPONENTE DE PIEZA INDIVIDUAL ---
// `turnSV`, `selectedSquareSV` y `legalMovesSV` son SharedValue y NO props
// normales a propósito. Los gestos solo los leen dentro de worklets (hilo de
// UI), así que pasarlos como valores obligaba a reconstruir tapGesture,
// panGesture y combinedGesture en las 32 piezas cada vez que seleccionabas
// una casilla, con su ciclo de detach/attach de handlers nativos por pieza.
// Como SharedValue la identidad nunca cambia: los gestos se construyen una vez
// por pieza y el memo de abajo deja de fallar en cada toque.
const AnimatedPiece = React.memo(({ 
  p, visualRow, visualCol, isSuccess, isError, isSelected, isKingInCheck, orientation, onSquarePress, onDragMove, legalMovesSV,
  shadowX, shadowY, showShadow, turnSV, selectedSquareSV, capturedPieceIdSV, squareToPieceIdSV, onInvalidTarget, moveDurationMs, squareSize,
  inputLockedSV,
}: { 
  p: PieceItem, visualRow: number, visualCol: number, isSuccess: boolean, isError: boolean, isSelected: boolean, isKingInCheck: boolean, orientation: 'w' | 'b', 
  onSquarePress: (sq: string | null, isDraggingInteraction?: boolean) => void,  onDragMove: (from: string, to: string) => void, legalMovesSV: SharedValue<string[]>,
  shadowX: SharedValue<number>, shadowY: SharedValue<number>, showShadow: SharedValue<boolean>, turnSV: SharedValue<'w' | 'b'>, selectedSquareSV: SharedValue<string | null>,
  capturedPieceIdSV: SharedValue<string | null>, squareToPieceIdSV: SharedValue<Record<string, string>>,
  onInvalidTarget: (square: string) => void, moveDurationMs: number, squareSize: number,
  inputLockedSV: SharedValue<boolean>,
}) => {
  
  const targetX = visualCol * squareSize;
  const targetY = visualRow * squareSize;

  const posX = useSharedValue(targetX);
  const posY = useSharedValue(targetY);
  const scale = useSharedValue(1);
  const isDragging = useSharedValue(false);
  const wasSelectedOnBegin = useSharedValue(false);   // Marca si la pieza YA estaba seleccionada cuando empezó ESTE toque.
  // La captura por click se resuelve en onBegin (touch down). El Tap del mismo
  // toque llegará igualmente al soltar el dedo: esta bandera es lo que evita
  // que repita la jugada.
  const handledOnBegin = useSharedValue(false);

  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);

  // La pieza sigue "levantada" (por encima del resto) mientras vuelve o encaja
  // tras soltarla, no solo durante el arrastre. Antes esto lo garantizaba el
  // orden de los hijos (la seleccionada iba la última); ahora el orden no se
  // toca y manda el zIndex. El token evita que el final de un encaje baje una
  // pieza que ya se ha vuelto a coger.
  const isLifted = useSharedValue(false);
  const liftToken = useSharedValue(0);

  // Orígenes de la UI estables en memoria nativa
  const originX = useSharedValue(targetX);
  const originY = useSharedValue(targetY);

  // useLayoutEffect y no useEffect: los efectos pasivos corren DESPUÉS del
  // pintado, así que la orden de withTiming salía un frame tarde y la pieza
  // arrancaba en el siguiente. Como efecto de layout se despacha dentro del
  // mismo commit y la animación empieza en el primer frame del render nuevo.
  useLayoutEffect(() => {
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
        // La captura ya se disparó al bajar el dedo (panGesture.onBegin).
        if (handledOnBegin.value) {
          handledOnBegin.value = false;
          return;
        }
        if (inputLockedSV.value) return;
        if (p.color === turnSV.value) {
          if (wasSelectedOnBegin.value) {
            runOnJS(onSquarePress)(p.square);
          }
          return;
        }

        const selected = selectedSquareSV.value;
        const isMoveLegal = legalMovesSV.value.includes(p.square);
        if (selected && isMoveLegal) {
          runOnJS(onDragMove)(selected, p.square);
        } else {
          if (selected) {
            runOnJS(onInvalidTarget)(p.square); 
          }
          runOnJS(onSquarePress)(null);
        }
      }),
    [p.square, p.color, onSquarePress, onDragMove, onInvalidTarget]
  );

  // --- GESTO DE ARRASTRE (PAN) ---
  const panGesture = useMemo(() =>
    Gesture.Pan()
      .onBegin(() => {
        handledOnBegin.value = false;
        if (inputLockedSV.value) return;
        if (p.color === turnSV.value) {
          wasSelectedOnBegin.value = selectedSquareSV.value === p.square;
          runOnJS(onSquarePress)(p.square, true);
          return;
        }

        // CAPTURA POR CLICK EN EL TOUCH DOWN.
        // Seleccionar ya ocurría aquí, en onBegin; comer ocurría en el Tap, que
        // solo pasa a ACTIVE al levantar el dedo. Esos 60-150 ms que el dedo
        // pasa apoyado eran la mayor parte del retraso percibido, y explicaban
        // que arrastrar se sintiera instantáneo y hacer click no.
        const selected = selectedSquareSV.value;
        if (selected && legalMovesSV.value.includes(p.square)) {
          handledOnBegin.value = true;
          runOnJS(onDragMove)(selected, p.square);
        }
      })
      .onStart(() => {
        if (p.color !== turnSV.value || inputLockedSV.value) return;
        isDragging.value = true;
        isLifted.value = true;
        liftToken.value = liftToken.value + 1;
        scale.value = 1.3;
        showShadow.value = true; 
      })
      .onUpdate((event) => {
        // Por "este arrastre empezó de verdad" y no por el turno: una línea del
        // motor puede cambiar el turno con el dedo aún en la pantalla.
        if (!isDragging.value) return;
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
        if (!isDragging.value) {
          isLifted.value = false;
          return;
        }
        const token = liftToken.value;

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

          const isMoveLegal = legalMovesSV.value.includes(targetSquare);
          
          // Si el tablero se bloqueó a mitad del arrastre, la pieza vuelve a su
          // sitio: JS rechazaría la jugada y se quedaría pintada en el destino.
          if (targetSquare !== p.square && isMoveLegal && !inputLockedSV.value) {
            isLegalMoveExecuted = true;
          }
        }

        if (isLegalMoveExecuted) {
          const destX = targetColIdx * squareSize;
          const destY = targetRowIdx * squareSize;

          // Marcamos a la capturada por ID, no por casilla: en cuanto la jugada
          // se aplica, la casilla de destino pasa a ser de ESTA pieza, así que
          // una marca por casilla acaba señalando a la pieza equivocada.
          const idMap = squareToPieceIdSV.value;
          let victimSquare = targetSquare;
          // Captura al paso: el peón capturado no está en la casilla de destino,
          // sino en su columna y en la fila de origen.
          if (p.type === 'p' && !idMap[targetSquare] && targetSquare[0] !== p.square[0]) {
            victimSquare = targetSquare[0] + p.square[1];
          }
          capturedPieceIdSV.value = idMap[victimSquare] ?? null;

          posX.value = posX.value + dragX.value;
          posY.value = posY.value + dragY.value;
          dragX.value = 0;
          dragY.value = 0;
          isDragging.value = false;
          showShadow.value = false;

          scale.value = withTiming(1, { duration: 100 });
          posX.value = withTiming(destX, { duration: 100 });
          posY.value = withTiming(destY, { duration: 100 }, (finished) => {
            if (liftToken.value === token) isLifted.value = false;
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
          posY.value = withTiming(targetY, { duration: 120 }, () => {
            if (liftToken.value === token) isLifted.value = false;
          });
        }
      }),
    // squareSize solo cambia al redimensionar la ventana (rotación, pantalla
    // dividida), nunca por un toque: reconstruir los gestos entonces es gratis.
    [p.square, p.color, p.type, orientation, targetX, targetY, squareSize, onSquarePress, onDragMove]
  );
    
  const combinedGesture = useMemo(
    () => Gesture.Exclusive(panGesture, tapGesture),
    [panGesture, tapGesture]
  );

  // Espejo en JS de "me han capturado", para apagar la animación de salida.
  // Si la pieza ya se ha desvanecido al soltar, el FadeOut del desmontaje la
  // volvería a pintar desde opacity 1 (initialValues de FadeOut) y se vería
  // reaparecer un instante.
  const [isBeingCaptured, setIsBeingCaptured] = useState(false);

  useAnimatedReaction(
    () => capturedPieceIdSV.value === p.id,
    (captured, prev) => {
      if (prev !== null && captured !== prev) {
        runOnJS(setIsBeingCaptured)(captured);
      }
    },
    [p.id]
  );

  const animatedStyle = useAnimatedStyle(() => {
    const capturedNow = capturedPieceIdSV.value === p.id;

    return {
      transform: [
        { translateX: posX.value + dragX.value },
        { translateY: posY.value + dragY.value },
        { scale: scale.value },
      ],
      opacity: capturedNow ? withTiming(0, { duration: 60 }) : 1,
      zIndex: isDragging.value || isLifted.value ? 100 : 10,
    };
  });

  const imageKey = p.color === 'w' ? p.type.toUpperCase() : p.type.toLowerCase();

  return (
    <GestureDetector gesture={combinedGesture}>
      <Animated.View style={[styles.pieceContainer, { width: squareSize, height: squareSize, zIndex: 10 }, animatedStyle]}>
        <Animated.View
          entering={PIECE_ENTERING}
          exiting={isBeingCaptured ? undefined : PIECE_EXITING}
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
    // turn, selectedSquare y legalMoves ya no están aquí: viven en SharedValues
    // de identidad estable, así que un cambio de selección deja de invalidar
    // las 32 piezas. isSelected sigue siendo prop porque lo consume el efecto
    // del rebote, y solo cambia en una o dos piezas por toque.
    prev.onSquarePress === next.onSquarePress &&
    prev.onDragMove === next.onDragMove &&
    prev.onInvalidTarget === next.onInvalidTarget  &&
    prev.moveDurationMs === next.moveDurationMs &&
    prev.squareSize === next.squareSize
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
  /**
   * Legalidad REAL del destino con la selección actual. `isLegal` no sirve para
   * esto: viene filtrado por el ajuste "mostrar movimientos legales" y solo
   * decide si se pinta el punto. Esta es la que decide si el toque mueve.
   */
  isLegalTarget: boolean;
  isCapture: boolean;
  isLastMove: boolean;
  hasKingInMate: boolean;
  onSquarePress: (sq: string | null, isDragging?: boolean) => void;
  isInvalidTarget: boolean;
  invalidFlashSquare: SharedValue<string | null>;
  invalidFlashNonce: SharedValue<number>;
  onInvalidTarget: (square: string) => void;
  squareSize: number;
}

const BoardSquare = React.memo(({
  square, vRow, vCol, isDark,
  isSelected, isHint, isLegal, isLegalTarget, isCapture,
  isLastMove, hasKingInMate,
  onSquarePress, 
  isInvalidTarget, invalidFlashSquare, invalidFlashNonce, onInvalidTarget,
  squareSize,
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

  // --- ACTIVACIÓN EN EL TOUCH DOWN ---
  // `onPress` de Pressable dispara al SOLTAR. La selección de pieza, en cambio,
  // ya iba en panGesture.onBegin (touch down), así que mover a casilla vacía
  // arrastraba de regalo la duración entera del toque. El ref evita que el
  // onPress del release repita la jugada que ya resolvió el onPressIn.
  const handledOnPressIn = useRef(false);

  const activate = () => {
    if (isInvalidTarget) {
      onInvalidTarget(square);
    }
    onSquarePress(square);
  };

  return (
    <Pressable
      onPressIn={() => {
        handledOnPressIn.current = false;
        // Solo el destino legal se adelanta al touch down. Deseleccionar o
        // tocar una casilla muerta sigue en el release: ahí el retraso no se
        // nota y mantenerlo evita que un roce al empezar un arrastre cancele
        // la selección.
        if (!isLegalTarget) return;
        handledOnPressIn.current = true;
        activate();
      }}
      onPress={() => {
        if (handledOnPressIn.current) {
          handledOnPressIn.current = false;
          return;
        }
        activate();
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
      {isLegal && (
        isCapture
          ? <View style={[styles.captureRing, { width: squareSize, height: squareSize, borderRadius: squareSize, borderWidth: Math.max(3, Math.round(squareSize * 0.1)) }]} />
          : <View style={[styles.legalMoveDot, { width: squareSize * 0.30, height: squareSize * 0.30 }]} />
      )}
    </Pressable>
  );
});

// --- CAPA DE COORDENADAS ---
const CoordinateOverlay = React.memo(({ orientation, squareSize }: { orientation: 'w' | 'b'; squareSize: number }) => {
  const COORD_INSET = Math.max(1, Math.round(squareSize * 0.02));
  const COORD_FONT = Math.max(9, Math.round(squareSize * 0.20));
  const coordFontStyle = { fontSize: COORD_FONT, lineHeight: COORD_FONT + 1 };
  const nodes: React.ReactNode[] = [];

  for (let i = 0; i < 8; i++) {
    // Números de fila: siempre en la primera columna visual, esquina superior izquierda.
    const rRank = orientation === 'w' ? i : 7 - i;
    const cRank = orientation === 'w' ? 0 : 7;
    nodes.push(
      <Text
        key={`rank-${i}`}
        style={[
          styles.coordText,
          coordFontStyle,
          {
            top: i * squareSize + COORD_INSET,
            left: COORD_INSET,
            color: (rRank + cRank) % 2 === 1 ? PALETTE.boardLight : PALETTE.boardDark,
          },
        ]}
      >
        {String(8 - rRank)}
      </Text>
    );

    // Letras de columna: siempre en la última fila visual, esquina inferior derecha.
    const cFile = orientation === 'w' ? i : 7 - i;
    const rFile = orientation === 'w' ? 7 : 0;
    nodes.push(
      <Text
        key={`file-${i}`}
        style={[
          styles.coordText,
          coordFontStyle,
          {
            bottom: COORD_INSET,
            right: (7 - i) * squareSize + COORD_INSET,
            color: (rFile + cFile) % 2 === 1 ? PALETTE.boardLight : PALETTE.boardDark,
          },
        ]}
      >
        {String.fromCharCode(97 + cFile)}
      </Text>
    );
  }

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 15 }]}>
      {nodes}
    </View>
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
  isAnalysisMode = false,
  engineOutput = null,
  showLegalMoves = true,
  showCoordinates = true,
  moveDurationMs = 200,
  size,
  positionKey = null,
  inputLocked = false,
}: ChessBoardProps) {
  const boardSize = size;
  const squareSize = size / 8;

  const shadowX = useSharedValue(0);
  const shadowY = useSharedValue(0);
  const showShadow = useSharedValue(false);
  // ID (no casilla) de la pieza que acaba de ser capturada al soltar un arrastre.
  const capturedPieceIdSV = useSharedValue<string | null>(null);
  // Mapa casilla -> ID legible desde los worklets de gesto, para resolver a quién
  // se come el arrastre en el mismo instante en que se suelta la pieza.
  const squareToPieceIdSV = useSharedValue<Record<string, string>>({});

  // --- ESPEJO DE LA SELECCIÓN EN EL HILO DE UI ---
  // Las casillas (BoardSquare) siguen leyendo las props normales: necesitan
  // re-renderizar para pintar el punto de movimiento legal y el resaltado. Las
  // piezas no: solo consultan estos valores dentro de los worklets de gesto,
  // así que los reciben como SharedValue y se ahorran el re-render.
  const selectedSquareSV = useSharedValue<string | null>(selectedSquare);
  const legalMovesSV = useSharedValue<string[]>(legalMoves);
  const turnSV = useSharedValue<'w' | 'b'>(turn);

  useEffect(() => { selectedSquareSV.value = selectedSquare; }, [selectedSquare]);
  useEffect(() => { legalMovesSV.value = legalMoves; }, [legalMoves]);
  useEffect(() => { turnSV.value = turn; }, [turn]);

  // Mismo patrón: identidad estable, así que bloquear/desbloquear no re-renderiza
  // las piezas (y por eso no está en el comparador del memo).
  const inputLockedSV = useSharedValue(inputLocked);
  useEffect(() => { inputLockedSV.value = inputLocked; }, [inputLocked]);

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

  // --- TRANSICIÓN ENTRE POSICIONES ---
  // Si NINGUNA pieza sobrevive de un render al siguiente, no es una jugada: es
  // otra posición (puzle nuevo, reintentar tras ver la solución, salir del
  // análisis). Con los IDs salados eso nunca pasa al mover.
  //
  // La capa nueva se monta de golpe dentro de un LayoutAnimationConfig con otra
  // `key`: la vieja se desmonta sin el FadeOut de cada pieza (skipExiting) y la
  // nueva entra sin su FadeIn (skipEntering). Antes eso exigía un estado
  // `swapping` que re-renderizaba todas las piezas al activarse y otra vez al
  // desactivarse.
  //
  //  - Cambia `positionKey` (otro puzle): App desliza el tablero, así que la
  //    capa no se funde. Las piezas ya están quietas cuando el tablero entra, y
  //    la capa hardware del deslizamiento deja de invalidarse en cada frame.
  //  - No cambia (reintentar, salir del análisis): no hay deslizamiento y la
  //    capa nueva entra con un fundido corto.
  const layerOpacity = useSharedValue(1);
  const layerScale = useSharedValue(1);

  const [rendered, setRendered] = useState<PieceLayer>(() => ({
    pieces, orientation, positionKey, key: 0, fadeIn: false,
  }));
  const [seen, setSeen] = useState({ pieces, orientation });
  const [pendingSwap, setPendingSwap] = useState<PendingSwap | null>(null);

  // Derivado DURANTE el render, no en un efecto: una jugada normal se pinta en
  // el mismo commit en que llegan las props. Con el efecto, cada jugada eran
  // dos renders y dos commits del tablero, y la animación de la pieza arrancaba
  // un ciclo de efectos más tarde.
  if (pieces !== seen.pieces || orientation !== seen.orientation) {
    const prevIds = new Set(seen.pieces.map(p => p.id));
    const isFullSwap =
      prevIds.size > 0 && pieces.length > 0 && pieces.every(p => !prevIds.has(p.id));
    setSeen({ pieces, orientation });

    if (isFullSwap) {
      setPendingSwap({ pieces, orientation, positionKey, fadeIn: positionKey === rendered.positionKey });
    } else if (pendingSwap) {
      // Otra actualización antes de que se pinte el cambio: se pinta la última.
      setPendingSwap({ ...pendingSwap, pieces, orientation });
    } else {
      setRendered(prev => ({ ...prev, pieces, orientation, positionKey }));
    }
  }

  // El cambio completo se pinta un render después, desde un efecto, a
  // propósito: los efectos de los hijos corren antes que los del padre, así que
  // cuando se monta la capa nueva App ya ha sacado el tablero de pantalla para
  // deslizarlo. En el mismo render se vería un frame la posición nueva en el
  // centro antes del salto.
  useEffect(() => {
    if (!pendingSwap) return;
    // Sin fundido, la capa tiene que quedar visible aunque hubiera uno a medias.
    layerOpacity.value = pendingSwap.fadeIn ? 0 : 1;
    layerScale.value = pendingSwap.fadeIn ? LAYER_SWAP_SCALE : 1;
    setRendered(prev => ({
      pieces: pendingSwap.pieces,
      orientation: pendingSwap.orientation,
      positionKey: pendingSwap.positionKey,
      key: prev.key + 1,
      fadeIn: pendingSwap.fadeIn,
    }));
    setPendingSwap(null);
  }, [pendingSwap]);

  useEffect(() => {
    if (!rendered.fadeIn) return;
    layerScale.value = withTiming(1, { duration: LAYER_FADE_IN });
    layerOpacity.value = withTiming(1, { duration: LAYER_FADE_IN });
  }, [rendered.key]);

  const pieceLayerStyle = useAnimatedStyle(() => ({
    opacity: layerOpacity.value,
    transform: [{ scale: layerScale.value }],
  }));

  useEffect(() => {
    const map: Record<string, string> = {};
    rendered.pieces.forEach(p => { map[p.square] = p.id; });
    squareToPieceIdSV.value = map;
  }, [rendered.pieces]);

  // La marca de captura NO se limpia en cada cambio de posición: limpiarla
  // mientras la capturada sigue montada la devolvía a opacity 1 justo antes de
  // desmontarla — ese era el parpadeo. Solo se limpia si la pieza sigue en el
  // tablero, es decir, si la jugada no llegó a aplicarse (p.ej. coronación
  // cancelada). Como los IDs no se reutilizan nunca, una marca obsoleta no
  // puede casar con otra pieza.
  useEffect(() => {
    const capturedId = capturedPieceIdSV.value;
    if (capturedId && pieces.some(p => p.id === capturedId)) {
      capturedPieceIdSV.value = null;
    }
  }, [pieces]);

  const animatedShadowStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: shadowX.value },
      { translateY: shadowY.value }
    ],
    opacity: showShadow.value ? 1 : 0,
  }));

  const evalBarWrapperStyle = useAnimatedStyle(() => ({
    height: analysisProgress.value * EVAL_BAR_BLOCK_HEIGHT,
    opacity: analysisProgress.value,
    transform: [{ translateY: (1 - analysisProgress.value) * -8 }],
  }));
  
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
          <EvalBar engineOutput={engineOutput} turn={turn} />
        </View>
      </Animated.View>

      <View style={[styles.board, { width: boardSize, height: boardSize }]}>
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
        {SQUARE_CELLS.map(({ r, c, square, isDark }) => {
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
              isLegalTarget={isLegal && !!selectedSquare && square !== selectedSquare}
              isCapture={showDot && occupiedSquares.has(square)}
              isLastMove={square === lastMoveFrom || square === lastMoveTo}
              hasKingInMate={mateKingSquare === square}
              onSquarePress={onSquarePress}
              isInvalidTarget={isInvalidTarget}
              invalidFlashSquare={invalidFlashSquare}
              invalidFlashNonce={invalidFlashNonce}
              onInvalidTarget={triggerInvalidTarget}
              squareSize={squareSize}
            />
          );
        })}

        {/* CAPA DE PIEZAS */}
        {/* Sin reordenar a los hijos: antes la seleccionada se ponía la última
            con un sort, y el differ de Fabric convertía cada selección en un
            remove + insert nativo de todas las piezas que iban detrás. Lo que
            la pone encima al arrastrarla es su zIndex animado. */}
        <Animated.View
          style={[StyleSheet.absoluteFill, { zIndex: 10 }, pieceLayerStyle]}
          pointerEvents="box-none"
        >
          {/* key nueva = posición nueva (ver TRANSICIÓN ENTRE POSICIONES).
              Un único hijo nativo (no aplanable) para que skipExiting afecte a
              todo el subárbol al desmontarse. */}
          <LayoutAnimationConfig key={rendered.key} skipEntering skipExiting>
            <View style={StyleSheet.absoluteFill} pointerEvents="box-none" collapsable={false}>
              {rendered.pieces.map((p: PieceItem) => {
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
                    legalMovesSV={legalMovesSV}
                    shadowX={shadowX}
                    shadowY={shadowY}
                    showShadow={showShadow}
                    turnSV={turnSV}
                    selectedSquareSV={selectedSquareSV}
                    capturedPieceIdSV={capturedPieceIdSV}
                    squareToPieceIdSV={squareToPieceIdSV}
                    onInvalidTarget={triggerInvalidTarget}
                    moveDurationMs={moveDurationMs}
                    squareSize={squareSize}
                    inputLockedSV={inputLockedSV}
                  />
                );
              })}
            </View>
          </LayoutAnimationConfig>
          </Animated.View>

          {/* CAPA DE COORDENADAS (encima de las piezas) */}
          {showCoordinates && <CoordinateOverlay orientation={rendered.orientation} squareSize={squareSize} />}

          {/* CAPA DE FLECHAS */}
          <ArrowLayer
            engineOutput={engineOutput}
            hintMove={hintMove}
            orientation={orientation}
            squareSize={squareSize}
          />
          
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
  // Tamaños del tablero y de las casillas: inline, dependen de la prop `size`.
  board: { borderRadius: 4, overflow: 'hidden', marginBottom: 4 },
  square: { position: "absolute", justifyContent: 'center', alignItems: 'center', zIndex: 1 },

  pieceContainer: { position: "absolute", justifyContent: 'center', alignItems: 'center' },
  legalMoveDot: { borderRadius: 100, backgroundColor: PALETTE.boardLegal, zIndex: 5 },
  captureRing: { borderColor: PALETTE.boardLegal, backgroundColor: 'transparent', zIndex: 5 },
  coordText: {
    position: 'absolute',
    fontWeight: '800',
    opacity: 0.75,
  },
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