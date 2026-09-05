import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { PALETTE } from '../colors';

interface ClockScoreBarProps {
  solved: number;
  failed: number;
  // Solo en supervivencia. Si no llega, la barra es la del contrarreloj.
  lives?: number;
  maxLives?: number;
}

// A nivel de módulo a propósito: definido dentro del render, React lo trataría
// como un componente nuevo en cada pasada y lo remontaría (adiós animación).
const LivesRow = React.memo(({ lives, maxLives }: { lives: number; maxLives: number }) => {
  const scale = useSharedValue(1);
  const prevLives = useRef(lives);

  useEffect(() => {
    // Solo al PERDER una vida. Al reiniciar la partida las vidas suben y no
    // queremos que eso dispare el golpe.
    if (lives < prevLives.current) {
      scale.value = withSequence(
        withTiming(1.35, { duration: 110, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) }),
      );
    }
    prevLives.current = lives;
  }, [lives]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[styles.livesRow, animatedStyle]}>
      {Array.from({ length: maxLives }).map((_, i) => {
        const alive = i < lives;
        return (
          <Ionicons
            key={i}
            name={alive ? 'heart' : 'heart-outline'}
            size={16}
            color={alive ? PALETTE.error : PALETTE.disabled}
          />
        );
      })}
    </Animated.View>
  );
});

export const ClockScoreBar = React.memo(({ solved, failed, lives, maxLives = 3 }: ClockScoreBarProps) => (
  <View style={styles.row}>
    <View style={styles.item}>
      <Ionicons name="checkmark-circle" size={15} color={PALETTE.success} />
      <Text style={[styles.value, { color: PALETTE.success }]}>{solved}</Text>
      <Text style={styles.label}>ACIERTOS</Text>
    </View>

    <View style={styles.divider} />

    <View style={styles.item}>
      <Ionicons name="close-circle" size={15} color={PALETTE.error} />
      <Text style={[styles.value, { color: PALETTE.error }]}>{failed}</Text>
      <Text style={styles.label}>FALLOS</Text>
    </View>

    {lives !== undefined && (
      <>
        <View style={styles.divider} />
        <View style={styles.item}>
          <LivesRow lives={lives} maxLives={maxLives} />
          <Text style={styles.label}>VIDAS</Text>
        </View>
      </>
    )}
  </View>
));

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  // Con tres bloques el padding de 18 se queda largo en pantallas estrechas.
  item: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14 },
  value: { fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] },
  label: { color: PALETTE.chipText, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  divider: { width: 1, height: 18, backgroundColor: PALETTE.surfaceLight },
  livesRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
});
