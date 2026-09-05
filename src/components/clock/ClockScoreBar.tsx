import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PALETTE } from '../colors';

interface ClockScoreBarProps {
  solved: number;
  failed: number;
}

export const ClockScoreBar = React.memo(({ solved, failed }: ClockScoreBarProps) => (
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
  </View>
));

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18 },
  value: { fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] },
  label: { color: PALETTE.chipText, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  divider: { width: 1, height: 18, backgroundColor: PALETTE.surfaceLight },
});