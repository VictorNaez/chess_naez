import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { hapticImpact } from '../../lib/haptics';
import { PALETTE } from '../colors';
import { useT } from '../../i18n/I18nProvider';

interface RepasoProgressPillProps {
  current: number;
  total: number;
  onExit: () => void;
}

// Ocupa el hueco de FILTERS + HISTORY, que en repaso no tienen sentido: la cola
// decide qué puzles ves y en qué orden.
export const RepasoProgressPill = React.memo(({ current, total, onExit }: RepasoProgressPillProps) => {
  const t = useT();
  return (
  <View style={styles.wrap}>
    <View style={styles.pill}>
      <Ionicons name="repeat" size={16} color={PALETTE.secondary} />
      <Text style={styles.label}>{t.repaso.title}</Text>
      <Text style={styles.counter}>{current}/{total}</Text>
    </View>

    <TouchableOpacity
      style={styles.exitBtn}
      onPress={() => { hapticImpact('light'); onExit(); }}
      hitSlop={8}
    >
      <Ionicons name="close" size={18} color={PALETTE.chipText} />
    </TouchableOpacity>
  </View>
  );
});

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: PALETTE.surface, paddingVertical: 10, paddingHorizontal: 15,
    borderRadius: 12, borderWidth: 1, borderColor: PALETTE.surfaceLight,
  },
  label: { color: PALETTE.primary, fontWeight: '800', fontSize: 12, letterSpacing: 0.8 },
  counter: {
    color: PALETTE.accent, fontWeight: '900', fontSize: 12,
    fontVariant: ['tabular-nums'], letterSpacing: 0.5,
  },
  exitBtn: {
    width: 38, height: 38, alignItems: 'center', justifyContent: 'center',
    backgroundColor: PALETTE.surface, borderRadius: 12,
    borderWidth: 1, borderColor: PALETTE.surfaceLight,
  },
});
