import React, { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ClockAttempt } from '../../types/clock';
import { PALETTE } from '../colors';

interface ClockProgressGridProps {
  attempts: ClockAttempt[];
}

// La fila del header mide 118px fijos (ELO_ROW_HEIGHT + STREAK_SLOT_HEIGHT) y su
// contenedor lleva overflow:'hidden'. Estas constantes están calculadas para que
// entren 3 filas justas: 3 * 34 = 102, + 16 de padding vertical = 118.
const SQUARE = 20;
const CELL_W = 26;
const ROW_H = 34;

export const ClockProgressGrid = React.memo(({ attempts }: ClockProgressGridProps) => {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (attempts.length === 0) return;
    // rAF: en el mismo tick la fila nueva aún no está medida y scrollToEnd se queda corto
    const id = requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    return () => cancelAnimationFrame(id);
  }, [attempts.length]);

  return (
    <View style={styles.card}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.grid}
      >
        {attempts.map((a, i) => (
          <View key={`${a.puzzleId}-${i}`} style={styles.cell}>
            <View style={[
              styles.square,
              { backgroundColor: a.success ? PALETTE.success : PALETTE.error },
            ]} />
            <Text style={styles.rating} numberOfLines={1}>{a.rating}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: PALETTE.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PALETTE.surfaceLight,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignContent: 'flex-start' },
  cell: { width: CELL_W, height: ROW_H, alignItems: 'center' },
  square: { width: SQUARE, height: SQUARE, borderRadius: 5 },
  rating: { color: PALETTE.chipText, fontSize: 8, fontWeight: '700', marginTop: 3, fontVariant: ['tabular-nums'] },
});