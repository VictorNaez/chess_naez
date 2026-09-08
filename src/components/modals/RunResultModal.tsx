import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useT } from '../../i18n/I18nProvider';
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
  // Cerrar != salir: el modal se esconde pero la partida terminada sigue en
  // pantalla, con su rejilla de puzles lista para repasarlos uno a uno.
  onClose: () => void;
}

// A nivel de módulo: definirlo dentro del render lo remontaría en cada pasada.
const StatCell = React.memo(({ label, value }: { label: string; value: string }) => (
  <View style={styles.statCell}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
));

export const RunResultModal = React.memo(({
  visible, kind, summary, ranking, onPlayAgain, onExit, onClose,
}: RunResultModalProps) => {
  const t = useT();
  if (!summary) return null;

  const isSurvival = kind === 'survival';
  const accuracyPct = Math.round(summary.accuracy * 100);
  const isRecord = ranking?.isPersonalBest ?? false;
  const survivedMs = Math.max(0, summary.endedAt - summary.startedAt);

  // El botón atrás de Android esconde el resumen; no abandona la partida.
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.card}>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={22} color={PALETTE.chipText} />
          </TouchableOpacity>

          {/* La tarjeta creció con el bloque de repaso: en pantallas cortas el
              contenido tiene que poder desplazarse en vez de salirse. */}
          <ScrollView
            style={{ width: '100%' }}
            contentContainerStyle={styles.cardScroll}
            showsVerticalScrollIndicator={false}
          >

          {isRecord && (
            <View style={styles.recordBanner}>
              <Ionicons name="trophy" size={14} color="#ffffff" />
              <Text style={styles.recordBannerText}>{t.run.newRecord}</Text>
            </View>
          )}

          <Text style={styles.title}>
            {isSurvival ? 'TE QUEDASTE SIN VIDAS' : 'SE ACABÓ EL TIEMPO'}
          </Text>

          <Text style={styles.bigNumber}>{summary.solved}</Text>
          <Text style={styles.bigLabel}>{t.stats.puzzlesSolved}</Text>

          <View style={styles.statsGrid}>
            <StatCell label={t.stats.accuracy} value={`${accuracyPct}%`} />
            <StatCell label={t.stats.attempts} value={String(summary.attempts)} />
            <StatCell label={t.stats.eloAvg} value={summary.avgSolvedRating > 0 ? String(summary.avgSolvedRating) : '—'} />
            <StatCell label={t.stats.eloMax} value={summary.maxSolvedRating > 0 ? String(summary.maxSolvedRating) : '—'} />
            <StatCell label={t.run.avgTime} value={summary.avgSolveMs > 0 ? formatDuration(summary.avgSolveMs) : '—'} />
            {/* En supervivencia los fallos siempre son 3 (las vidas): lo que
                de verdad informa es cuánto aguantaste. */}
            {isSurvival
              ? <StatCell label={t.run.survived} value={formatDuration(survivedMs)} />
              : <StatCell label={t.stats.failed} value={String(summary.failed)} />}
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
                <Text style={styles.rankBadge}>{t.run.bestOfWeek}</Text>
              )}
            </View>
          )}

          <TouchableOpacity style={styles.primaryBtn} onPress={onPlayAgain}>
            <Ionicons name="refresh" size={18} color="#ffffff" />
            <Text style={styles.primaryText}>{t.run.playAgain}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.reviewBtn} onPress={onClose}>
            <Ionicons name="search-outline" size={15} color={PALETTE.primary} />
            <Text style={styles.reviewText}>{t.repaso.review}</Text>
          </TouchableOpacity>
          {/* 
          <Text style={styles.reviewHint}>
            Toca cualquier cuadrado del marcador para volver a jugar ese puzle.
          </Text>
          */}
          <TouchableOpacity style={styles.secondaryBtn} onPress={onExit}>
            <Text style={styles.secondaryText}>{t.common.backToPuzzles}</Text>
          </TouchableOpacity>

          </ScrollView>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: {
    width: '100%', maxWidth: 420, maxHeight: '90%', alignItems: 'center',
    backgroundColor: PALETTE.surfaceDark, borderRadius: 20,
    borderWidth: 1, borderColor: PALETTE.surfaceLight, padding: 22,
  },
  cardScroll: { alignItems: 'center', paddingBottom: 2 },
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
  closeBtn: { position: 'absolute', top: 10, right: 10, width: 34, height: 34, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  reviewBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%', marginTop: 10, paddingVertical: 13,
    backgroundColor: PALETTE.chipBg, borderRadius: 14,
    borderWidth: 1, borderColor: PALETTE.chipBorder,
  },
  reviewText: { color: PALETTE.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  reviewHint: { color: PALETTE.chipText, fontSize: 10, textAlign: 'center', marginTop: 8, paddingHorizontal: 10, lineHeight: 14 },
  secondaryBtn: { marginTop: 12, paddingVertical: 8 },
  secondaryText: { color: PALETTE.chipText, fontSize: 12, fontWeight: '700' },
});
