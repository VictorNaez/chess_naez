import { LinearGradient as LG } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { uciLineToSan } from '../../lib/uci';
import { PALETTE } from '../colors';

interface EngineLine {
  id: number;
  pv: string;
  move: string;
  score: string;
  mateIn: number | null | undefined;
}

interface AnalysisLinesProps {
  engineLines: EngineLine[];
  fen: string;
  onSequencePress: (uciMoves: string[]) => void;
  isEvaluating: boolean;
  placeholderHeight?: number;   // alto del texto "Analizando...", depende de MultiPV
}

const PvLine = React.memo(({ line, fen, onSequencePress }: {
  line: EngineLine;
  fen: string;
  onSequencePress: (uciMoves: string[]) => void;
}) => {
  const [metrics, setMetrics] = useState({ content: 0, container: 0, scrollX: 0 });

  const uciMoves = line.pv.split(' ');
  const sanMoves = uciLineToSan(fen, uciMoves);

  const fenParts = fen.split(' ');
  const startTurnIsWhite = fenParts[1] === 'w';
  const startMoveNumber = parseInt(fenParts[5], 10) || 1;

  const maxScroll = Math.max(0, metrics.content - metrics.container);
  const showLeftFade = metrics.scrollX > 4;
  const showRightFade = metrics.scrollX < maxScroll - 4;

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

export const AnalysisLines = React.memo(({ engineLines, fen, onSequencePress, isEvaluating, placeholderHeight = 98 }: AnalysisLinesProps) => (
  <View style={styles.analysisLinesContainer}>
    {isEvaluating || engineLines.length === 0 ? (
      <Text style={{ color: PALETTE.secondary, fontSize: 12, opacity: 0.5, textAlign: 'center', height: placeholderHeight, textAlignVertical: 'center' }}>
        Analizando posición...
      </Text>
    ) : (
      engineLines.map((line) => (
        <PvLine key={line.id} line={line} fen={fen} onSequencePress={onSequencePress} />
      ))
    )}
  </View>
));

const styles = StyleSheet.create({
  analysisLinesContainer: { width: '100%', alignItems: 'center', gap: 1, justifyContent: 'flex-start' },
  moveListContent: { alignItems: 'center',  paddingHorizontal: 10 },
  moveItem: { flexDirection: 'row', marginRight: 12, alignItems: 'center' },
  moveNumberText: { color: PALETTE.secondary, fontSize: 12, marginRight: 4, fontWeight: '600' },
  moveTouchArea: {  paddingVertical: 5, paddingHorizontal: 2 },
  moveText: { color: PALETTE.primary, fontSize: 14, fontWeight: 'bold' },
  pvFadeEdge: { position: 'absolute', top: 0, bottom: 0, width: 20 },
  analysisLineRow: { flexDirection: 'row', alignItems: 'center', height: 32, width: '98%', paddingHorizontal: 6 },
  pvScrollWrapper: { flex: 1, position: 'relative' },
  evalBadge: { minWidth: 44, marginRight: 8, paddingVertical: 3, paddingHorizontal: 6, borderRadius: 6, alignItems: 'center', justifyContent: 'center'  },
  evalBadgeText: { fontSize: 11, fontWeight: '800', fontVariant: ['tabular-nums'] },
});