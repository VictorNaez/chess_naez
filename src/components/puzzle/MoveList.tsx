import React, { useRef } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PALETTE } from '../colors';

interface MoveListProps {
  moveHistory: string[];
  viewIndex: number;
  onMovePress: (targetViewIndex: number) => void;
}

export const MoveList = React.memo(({ moveHistory, viewIndex, onMovePress }: MoveListProps) => {
  const scrollRef = useRef<ScrollView>(null);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.moveListContent}
      onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
    >
      {moveHistory.length === 0 ? (
        <Text style={{ color: PALETTE.secondary, fontSize: 12, opacity: 0.5 }}>...</Text>
      ) : (
        moveHistory.map((move, index) => {
          const isWhite = index % 2 === 0;
          const moveNumber = Math.floor(index / 2) + 1;
          const targetViewIndex = index + 1;

          return (
            <View key={index} style={styles.moveItem}>
              {isWhite && <Text style={styles.moveNumberText}>{moveNumber}.</Text>}
              <TouchableOpacity onPress={() => onMovePress(targetViewIndex)} style={styles.moveTouchArea}>
                <Text style={[
                  styles.moveText,
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
  );
});

const styles = StyleSheet.create({
  moveListContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 2 },
  moveItem: { flexDirection: 'row', alignItems: 'center' },
  moveNumberText: { color: PALETTE.secondary, fontSize: 12, fontWeight: '700', opacity: 0.6, marginRight: 3 },
  moveTouchArea: { paddingHorizontal: 4, paddingVertical: 2 },
  moveText: { color: PALETTE.primary, fontSize: 13, fontWeight: '700' },
});