import React, { useCallback, useEffect, useRef } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ClockAttempt } from '../../types/clock';
import { PALETTE } from '../colors';

interface ClockProgressGridProps {
  attempts: ClockAttempt[];
  // Al terminar la partida los cuadraditos dejan de ser solo un marcador: cada
  // uno abre su puzle en el tablero para analizarlo con calma.
  interactive?: boolean;
  selectedIndex?: number | null;
  onSelectAttempt?: (index: number) => void;
  // Cerrojo del repaso: justo después de abrir un puzle, el resto de cuadrados
  // no responden durante un momento para que no se apilen cargas.
  disabled?: boolean;
}

// La fila del header mide 118px fijos (ELO_ROW_HEIGHT + STREAK_SLOT_HEIGHT) y su
// contenedor lleva overflow:'hidden'. Estas constantes están calculadas para que
// entren 3 filas justas: 3 * 34 = 102, + 16 de padding vertical = 118.
const SQUARE = 20;
const CELL_W = 26;
const ROW_H = 34;
const GAP = 6;

// A nivel de módulo a propósito: definido dentro del render, React lo trataría
// como un componente nuevo en cada pasada y lo remontaría.
const AttemptCell = React.memo(({
  attempt, index, selected, interactive, disabled, onSelect,
}: {
  attempt: ClockAttempt;
  index: number;
  selected: boolean;
  interactive: boolean;
  disabled: boolean;
  onSelect?: (index: number) => void;
}) => {
  const handlePress = useCallback(() => onSelect?.(index), [onSelect, index]);

  const content = (
    <>
      <View style={[
        styles.square,
        { backgroundColor: attempt.pending ? PALETTE.pending : attempt.success ? PALETTE.success : PALETTE.error },
        selected && styles.squareSelected,
      ]} />
      <Text style={[styles.rating, selected && styles.ratingSelected]} numberOfLines={1}>
        {attempt.rating}
      </Text>
    </>
  );

  if (!interactive) return <View style={styles.cell}>{content}</View>;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.cell,
        pressed && styles.cellPressed,
        disabled && !selected && styles.cellDisabled,
      ]}
      onPress={handlePress}
      disabled={disabled}
      hitSlop={3}
    >
      {content}
    </Pressable>
  );
});

export const ClockProgressGrid = React.memo(({
  attempts, interactive = false, selectedIndex = null, onSelectAttempt, disabled = false,
}: ClockProgressGridProps) => {
  const scrollRef = useRef<ScrollView>(null);
  // Ancho útil del ScrollView: hace falta para saber cuántas celdas entran por
  // fila y poder desplazarse hasta la del puzle seleccionado.
  const widthRef = useRef(0);

  useEffect(() => {
    if (attempts.length === 0 || interactive) return;
    // rAF: en el mismo tick la fila nueva aún no está medida y scrollToEnd se queda corto
    const id = requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    return () => cancelAnimationFrame(id);
  }, [attempts.length, interactive]);

  // Con la partida terminada solo se ven 3 filas: al saltar de un puzle a otro
  // (botón "next" del repaso) el seleccionado puede quedar fuera de la ventana.
  useEffect(() => {
    if (selectedIndex === null || widthRef.current <= 0) return;
    const perRow = Math.max(1, Math.floor((widthRef.current + GAP) / (CELL_W + GAP)));
    const row = Math.floor(selectedIndex / perRow);
    scrollRef.current?.scrollTo({ y: row * (ROW_H + GAP), animated: true });
  }, [selectedIndex]);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
  }, []);

  return (
    <View style={styles.card}>
      <ScrollView
        ref={scrollRef}
        onLayout={handleLayout}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.grid}
      >
        {attempts.map((a, i) => (
          <AttemptCell
            key={`${a.puzzleId}-${i}`}
            attempt={a}
            index={i}
            selected={interactive && selectedIndex === i}
            interactive={interactive}
            disabled={disabled}
            onSelect={onSelectAttempt}
          />
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, alignContent: 'flex-start' },
  cell: { width: CELL_W, height: ROW_H, alignItems: 'center' },
  cellPressed: { opacity: 0.55 },
  cellDisabled: { opacity: 0.4 },
  square: { width: SQUARE, height: SQUARE, borderRadius: 5 },
  squareSelected: { borderWidth: 2, borderColor: PALETTE.accent },
  rating: { color: PALETTE.chipText, fontSize: 8, fontWeight: '700', marginTop: 3, fontVariant: ['tabular-nums'] },
  ratingSelected: { color: PALETTE.accent },
});
