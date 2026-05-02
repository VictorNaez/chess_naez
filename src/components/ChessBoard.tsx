import React, { useEffect } from "react";
import { Dimensions, Image, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { PALETTE } from "./colors";

// Definimos la interfaz para que TypeScript no se queje con los tipos 'any'
export interface PieceItem {
  id: string;
  type: string;
  color: 'w' | 'b';
  square: string;
}

interface ChessBoardProps {
  pieces: PieceItem[];
  onSquarePress: (square: string) => void;
  selectedSquare: string | null;
  legalMoves: string[];
  orientation: 'w' | 'b';
  hintSquare?: string | null;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const boardSize = Math.floor(SCREEN_WIDTH * 0.98);
const squareSize = boardSize / 8;

// --- DICCIONARIO DE IMÁGENES ---
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

// --- COMPONENTE DE PIEZA INDIVIDUAL ---
const AnimatedPiece = ({ p, visualRow, visualCol }: { p: PieceItem, visualRow: number, visualCol: number }) => {
  const targetX = visualCol * squareSize;
  const targetY = visualRow * squareSize;

  const posX = useSharedValue(targetX);
  const posY = useSharedValue(targetY);

  useEffect(() => {
    posX.value = withTiming(targetX, { duration: 200 });
    posY.value = withTiming(targetY, { duration: 200 });
  }, [visualRow, visualCol]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: posX.value },
      { translateY: posY.value }
    ],
  }));

  const imageKey = p.color === 'w' ? p.type.toUpperCase() : p.type.toLowerCase();

  return (
    <Animated.View style={[styles.pieceContainer, animatedStyle]} pointerEvents="none">
      <Animated.View 
        entering={FadeIn.duration(300)} //entering={ZoomIn.duration(300)} 
        exiting={FadeOut.duration(300)} //exiting={ZoomOut.duration(300)}
      >
        <Image 
          source={pieceImages[imageKey]} 
          style={{ width: squareSize * 0.925, height: squareSize * 0.925 }} 
        />
      </Animated.View>
    </Animated.View>
  );
};

// --- COMPONENTE PRINCIPAL DEL TABLERO ---
export default function ChessBoard({ 
  pieces = [], 
  onSquarePress, 
  selectedSquare, 
  legalMoves = [], 
  orientation = 'w' ,
  hintSquare = null
}: ChessBoardProps) {

  return (
    <View style={styles.board}>
      {/* RENDER DE CASILLAS (Fondo estático) */}
      {[...Array(64)].map((_, i) => {
        const r = Math.floor(i / 8); 
        const c = i % 8;
        
        // Coordenadas lógicas (siempre a1 es abajo izq en chess.js)
        const square = String.fromCharCode(97 + c) + (8 - r);
        
        // Coordenadas visuales (invierte el tablero si eres negras)
        const vRow = orientation === 'w' ? r : 7 - r;
        const vCol = orientation === 'w' ? c : 7 - c;

        const showNumber = vCol === 0;
        const showLabel = vRow === 7;

        const isSelected = square === selectedSquare;
        const isLegal = legalMoves.includes(square);
        const isDark = (r + c) % 2 === 1;
        const isHint = hintSquare === square;

        const isOccupied = pieces.some(p => p.square === square);
        const isCapture = isLegal && isOccupied;


        return (
          <Pressable 
            key={`sq-${square}`} 
            onPress={() => onSquarePress(square)}
            style={[
              styles.square, 
              {
              left: vCol * squareSize, 
              top: vRow * squareSize,
              width: squareSize + 0.5, 
              height: squareSize + 0.5,
              backgroundColor: isSelected 
                ? PALETTE.boardSelect 
                : isHint 
                  ? PALETTE.lightSuccess
                  : (isDark ? PALETTE.boardDark : PALETTE.boardLight),
                    }
                  ]}
          >

          {/* COORDENADA NUMÉRICA (1-8) */}
          {showNumber && (
            <Text style={[
              styles.coordText, 
              { top: 2, left: 2, color: isDark ? PALETTE.boardLight : PALETTE.boardDark }
            ]}>
              {8 - r}
            </Text>
          )}

          {/* COORDENADA ALFABÉTICA (a-h) */}
          {showLabel && (
            <Text style={[
              styles.coordText, 
              { bottom: 2, right: 4, color: isDark ? PALETTE.boardLight : PALETTE.boardDark }
            ]}>
              {String.fromCharCode(97 + c)}
            </Text>
          )}

          {/* Indicador de movimiento legal */}
          {isLegal && (
            isCapture ? (
              /* UI PARA CAPTURA: Un círculo abierto */
              <View style={styles.captureRing} />
            ) : (
              /* UI PARA MOVIMIENTO NORMAL: El puntito */
              <View style={styles.legalMoveDot} />
            )
          )}
          
          </Pressable>
        );
      })}

      {/* RENDER DE PIEZAS (Capa animada) */}
      {pieces
        .slice()
        // Ordenamos para que la pieza seleccionada vuele por encima del resto (zIndex)
        .sort((a: PieceItem, b: PieceItem) => {
          if (a.square === selectedSquare) return 1;
          if (b.square === selectedSquare) return -1;
          return 0;
        })
        .map((p: PieceItem) => {
          const col = p.square.charCodeAt(0) - 97;
          const row = 8 - parseInt(p.square[1]);
          
          return (
            <AnimatedPiece 
              key={p.id} 
              p={p} 
              visualRow={orientation === 'w' ? row : 7 - row}
              visualCol={orientation === 'w' ? col : 7 - col}
            />
          );
        })}
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    width: boardSize,
    height: boardSize,
    borderRadius: 4,
    overflow: 'hidden',
  },
  square: {
    position: "absolute",
    width: squareSize,
    height: squareSize,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  pieceContainer: {
    position: "absolute",
    width: squareSize,
    height: squareSize,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  legalMoveDot: {
    width: squareSize * 0.30,
    height: squareSize * 0.30,
    borderRadius: 100,
    backgroundColor: PALETTE.boardLegal
  },

  captureRing: {
    width: squareSize * 1, // Casi tan grande como la casilla
    height: squareSize * 1,
    borderRadius: squareSize, // Círculo perfecto
    borderWidth: 5,           // Grosor del anillo
    borderColor: PALETTE.boardLegal,
    backgroundColor: 'transparent',
  },

  coordText: {
    position: 'absolute',
    fontSize: 10,
    fontWeight: '800',
    opacity: 0.6,
    zIndex: 2,
  },
});