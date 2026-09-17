import { LinearGradient as LG } from 'expo-linear-gradient';
import React, { useState } from 'react';
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

const PvLine = React.memo(({ line, isStale, onSequencePress }: {
  line: EngineLine;
  // La línea es de la posición anterior mientras el motor calcula la nueva: se
  // ve atenuada y no responde (sus jugadas no serían legales en el tablero).
  isStale: boolean;
  onSequencePress: (uciMoves: string[]) => void;
}) => {
  const [metrics, setMetrics] = useState({ content: 0, container: 0, scrollX: 0 });

  const uciMoves = line.pv.split(' ');
  // El SAN llega calculado desde la WebView; solo si faltara se calcula aquí.
  // Siempre contra la FEN de la propia línea, no la del tablero.
  const sanMoves = line.san ?? (line.fen ? uciLineToSan(line.fen, uciMoves) : []);

  const fenParts = line.fen.split(' ');
  const startTurnIsWhite = fenParts[1] === 'w';
  const startMoveNumber = parseInt(fenParts[5], 10) || 1;

  const maxScroll = Math.max(0, metrics.content - metrics.container);
  const showLeftFade = metrics.scrollX > 4;
  const showRightFade = metrics.scrollX < maxScroll - 4;

  const isPositive = line.mateIn !== null && line.mateIn !== undefined
    ? line.mateIn > 0
    : !line.score.startsWith('-');

  return (
    <View style={[styles.analysisLineRow, isStale && styles.staleRow]}>
      <View style={[styles.evalBadge, { backgroundColor: isPositive ? PALETTE.boardLight : PALETTE.boardDark }]}>
        <TouchableOpacity onPress={() => onSequencePress([line.move])}>
          <Text style={[styles.evalBadgeText, { color: isPositive ? PALETTE.boardDark : PALETTE.boardLight }]}>
            {line.score}
          </Text>
        </TouchableOpacity>
      </View>

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
          {sanMoves.map((sanMove, index) => {
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
    </View>
  );
});

// Mientras el motor calcula una posición nueva se siguen viendo las líneas de la
// anterior, atenuadas, en vez de cambiar a "Analizando posición...": antes cada
// jugada desmontaba y volvía a montar las filas (ScrollView, degradados y un
// botón por jugada) y el panel parpadeaba. El texto solo aparece si no hay nada
// que enseñar (primera entrada).
export const AnalysisLines = React.memo(({ engineOutput, onSequencePress, placeholderHeight = 98 }: AnalysisLinesProps) => {
  const lines = useEngineOutput(engineOutput, (s) => s.lines);
  const isEvaluating = useEngineOutput(engineOutput, (s) => s.isEvaluating);

  return (
    <View style={styles.analysisLinesContainer}>
      {lines.length === 0 ? (
        <Text style={{ color: PALETTE.secondary, fontSize: 12, opacity: 0.5, textAlign: 'center', height: placeholderHeight, textAlignVertical: 'center' }}>
          Analizando posición...
        </Text>
      ) : (
        lines.map((line) => (
          <PvLine key={line.id} line={line} isStale={isEvaluating} onSequencePress={onSequencePress} />
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
  pvFadeEdge: { position: 'absolute', top: 0, bottom: 0, width: 20 },
  analysisLineRow: { flexDirection: 'row', alignItems: 'center', height: 32, width: '98%', paddingHorizontal: 6 },
  staleRow: { opacity: 0.4, pointerEvents: 'none' },
  pvScrollWrapper: { flex: 1, position: 'relative' },
  evalBadge: { minWidth: 44, marginRight: 8, paddingVertical: 3, paddingHorizontal: 6, borderRadius: 6, alignItems: 'center', justifyContent: 'center'  },
  evalBadgeText: { fontSize: 11, fontWeight: '800', fontVariant: ['tabular-nums'] },
});