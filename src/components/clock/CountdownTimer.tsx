import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { formatCountdown } from '../../lib/clock';
import { PALETTE } from '../colors';

interface CountdownTimerProps {
  endsAt: number | null;   // null = aún no ha arrancado
  durationMs: number;
  isFinished: boolean;
}

const WARN_MS = 30_000;
const DANGER_MS = 10_000;

export const CountdownTimer = React.memo(({ endsAt, durationMs, isFinished }: CountdownTimerProps) => {
  const [remaining, setRemaining] = useState(durationMs);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }

    if (endsAt === null) { setRemaining(isFinished ? 0 : durationMs); return; }

    const tick = () => setRemaining(Math.max(0, endsAt - Date.now()));
    tick();
    // 100ms: el salto de segundo no se ve retrasado y solo re-renderiza este componente
    intervalRef.current = setInterval(tick, 100);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); intervalRef.current = null; };
  }, [endsAt, durationMs, isFinished]);

  const isDanger = remaining <= DANGER_MS && remaining > 0 && endsAt !== null;

  useEffect(() => {
    if (isDanger) {
      pulse.value = withRepeat(
        withTiming(1.12, { duration: 500, easing: Easing.inOut(Easing.quad) }), -1, true,
      );
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(1, { duration: 150 });
    }
  }, [isDanger]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const color = remaining <= DANGER_MS ? PALETTE.error
    : remaining <= WARN_MS ? PALETTE.warning
    : PALETTE.accent;

  return (
    <Animated.View style={[styles.frame, { borderColor: color }, animatedStyle]}>
      <Ionicons name="timer-outline" size={16} color={color} />
      <Text style={[styles.text, { color }]}>{formatCountdown(remaining)}</Text>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  frame: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: PALETTE.surface,
    paddingVertical: 6, paddingHorizontal: 14,
    borderRadius: 25, borderWidth: 1.5, elevation: 4,
  },
  text: { fontSize: 17, fontWeight: '900', letterSpacing: 0.5, fontVariant: ['tabular-nums'] },
});