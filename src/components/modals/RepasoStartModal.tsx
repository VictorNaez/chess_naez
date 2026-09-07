import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { hapticImpact } from '../../lib/haptics';
import { DEFAULT_REPASO_ORDER, REPASO_ORDERS, formatRelativeDays } from '../../lib/repaso';
import type { RepasoOrder, RepasoStats } from '../../types/repaso';
import { PALETTE } from '../colors';
import { useT } from '../../i18n/I18nProvider';

interface RepasoStartModalProps {
  visible: boolean;
  stats: RepasoStats;
  isPreparing: boolean;
  onClose: () => void;
  onStart: (order: RepasoOrder) => void;
}

// A nivel de módulo: definidos dentro del render, React los remontaría en cada
// pasada y el FadeIn se dispararía sin motivo. Mismo criterio que RunStartModal.
const EloCell = React.memo(({ label, value }: { label: string; value: number }) => (
  <View style={styles.eloCell}>
    <View style={styles.eloValueSlot}>
      <Animated.Text
        key={value}
        entering={FadeIn.duration(260)}
        exiting={FadeOut.duration(220)}
        style={styles.eloValue}
      >
        {value > 0 ? value : '—'}
      </Animated.Text>
    </View>
    <Text style={styles.eloLabel}>{label}</Text>
  </View>
));

const ReasonChip = React.memo(({ icon, count, label, tint }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  count: number;
  label: string;
  tint: string;
}) => {
  if (count === 0) return null;
  return (
    <View style={styles.reasonChip}>
      <Ionicons name={icon} size={11} color={tint} />
      <Text style={styles.reasonCount}>{count}</Text>
      <Text style={styles.reasonLabel}>{label}</Text>
    </View>
  );
});

export const RepasoStartModal = React.memo(({
  visible, stats, isPreparing, onClose, onStart,
}: RepasoStartModalProps) => {
  const t = useT();
  const [order, setOrder] = useState<RepasoOrder>(DEFAULT_REPASO_ORDER);
  const isEmpty = stats.count === 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={styles.card}>
          <Ionicons name="repeat" size={34} color={PALETTE.secondary} />
          <Text style={styles.title}>{t.repaso.title}</Text>
          <Text style={styles.subtitle}>
            {isEmpty
              ? 'Aquí se guardan solos los puzles que falles o en los que pidas ayuda. Todavía no hay ninguno.'
              : 'Los puzles que fallaste o resolviste con ayuda. Si lo aciertas sale de la lista; si no, se queda.'}
          </Text>

          <Text style={styles.bigNumber}>{stats.count}</Text>
          <Text style={styles.bigLabel}>
            {stats.count === 1 ? 'PUZLE PENDIENTE' : 'PUZLES PENDIENTES'}
          </Text>

          {!isEmpty && (
            <>
              <View style={styles.eloRow}>
                <EloCell label={t.stats.eloMin} value={stats.minRating} />
                <EloCell label={t.stats.eloAvg} value={stats.avgRating} />
                <EloCell label={t.stats.eloMax} value={stats.maxRating} />
              </View>

              <View style={styles.reasonRow}>
                <ReasonChip icon="close-circle-outline" count={stats.byReason.fail} label={t.repaso.failed} tint={PALETTE.error} />
                <ReasonChip icon="eye-outline" count={stats.byReason.solution} label={t.repaso.reasonSolution} tint={PALETTE.warning} />
                <ReasonChip icon="bulb-outline" count={stats.byReason.hint} label={t.repaso.reasonHint} tint={PALETTE.primary} />
              </View>

              <Text style={styles.oldestText}>
                El más antiguo entró {formatRelativeDays(stats.oldestAt)}
              </Text>

              <Text style={styles.optionsLabel}>{t.repaso.order}</Text>
              <View style={styles.orderRow}>
                {REPASO_ORDERS.map(o => (
                  <TouchableOpacity
                    key={o.id}
                    style={[styles.orderChip, order === o.id && styles.orderChipActive]}
                    onPress={() => { hapticImpact('light'); setOrder(o.id); }}
                  >
                    <Text style={[styles.orderText, order === o.id && styles.orderTextActive]}>
                      {o.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <TouchableOpacity
            style={[styles.startBtn, (isEmpty || isPreparing) && styles.startBtnDisabled]}
            disabled={isEmpty || isPreparing}
            onPress={() => { hapticImpact('medium'); onStart(order); }}
          >
            <Ionicons name="play" size={20} color="#ffffff" />
            <Text style={styles.startText}>{isPreparing ? 'CARGANDO…' : 'EMPEZAR'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>{t.common.back}</Text>
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

  bigNumber: { color: PALETTE.accent, fontSize: 58, fontWeight: '900', lineHeight: 66, fontVariant: ['tabular-nums'], marginTop: 14 },
  bigLabel: { color: PALETTE.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginTop: -4 },

  eloRow: { flexDirection: 'row', width: '100%', marginTop: 20 },
  eloCell: { flex: 1, minWidth: 0, alignItems: 'center' },
  eloValueSlot: { height: 26, justifyContent: 'center', alignItems: 'center' },
  eloValue: { color: PALETTE.accent, fontSize: 20, fontWeight: '900', fontVariant: ['tabular-nums'], position: 'absolute' },
  eloLabel: { color: PALETTE.chipText, fontSize: 9, fontWeight: '800', letterSpacing: 1, marginTop: 2 },

  reasonRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 16 },
  reasonChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: PALETTE.chipBg, borderRadius: 8,
    borderWidth: 1, borderColor: PALETTE.chipBorder,
    paddingVertical: 4, paddingHorizontal: 8,
  },
  reasonCount: { color: PALETTE.accent, fontSize: 11, fontWeight: '900', fontVariant: ['tabular-nums'] },
  reasonLabel: { color: PALETTE.chipText, fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },

  oldestText: { color: PALETTE.chipText, fontSize: 10, marginTop: 12 },

  optionsLabel: { color: PALETTE.chipText, fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginTop: 20, marginBottom: 8 },
  orderRow: { flexDirection: 'row', gap: 8, width: '100%' },
  orderChip: {
    flex: 1, minWidth: 0, paddingVertical: 12, alignItems: 'center',
    backgroundColor: PALETTE.chipBg, borderRadius: 12,
    borderWidth: 1, borderColor: PALETTE.chipBorder,
  },
  orderChipActive: { backgroundColor: PALETTE.chipActiveBg, borderColor: PALETTE.secondary },
  orderText: { color: PALETTE.chipText, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  orderTextActive: { color: PALETTE.secondary },

  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%', marginTop: 24, paddingVertical: 15,
    backgroundColor: PALETTE.success, borderRadius: 14,
  },
  startBtnDisabled: { backgroundColor: PALETTE.disabled, opacity: 0.6 },
  startText: { color: '#ffffff', fontSize: 14, fontWeight: '900', letterSpacing: 1.5 },
  cancelBtn: { marginTop: 12, paddingVertical: 8 },
  cancelText: { color: PALETTE.chipText, fontSize: 12, fontWeight: '700' },
});
