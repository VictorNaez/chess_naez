import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatDuration } from '../../lib/time';
import { PALETTE } from '../colors';

interface PuzzleTimerProps {
  startedAt: number | null;    // Date.now() en el que arrancó el crono
  frozenMs: number | null;     // si no es null, el crono está parado en este valor
  result: boolean | null;      // true = acierto, false = fallo, null = en curso
}

export const PuzzleTimer = React.memo(({ startedAt, frozenMs, result }: PuzzleTimerProps) => {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Crono parado: mostramos el valor congelado, sin montar ningún intervalo
    if (frozenMs !== null) {
      setElapsed(frozenMs);
      return;
    }

    // Todavía no hay puzzle jugable
    if (startedAt === null) {
      setElapsed(0);
      return;
    }

    setElapsed(Date.now() - startedAt);
    // 250ms para que el salto de segundo no se vea retrasado; solo re-renderiza este componente
    intervalRef.current = setInterval(() => setElapsed(Date.now() - startedAt), 250);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [startedAt, frozenMs]);

  const isStopped = frozenMs !== null;
  const color = isStopped && result !== null
    ? (result ? PALETTE.success : PALETTE.error)
    : PALETTE.accent;

  return (
    <View style={styles.timerFrame}>
      <Ionicons name={isStopped ? 'time' : 'time-outline'} size={13} color={color} />
      <Text style={[styles.timerText, { color }]}>{formatDuration(elapsed)}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  timerFrame: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: PALETTE.surface,
    paddingVertical: 6, paddingHorizontal: 12,
    borderRadius: 25, borderWidth: 1, borderColor: PALETTE.surfaceLight,
    elevation: 4,
  },
  timerText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5, fontVariant: ['tabular-nums'] },
});