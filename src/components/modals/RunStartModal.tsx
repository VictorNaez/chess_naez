import { Ionicons } from '@expo/vector-icons';
import * as SQLite from 'expo-sqlite';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { hapticImpact } from '../../lib/haptics';
import type { RunKind, RunRecords } from '../../types/run';
import { getRunRecords } from '../../types/runs';
import { PALETTE } from '../colors';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export interface RunOption {
  id: string;
  label: string;
  ms: number;
}

interface RunStartModalProps {
  visible: boolean;
  db: SQLite.SQLiteDatabase | null;
  kind: RunKind;
  icon: IoniconName;
  title: string;
  subtitle: string;
  options: readonly RunOption[];
  defaultMs: number;
  // Etiqueta bajo el número de récord. Contrarreloj compara partidas de la misma
  // duración; supervivencia, partidas con el mismo tiempo por puzle.
  optionsLabel?: string;
  onClose: () => void;
  onStart: (ms: number) => void;
}

const EMPTY: RunRecords = { bestAllTime: 0, bestThisWeek: 0, total: 0 };

// A nivel de módulo: definido dentro del render, React lo remontaría en cada
// pasada y el FadeIn/FadeOut se dispararía sin motivo.
const RecordValue = React.memo(({ value }: { value: number }) => (
  <View style={styles.recordValueSlot}>
    <Animated.Text
      key={value}
      entering={FadeIn.duration(260)}
      exiting={FadeOut.duration(220)}
      style={styles.recordValue}
    >
      {value}
    </Animated.Text>
  </View>
));

export const RunStartModal = React.memo(({
  visible, db, kind, icon, title, subtitle, options, defaultMs, optionsLabel, onClose, onStart,
}: RunStartModalProps) => {
  const [selected, setSelected] = useState<number>(defaultMs);
  const [records, setRecords] = useState<RunRecords>(EMPTY);

  // Los récords van por "cubo": 8 puzles en 1 min no compiten con 8 en 5 min,
  // ni 8 supervivientes a 15 s con 8 a 60 s.
  useEffect(() => {
    if (!visible || !db) return;
    let cancelled = false;

    (async () => {
      try {
        const r = await getRunRecords(db, kind, selected);
        if (!cancelled) setRecords(r);
      } catch (e) {
        console.error('Error leyendo récords de la partida:', e);
      }
    })();

    return () => { cancelled = true; };
  }, [visible, db, kind, selected]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={styles.card}>
          <Ionicons name={icon} size={34} color={PALETTE.secondary} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          {!!optionsLabel && <Text style={styles.optionsLabel}>{optionsLabel}</Text>}

          <View style={[styles.durationRow, !optionsLabel && styles.durationRowSpaced]}>
            {options.map(o => (
              <TouchableOpacity
                key={o.id}
                style={[styles.durationChip, selected === o.ms && styles.durationChipActive]}
                onPress={() => { hapticImpact('light'); setSelected(o.ms); }}
              >
                <Text style={[styles.durationText, selected === o.ms && styles.durationTextActive]}>
                  {o.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.recordsRow}>
            <View style={styles.recordItem}>
              <RecordValue value={records.bestAllTime} />
              <Text style={styles.recordLabel}>RÉCORD</Text>
            </View>
            <View style={styles.recordItem}>
              <RecordValue value={records.bestThisWeek} />
              <Text style={styles.recordLabel}>ESTA SEMANA</Text>
            </View>
            <View style={styles.recordItem}>
              <RecordValue value={records.total} />
              <Text style={styles.recordLabel}>PARTIDAS</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.startBtn}
            onPress={() => { hapticImpact('medium'); onStart(selected); }}
          >
            <Ionicons name="play" size={20} color="#ffffff" />
            <Text style={styles.startText}>EMPEZAR</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: {
    width: '100%', maxWidth: 400, alignItems: 'center',
    backgroundColor: PALETTE.surfaceDark, borderRadius: 20,
    borderWidth: 1, borderColor: PALETTE.surfaceLight, padding: 24,
  },
  title: { color: PALETTE.primary, fontSize: 20, fontWeight: '900', letterSpacing: 2, marginTop: 10 },
  subtitle: { color: PALETTE.chipText, fontSize: 12, textAlign: 'center', marginTop: 8, lineHeight: 18 },
  optionsLabel: { color: PALETTE.chipText, fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginTop: 20, marginBottom: 8 },
  durationRow: { flexDirection: 'row', gap: 8, width: '100%' },
  durationRowSpaced: { marginTop: 22 },
  durationChip: {
    flex: 1, minWidth: 0, paddingVertical: 12, alignItems: 'center',
    backgroundColor: PALETTE.chipBg, borderRadius: 12,
    borderWidth: 1, borderColor: PALETTE.chipBorder,
  },
  durationChipActive: { backgroundColor: PALETTE.chipActiveBg, borderColor: PALETTE.secondary },
  durationText: { color: PALETTE.chipText, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  durationTextActive: { color: PALETTE.secondary },
  recordsRow: { flexDirection: 'row', width: '100%', marginTop: 22, justifyContent: 'space-around' },
  recordItem: { flex: 1, minWidth: 0, alignItems: 'center' },
  recordLabel: { color: PALETTE.chipText, fontSize: 9, fontWeight: '800', letterSpacing: 1, marginTop: 2 },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%', marginTop: 24, paddingVertical: 15,
    backgroundColor: PALETTE.success, borderRadius: 14,
  },
  startText: { color: '#ffffff', fontSize: 14, fontWeight: '900', letterSpacing: 1.5 },
  cancelBtn: { marginTop: 12, paddingVertical: 8 },
  cancelText: { color: PALETTE.chipText, fontSize: 12, fontWeight: '700' },
  recordValueSlot: { height: 26, justifyContent: 'center', alignItems: 'center' },
  recordValue: { color: PALETTE.accent, fontSize: 20, fontWeight: '900', fontVariant: ['tabular-nums'], position: 'absolute' },
});
