import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { formatDuration } from '../../lib/time';
import type { RepasoSummary } from '../../types/repaso';
import { PALETTE } from '../colors';

interface RepasoResultModalProps {
  visible: boolean;
  summary: RepasoSummary | null;
  // Cuántos siguen en la cola después de la sesión. Viene de `repaso.stats`,
  // no del resumen, para que sea siempre el dato real de la BD.
  remaining: number;
  onReviewAgain: () => void;
  onExit: () => void;
}

const StatCell = React.memo(({ label, value, tint }: { label: string; value: string; tint?: string }) => (
  <View style={styles.statCell}>
    <Text style={[styles.statValue, !!tint && { color: tint }]}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
));

export const RepasoResultModal = React.memo(({
  visible, summary, remaining, onReviewAgain, onExit,
}: RepasoResultModalProps) => {
  if (!summary) return null;

  const elapsedMs = Math.max(0, summary.endedAt - summary.startedAt);
  const isClean = remaining === 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onExit}>
      <View style={styles.root}>
        <View style={styles.card}>

          {isClean && (
            <View style={styles.cleanBanner}>
              <Ionicons name="checkmark-done" size={14} color="#ffffff" />
              <Text style={styles.cleanBannerText}>COLA VACÍA</Text>
            </View>
          )}

          <Text style={styles.title}>REPASO TERMINADO</Text>

          <Text style={styles.bigNumber}>{summary.solved}</Text>
          <Text style={styles.bigLabel}>
            {summary.solved === 1 ? 'PUZLE SUPERADO' : 'PUZLES SUPERADOS'}
          </Text>

          <View style={styles.statsGrid}>
            <StatCell label="REPASADOS" value={String(summary.reviewed)} />
            <StatCell label="FALLADOS" value={String(summary.failed)} tint={summary.failed > 0 ? PALETTE.error : undefined} />
            <StatCell label="SALTADOS" value={String(summary.skipped)} />
            <StatCell label="TIEMPO" value={formatDuration(elapsedMs)} />
            <StatCell label="QUEDAN" value={String(remaining)} />
            <StatCell
              label="PRECISIÓN"
              value={summary.reviewed > 0 ? `${Math.round((summary.solved / summary.reviewed) * 100)}%` : '—'}
            />
          </View>

          <Text style={styles.footNote}>
            {isClean
              ? 'No te queda nada pendiente. Los próximos fallos volverán a llenar la cola.'
              : `Los que fallaste siguen ahí y saldrán los últimos la próxima vez.`}
          </Text>

          {!isClean && (
            <TouchableOpacity style={styles.primaryBtn} onPress={onReviewAgain}>
              <Ionicons name="repeat" size={18} color="#ffffff" />
              <Text style={styles.primaryText}>SEGUIR REPASANDO</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.secondaryBtn, isClean && styles.primaryBtn]}
            onPress={onExit}
          >
            {isClean
              ? <Text style={styles.primaryText}>VOLVER A PUZLES</Text>
              : <Text style={styles.secondaryText}>Volver a puzles</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: {
    width: '100%', maxWidth: 420, alignItems: 'center',
    backgroundColor: PALETTE.surfaceDark, borderRadius: 20,
    borderWidth: 1, borderColor: PALETTE.surfaceLight, padding: 22,
  },
  cleanBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: PALETTE.success, paddingVertical: 5, paddingHorizontal: 12,
    borderRadius: 20, marginBottom: 12,
  },
  cleanBannerText: { color: '#ffffff', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: PALETTE.chipText, fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  bigNumber: { color: PALETTE.accent, fontSize: 64, fontWeight: '900', lineHeight: 70, fontVariant: ['tabular-nums'] },
  bigLabel: { color: PALETTE.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginTop: -4 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', width: '100%', marginTop: 20 },
  statCell: { width: '33.33%', alignItems: 'center', paddingVertical: 10 },
  statValue: { color: PALETTE.accent, fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statLabel: { color: PALETTE.chipText, fontSize: 8, fontWeight: '800', letterSpacing: 1, marginTop: 3 },
  footNote: { color: PALETTE.chipText, fontSize: 11, textAlign: 'center', lineHeight: 16, marginTop: 10, paddingHorizontal: 8 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%', marginTop: 18, paddingVertical: 15,
    backgroundColor: PALETTE.secondary, borderRadius: 14,
  },
  primaryText: { color: '#ffffff', fontSize: 13, fontWeight: '900', letterSpacing: 1.5 },
  secondaryBtn: { marginTop: 12, paddingVertical: 8 },
  secondaryText: { color: PALETTE.chipText, fontSize: 12, fontWeight: '700' },
});
