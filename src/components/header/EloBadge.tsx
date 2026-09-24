import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { DEFAULT_ELO } from '../../lib/elo';
import { PALETTE } from '../colors';

// --- CONTADOR ANIMADO DE ELO (aislado: solo re-renderiza este <Text>) ---
const AnimatedEloValue = React.memo((
  { target, jumpToken = 0 }: { target: number | undefined; jumpToken?: number },
) => {
  const [displayed, setDisplayed] = useState<number>(target ?? DEFAULT_ELO);
  const currentRef = useRef<number>(target ?? DEFAULT_ELO);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seededRef = useRef(false);

  // Restaurar una copia de la nube cambia el ELO de golpe, y contar de uno en
  // uno desde 1500 hasta el valor real se lee como "acabas de resolver un puzle
  // increíble". Cuando el token cambia, el SIGUIENTE valor entra sin animación.
  // Es un aviso por adelantado, no un salto inmediato: el token sube al empezar
  // la restauración y el valor nuevo llega uno o dos renders después.
  const pendingJumpRef = useRef(false);
  const lastJumpTokenRef = useRef(jumpToken);

  useEffect(() => {
    if (jumpToken === lastJumpTokenRef.current) return;
    lastJumpTokenRef.current = jumpToken;
    pendingJumpRef.current = true;
  }, [jumpToken]);

  useEffect(() => {
    if (target === undefined) return;

    if (pendingJumpRef.current) {
      pendingJumpRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      currentRef.current = target;
      setDisplayed(target);
      return;
    }

    if (!seededRef.current) {
      seededRef.current = true;
      currentRef.current = target;
      setDisplayed(target);
      return;
    }

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const start = currentRef.current;
    if (target === start) return;

    const totalSteps = Math.abs(target - start);
    const step = target > start ? 1 : -1;
    const stepDuration = Math.max(15, Math.min(45, Math.round(500 / totalSteps)));

    let current = start;
    intervalRef.current = setInterval(() => {
      current += step;
      currentRef.current = current;
      setDisplayed(current);
      if (current === target) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
      }
    }, stepDuration);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [target]);

  return <Text style={styles.eloValue}>{displayed}</Text>;
});

interface EloBadgeProps {
  target: number | undefined;
  feedback: { value: number } | null;
  /** Sube cuando el progreso se sustituye entero (restauración desde la nube). */
  jumpToken?: number;
}

export const EloBadge = React.memo(({ target, feedback, jumpToken }: EloBadgeProps) => (
  <View style={styles.eloBadge}>
    <Text style={styles.eloLabel}>ELO</Text>
    <View style={styles.eloValueContainer}>
      <AnimatedEloValue target={target} jumpToken={jumpToken} />
    </View>

    {feedback && (
      <Animated.View
        entering={FadeIn.duration(150)}
        exiting={FadeOut.duration(100)}
        style={styles.eloFeedbackRow}
      >
        <Ionicons
          name={feedback.value >= 0 ? "arrow-up" : "arrow-down"}
          size={12}
          color={feedback.value >= 0 ? PALETTE.success : PALETTE.error}
        />
        <Text style={[
          styles.eloFeedbackText,
          { color: feedback.value >= 0 ? PALETTE.success : PALETTE.error }
        ]}>
          {Math.abs(feedback.value)}
        </Text>
      </Animated.View>
    )}
  </View>
));

const styles = StyleSheet.create({
  eloBadge: { backgroundColor: 'rgba(26, 26, 26, 0.65)', borderRadius: 14, paddingVertical: 6, paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)',  alignItems: 'center', justifyContent: 'center', minWidth: 90,},
  eloLabel: { fontSize: 9, fontWeight: '700', color: '#888', letterSpacing: 1.5, marginBottom: -2, textAlign: 'center' },
  eloValueContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  eloValue: { fontSize: 18, fontWeight: '800', color: PALETTE.primary, fontVariant: ['tabular-nums'], letterSpacing: 0.5, textAlign: 'center' },
  eloFeedbackRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 2, gap: 2 },
  eloFeedbackText: { fontSize: 10, fontWeight: '800', fontVariant: ['tabular-nums'] },
});