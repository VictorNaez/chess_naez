import { Ionicons } from '@expo/vector-icons';
import * as SQLite from 'expo-sqlite';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { getClockRecords } from '../../data/clockRuns';
import { CLOCK_DURATIONS, DEFAULT_CLOCK_DURATION_MS } from '../../lib/clock';
import { hapticImpact } from '../../lib/haptics';
import type { ClockRecords } from '../../types/clock';
import { PALETTE } from '../colors';

interface ClockStartModalProps {
  visible: boolean;
  db: SQLite.SQLiteDatabase | null;
  onClose: () => void;
  onStart: (durationMs: number) => void;
}

const EMPTY: ClockRecords = { bestAllTime: 0, bestThisWeek: 0, total: 0 };

export const ClockStartModal = React.memo(({ visible, db, onClose, onStart }: ClockStartModalProps) => {
  const [selected, setSelected] = useState<number>(DEFAULT_CLOCK_DURATION_MS);
  const [records, setRecords] = useState<ClockRecords>(EMPTY);

  // Los récords son por duración: 8 puzles en 1 min no compiten con 8 en 5 min.
  useEffect(() => {
    if (!visible || !db) return;
    let cancelled = false;

    (async () => {
      try {
        const r = await getClockRecords(db, selected);
        if (!cancelled) setRecords(r);
      } catch (e) {
        console.error('Error leyendo récords de contrarreloj:', e);
      }
    })();

    return () => { cancelled = true; };
  }, [visible, db, selected]);

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

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={styles.card}>
          <Ionicons name="timer-outline" size={34} color={PALETTE.secondary} />
          <Text style={styles.title}>CONTRARRELOJ</Text>
          <Text style={styles.subtitle}>
            Empiezas fácil. Cada acierto sube el nivel. Un fallo no te baja, pero te cuesta tiempo.
          </Text>

          <View style={styles.durationRow}>
            {CLOCK_DURATIONS.map(d => (
              <TouchableOpacity
                key={d.id}
                style={[styles.durationChip, selected === d.ms && styles.durationChipActive]}
                onPress={() => { hapticImpact('light'); setSelected(d.ms); }}
              >
                <Text style={[styles.durationText, selected === d.ms && styles.durationTextActive]}>
                  {d.label}
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
  durationRow: { flexDirection: 'row', gap: 8, marginTop: 22, width: '100%' },
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