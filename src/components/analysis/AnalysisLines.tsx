import { LinearGradient as LG } from 'expo-linear-gradient';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useEngineOutput, type EngineLine, type EngineOutputStore } from '../../lib/engineOutput';
import { uciLineToSan } from '../../lib/uci';
import { PALETTE } from '../colors';

interface AnalysisLinesProps {
  // Store y no las líneas: cada actualización del motor re-renderiza este panel,
  // no App.
  engineOutput: EngineOutputStore;
  onSequencePress: (uciMoves: string[]) => void;
  placeholderHeight?: number;   // alto del texto "Analizando...", depende de MultiPV
}

// Tope de jugadas pintadas por línea. Una PV de profundidad 20 trae 20-25
// plies, y cada uno cuesta View + TouchableOpacity + 2 Text dentro de un
// ScrollView. A partir de la décima jugada nadie está leyendo nada: lo que se
// paga es montar vistas en el hilo de UI cada vez que el motor sube de
// profundidad. Las jugadas recortadas siguen existiendo en `pv` (el UCI
// completo es lo que se reproduce al tocar).
const MAX_PV_MOVES = 99; // sin limite

// La lista de jugadas, separada del badge de puntuación a propósito: sus props
// son primitivas, así que entre dos iteraciones con la misma PV el memo acierta
// y no se reconstruye nada aunque la evaluación haya cambiado.
const PvMoves = React.memo(function PvMoves({ pv, sanText, fen, onSequencePress }: {
  pv: string;
  /** PV en SAN ya calculada en la WebView, como texto. null -> se calcula aquí. */
  sanText: string | null;
  fen: string;
  onSequencePress: (uciMoves: string[]) => void;
}) {
  const [metrics, setMetrics] = useState({ content: 0, container: 0, scrollX: 0 });

  const uciMoves = useMemo(() => pv.split(' '), [pv]);
  // Siempre contra la FEN de la propia línea, no la del tablero.
  const sanMoves = useMemo(() => {
    if (sanText !== null) return sanText ? sanText.split(' ') : [];
    return fen ? uciLineToSan(fen, uciMoves) : [];
  }, [sanText, fen, uciMoves]);

  const fenParts = fen.split(' ');
  const startTurnIsWhite = fenParts[1] === 'w';
  const startMoveNumber = parseInt(fenParts[5], 10) || 1;

  const isTruncated = sanMoves.length > MAX_PV_MOVES;
  const visibleMoves = isTruncated ? sanMoves.slice(0, MAX_PV_MOVES) : sanMoves;

  const maxScroll = Math.max(0, metrics.content - metrics.container);
  const showLeftFade = metrics.scrollX > 4;
  const showRightFade = metrics.scrollX < maxScroll - 4;

  return (
    <View style={styles.pvScrollWrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.moveListContent}
        scrollEventThrottle={16}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          setMetrics(prev => ({ ...prev, container: w }));
        }}
        onContentSizeChange={(w) => {
          setMetrics(prev => ({ ...prev, content: w }));
        }}
        onScroll={(e) => {
          const offsetX = e.nativeEvent?.contentOffset?.x;
          if (typeof offsetX !== 'number') return;
          setMetrics(prev => ({ ...prev, scrollX: offsetX }));
        }}
      >
        {visibleMoves.map((sanMove, index) => {
          const isWhiteMove = startTurnIsWhite ? index % 2 === 0 : index % 2 === 1;
          const moveNumber = startMoveNumber + Math.floor((startTurnIsWhite ? index : index + 1) / 2);
          const showNumber = isWhiteMove || index === 0;

          return (
            <View key={index} style={styles.moveItem}>
              {showNumber && (
                <Text style={styles.moveNumberText}>
                  {moveNumber}{isWhiteMove ? '.' : '...'}
                </Text>
              )}
              <TouchableOpacity
                onPress={() => onSequencePress(uciMoves.slice(0, index + 1))}
                style={styles.moveTouchArea}
              >
                <Text style={styles.moveText}>{sanMove}</Text>
              </TouchableOpacity>
            </View>
          );
        })}
        {isTruncated && <Text style={styles.moveTruncatedText}>…</Text>}
      </ScrollView>

      {showLeftFade && (
        <LG
          pointerEvents="none"
          colors={[PALETTE.background, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.pvFadeEdge, { left: 0 }]}
        />
      )}
      {showRightFade && (
        <LG
          pointerEvents="none"
          colors={['transparent', PALETTE.background]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.pvFadeEdge, { right: 0 }]}
        />
      )}
    </View>
  );
});

const PvLine = React.memo(({ line, onSequencePress }: {
  line: EngineLine;
  onSequencePress: (uciMoves: string[]) => void;
}) => {
  const isPositive = line.mateIn !== null && line.mateIn !== undefined
    ? line.mateIn > 0
    : !line.score.startsWith('-');

  return (
    <View style={styles.analysisLineRow}>
      <View style={[styles.evalBadge, { backgroundColor: isPositive ? PALETTE.boardLight : PALETTE.boardDark }]}>
        <TouchableOpacity onPress={() => onSequencePress([line.move])}>
          <Text style={[styles.evalBadgeText, { color: isPositive ? PALETTE.boardDark : PALETTE.boardLight }]}>
            {line.score}
          </Text>
        </TouchableOpacity>
      </View>

      <PvMoves
        pv={line.pv}
        sanText={line.san ? line.san.join(' ') : null}
        fen={line.fen}
        onSequencePress={onSequencePress}
      />
    </View>
  );
});

// Mientras el motor calcula una posición nueva se siguen viendo las líneas de la
// anterior, atenuadas, en vez de cambiar a "Analizando posición...": antes cada
// jugada desmontaba y volvía a montar las filas (ScrollView, degradados y un
// botón por jugada) y el panel parpadeaba. El texto solo aparece si no hay nada
// que enseñar (primera entrada).
//
// El atenuado va en el CONTENEDOR, no fila a fila: como prop de PvLine,
// `isEvaluating` cambiaba dos veces por jugada y hacía fallar el memo de las
// tres filas, que se reconstruían enteras para acabar cambiando una opacidad.
export const AnalysisLines = React.memo(({ engineOutput, onSequencePress, placeholderHeight = 98 }: AnalysisLinesProps) => {
  const lines = useEngineOutput(engineOutput, (s) => s.lines);
  const isEvaluating = useEngineOutput(engineOutput, (s) => s.isEvaluating);

  return (
    <View style={[styles.analysisLinesContainer, isEvaluating && styles.staleRows]}>
      {lines.length === 0 ? (
        <Text style={{ color: PALETTE.secondary, fontSize: 12, opacity: 0.5, textAlign: 'center', height: placeholderHeight, textAlignVertical: 'center' }}>
          Analizando posición...
        </Text>
      ) : (
        lines.map((line) => (
          <PvLine key={line.id} line={line} onSequencePress={onSequencePress} />
        ))
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  analysisLinesContainer: { width: '100%', alignItems: 'center', gap: 1, justifyContent: 'flex-start' },
  moveListContent: { alignItems: 'center',  paddingHorizontal: 10 },
  moveItem: { flexDirection: 'row', marginRight: 12, alignItems: 'center' },
  moveNumberText: { color: PALETTE.secondary, fontSize: 12, marginRight: 4, fontWeight: '600' },
  moveTouchArea: {  paddingVertical: 5, paddingHorizontal: 2 },
  moveText: { color: PALETTE.primary, fontSize: 14, fontWeight: 'bold' },
  moveTruncatedText: { color: PALETTE.secondary, fontSize: 14, fontWeight: 'bold', opacity: 0.5, marginRight: 12 },
  pvFadeEdge: { position: 'absolute', top: 0, bottom: 0, width: 20 },
  analysisLineRow: { flexDirection: 'row', alignItems: 'center', height: 32, width: '98%', paddingHorizontal: 6 },
  staleRows: { opacity: 0.4, pointerEvents: 'none' },
  pvScrollWrapper: { flex: 1, position: 'relative' },
  evalBadge: { minWidth: 44, marginRight: 8, paddingVertical: 3, paddingHorizontal: 6, borderRadius: 6, alignItems: 'center', justifyContent: 'center'  },
  evalBadgeText: { fontSize: 11, fontWeight: '800', fontVariant: ['tabular-nums'] },
});