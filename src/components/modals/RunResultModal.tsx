import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { formatDuration } from '../../lib/time';
import type { RunKind, RunRanking, RunSummary } from '../../types/run';
import { PALETTE } from '../colors';

interface RunResultModalProps {
  visible: boolean;
  kind: RunKind;
  summary: RunSummary | null;
  ranking: RunRanking | null;
  onPlayAgain: () => void;
  onExit: () => void;
}

// A nivel de módulo: definirlo dentro del render lo remontaría en cada pasada.
const StatCell = React.memo(({ label, value }: { label: string; value: string }) => (
  <View style={styles.statCell}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
));

export const RunResultModal = React.memo(({
  visible, kind, summary, ranking, onPlayAgain, onExit,
}: RunResultModalProps) => {
  if (!summary) return null;

  const isSurvival = kind === 'survival';
  const accuracyPct = Math.round(summary.accuracy * 100);
  const isRecord = ranking?.isPersonalBest ?? false;
  const survivedMs = Math.max(0, summary.endedAt - summary.startedAt);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onExit}>
      <View style={styles.root}>
        <View style={styles.card}>

          {isRecord && (
            <View style={styles.recordBanner}>
              <Ionicons name="trophy" size={14} color="#ffffff" />
              <Text style={styles.recordBannerText}>NUEVO RÉCORD</Text>
            </View>
          )}

          <Text style={styles.title}>
            {isSurvival ? 'TE QUEDASTE SIN VIDAS' : 'SE ACABÓ EL TIEMPO'}
          </Text>

          <Text style={styles.bigNumber}>{summary.solved}</Text>
          <Text style={styles.bigLabel}>PUZLES RESUELTOS</Text>

          <View style={styles.statsGrid}>
            <StatCell label="PRECISIÓN" value={`${accuracyPct}%`} />
            <StatCell label="INTENTOS" value={String(summary.attempts)} />
            <StatCell label="ELO MEDIO" value={summary.avgSolvedRating > 0 ? String(summary.avgSolvedRating) : '—'} />
            <StatCell label="ELO MÁX" value={summary.maxSolvedRating > 0 ? String(summary.maxSolvedRating) : '—'} />
            <StatCell label="T. MEDIO" value={summary.avgSolveMs > 0 ? formatDuration(summary.avgSolveMs) : '—'} />
            {/* En supervivencia los fallos siempre son 3 (las vidas): lo que
                de verdad informa es cuánto aguantaste. */}
            {isSurvival
              ? <StatCell label="AGUANTASTE" value={formatDuration(survivedMs)} />
              : <StatCell label="FALLOS" value={String(summary.failed)} />}
          </View>

          {ranking && (
            <View style={styles.rankBox}>
              <View style={styles.rankRow}>
                <Ionicons name="podium-outline" size={16} color={PALETTE.secondary} />
                <Text style={styles.rankMain}>
                  Puntuación {ranking.rank} de {ranking.total}
                </Text>
              </View>
              <Text style={styles.rankSub}>
                Mejor de esta semana: {ranking.bestSolvedThisWeek}   ·   Récord: {ranking.bestSolvedAllTime}
              </Text>
              {ranking.isWeekBest && !ranking.isPersonalBest && (
                <Text style={styles.rankBadge}>MEJOR DE LA SEMANA</Text>
              )}
            </View>
          )}

          <TouchableOpacity style={styles.primaryBtn} onPress={onPlayAgain}>
            <Ionicons name="refresh" size={18} color="#ffffff" />
            <Text style={styles.primaryText}>JUGAR OTRA VEZ</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={onExit}>
            <Text style={styles.secondaryText}>Volver a puzles</Text>
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
  recordBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: PALETTE.warning, paddingVertical: 5, paddingHorizontal: 12,
    borderRadius: 20, marginBottom: 12,
  },
  recordBannerText: { color: '#ffffff', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: PALETTE.chipText, fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  bigNumber: { color: PALETTE.accent, fontSize: 64, fontWeight: '900', lineHeight: 70, fontVariant: ['tabular-nums'] },
  bigLabel: { color: PALETTE.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginTop: -4 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', width: '100%', marginTop: 20 },
  statCell: { width: '33.33%', alignItems: 'center', paddingVertical: 10 },
  statValue: { color: PALETTE.accent, fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statLabel: { color: PALETTE.chipText, fontSize: 8, fontWeight: '800', letterSpacing: 1, marginTop: 3 },
  rankBox: {
    width: '100%', marginTop: 12, padding: 14, alignItems: 'center',
    backgroundColor: PALETTE.chipBg, borderRadius: 14,
    borderWidth: 1, borderColor: PALETTE.chipBorder,
  },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rankMain: { color: PALETTE.accent, fontSize: 15, fontWeight: '800' },
  rankSub: { color: PALETTE.chipText, fontSize: 11, marginTop: 6 },
  rankBadge: { color: PALETTE.secondary, fontSize: 9, fontWeight: '900', letterSpacing: 1, marginTop: 8 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%', marginTop: 20, paddingVertical: 15,
    backgroundColor: PALETTE.secondary, borderRadius: 14,
  },
  primaryText: { color: '#ffffff', fontSize: 13, fontWeight: '900', letterSpacing: 1.5 },
  secondaryBtn: { marginTop: 12, paddingVertical: 8 },
  secondaryText: { color: PALETTE.chipText, fontSize: 12, fontWeight: '700' },
});
