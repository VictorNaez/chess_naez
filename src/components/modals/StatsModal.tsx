import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
    ACTIVITY_DAYS,
    STATS_RANGE_OPTIONS,
    type StatsRange,
    type StatsSnapshot,
    type ThemeStat,
} from '../../lib/statsQueries';
import { PALETTE } from '../colors';
import {
    accuracyTint,
    ActivityBars,
    EmptyHint,
    MetricRow,
    pct,
    SectionTitle,
    SplitBar,
    StatCell,
} from '../stats/StatPrimitives';

interface StatsModalProps {
  visible: boolean;
  onClose: () => void;
  stats: StatsSnapshot;
  isLoading: boolean;
  range: StatsRange;
  onChangeRange: (range: StatsRange) => void;
  currentStreak: number;
}

// Por debajo de esto un porcentaje no dice nada: 1 de 1 no es "100% de acierto".
const MIN_THEME_ATTEMPTS = 5;

type ThemeSort = 'accuracy' | 'volume' | 'elo';

const SORT_OPTIONS: { key: ThemeSort; label: string }[] = [
  { key: 'accuracy', label: 'PRECISIÓN' },
  { key: 'volume',   label: 'INTENTOS'  },
  { key: 'elo',      label: 'ELO'       },
];

// Duraciones cortas: "7.4s", "43s", "2:05". formatDuration siempre imprime
// mm:ss y para tiempos de puzle resulta menos legible que los segundos sueltos.
const formatShort = (ms: number): string => {
  if (!ms || ms <= 0) return '—';
  const s = ms / 1000;
  if (s < 10) return `${s.toFixed(1)}s`;
  if (s < 60) return `${Math.round(s)}s`;
  const min = Math.floor(s / 60);
  const rest = Math.round(s % 60);
  return `${min}:${String(rest).padStart(2, '0')}`;
};

// Acumulados largos: "12m", "3h 14m"
const formatTotal = (ms: number): string => {
  if (!ms || ms <= 0) return '—';
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  return `${h}h ${totalMin % 60}m`;
};

const signed = (n: number): string => (n > 0 ? `+${n}` : String(n));

export const StatsModal = React.memo(({
  visible,
  onClose,
  stats,
  isLoading,
  range,
  onChangeRange,
  currentStreak,
}: StatsModalProps) => {
  const [themeSort, setThemeSort] = useState<ThemeSort>('accuracy');

  const sortedThemes = useMemo(() => {
    const list = [...stats.themes];
    switch (themeSort) {
      case 'volume': return list.sort((a, b) => b.attempts - a.attempts);
      case 'elo':    return list.sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0));
      default:       return list.sort((a, b) => b.accuracy - a.accuracy || b.attempts - a.attempts);
    }
  }, [stats.themes, themeSort]);

  // Fuerte y débil solo entre los temas con muestra suficiente.
  const { strongest, weakest } = useMemo(() => {
    const solid = stats.themes.filter(t => t.attempts >= MIN_THEME_ATTEMPTS);
    if (solid.length < 2) return { strongest: null as ThemeStat | null, weakest: null as ThemeStat | null };
    const byAccuracy = [...solid].sort((a, b) => b.accuracy - a.accuracy);
    return { strongest: byAccuracy[0], weakest: byAccuracy[byAccuracy.length - 1] };
  }, [stats.themes]);

  // El ancho de las barras de dificultad es relativo al bucket más lento.
  const slowestBucketMs = useMemo(
    () => Math.max(1, ...stats.buckets.map(b => b.avgSolveMs)),
    [stats.buckets]
  );

  const showModeSplit = stats.auto.attempts + stats.manual.attempts + stats.untracked.attempts > 0;
  const hasRuns = stats.clock.runs > 0 || stats.survival.runs > 0;
  const showEmpty = !isLoading && stats.attempts === 0;

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>

          {/* CABECERA */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.title}>ESTADÍSTICAS</Text>
              <Text style={styles.subtitle}>
                {stats.currentElo} ELO
                <Text style={styles.subtitleDim}>  ·  máx {stats.maxElo}</Text>
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>

          {/* RANGO TEMPORAL */}
          <View style={styles.rangeTabsRow}>
            {STATS_RANGE_OPTIONS.map(opt => {
              const isActive = range === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  activeOpacity={0.7}
                  onPress={() => onChangeRange(opt.key)}
                  style={[styles.rangeTab, isActive && styles.rangeTabActive]}
                >
                  <Text style={[styles.rangeTabText, isActive && styles.rangeTabTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {isLoading && stats.attempts === 0 ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color={PALETTE.primary} />
            </View>
          ) : showEmpty ? (
            <View style={styles.loadingBox}>
              <Ionicons name="bar-chart-outline" size={34} color={PALETTE.disabled} />
              <Text style={styles.emptyTitle}>
                {stats.hasData ? 'Sin actividad en este periodo' : 'Aún no hay datos'}
              </Text>
              <Text style={styles.emptySub}>
                {stats.hasData
                  ? 'Prueba con un rango más amplio.'
                  : 'Resuelve algunos puzles y aquí verás cómo evolucionas.'}
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* ============ RESUMEN ============ */}
              <View style={styles.heroBox}>
                <Text style={[styles.heroValue, { color: accuracyTint(stats.accuracy) }]}>
                  {pct(stats.accuracy)}
                </Text>
                <Text style={styles.heroLabel}>PRECISIÓN</Text>

                <View style={styles.heroBar}>
                  <SplitBar solved={stats.solved} failed={stats.failed} />
                </View>

                <View style={styles.heroLegend}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: PALETTE.success }]} />
                    <Text style={styles.legendText}>{stats.solved} resueltos</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: PALETTE.error }]} />
                    <Text style={styles.legendText}>{stats.failed} fallados</Text>
                  </View>
                </View>
              </View>

              <View style={styles.grid}>
                <StatCell label="INTENTOS" value={String(stats.attempts)} />
                <StatCell
                  label="ELO EN EL PERIODO"
                  value={signed(stats.eloGain)}
                  tint={stats.eloGain >= 0 ? PALETTE.success : PALETTE.error}
                />
                <StatCell label="TIEMPO TOTAL" value={formatTotal(stats.totalTimeMs)} />
                <StatCell label="RACHA ACTUAL" value={String(currentStreak)} />
                <StatCell label="MEJOR RACHA" value={String(stats.bestStreak)} />
                <StatCell label="ELO MÁXIMO" value={String(stats.maxElo)} />
              </View>

              {/* ============ MODO DE SELECCIÓN DE ELO ============ */}
              {showModeSplit && (
                <>
                  <SectionTitle icon="options-outline" title="SELECCIÓN DE PUZLES" />

                  <MetricRow
                    label="ELO automático"
                    ratio={stats.auto.accuracy}
                    tint={accuracyTint(stats.auto.accuracy)}
                    value={stats.auto.attempts > 0 ? pct(stats.auto.accuracy) : '—'}
                    note={`${stats.auto.solved}/${stats.auto.attempts}`}
                    faded={stats.auto.attempts === 0}
                  />
                  <MetricRow
                    label="Rango manual"
                    ratio={stats.manual.accuracy}
                    tint={accuracyTint(stats.manual.accuracy)}
                    value={stats.manual.attempts > 0 ? pct(stats.manual.accuracy) : '—'}
                    note={`${stats.manual.solved}/${stats.manual.attempts}`}
                    faded={stats.manual.attempts === 0}
                  />
                  {stats.untracked.attempts > 0 && (
                    <MetricRow
                      label="Sin registrar"
                      ratio={stats.untracked.accuracy}
                      tint={PALETTE.chipText}
                      value={pct(stats.untracked.accuracy)}
                      note={`${stats.untracked.solved}/${stats.untracked.attempts}`}
                      faded
                    />
                  )}
                  {stats.untracked.attempts > 0 && (
                    <Text style={styles.footnote}>
                      Los intentos anteriores a esta versión no guardaban con qué modo se jugaron.
                    </Text>
                  )}
                </>
              )}

              {/* ============ PARTIDAS ============ */}
              {hasRuns && (
                <>
                  <SectionTitle icon="trophy-outline" title="PARTIDAS" hint="No afectan al ELO" />
                  <View style={styles.grid}>
                    <StatCell label="CONTRARRELOJ" value={String(stats.clock.runs)} />
                    <StatCell label="RÉCORD C.RELOJ" value={String(stats.clock.bestSolved)} />
                    <StatCell label="RESUELTOS" value={String(stats.clock.totalSolved)} />
                    <StatCell label="SUPERVIVENCIA" value={String(stats.survival.runs)} />
                    <StatCell label="RÉCORD SUPERV." value={String(stats.survival.bestSolved)} />
                    <StatCell label="RESUELTOS" value={String(stats.survival.totalSolved)} />
                  </View>
                </>
              )}

              {/* ============ TIEMPO ============ */}
              <SectionTitle icon="time-outline" title="TIEMPO DE RESOLUCIÓN" />
              <View style={styles.grid}>
                <StatCell label="MEDIANA (ACIERTOS)" value={formatShort(stats.medianSolveMs)} />
                <StatCell label="MEDIA EN ACIERTOS" value={formatShort(stats.avgSolveMsSuccess)} />
                <StatCell label="MEDIA EN FALLOS" value={formatShort(stats.avgSolveMsFail)} />
                <StatCell label="MÁS RÁPIDO" value={formatShort(stats.fastestSolveMs)} />
                <StatCell
                  label="PUZLE MÁS DIFÍCIL"
                  value={stats.hardestSolvedElo > 0 ? String(stats.hardestSolvedElo) : '—'}
                />
                <StatCell
                  label="ELO MEDIO RESUELTO"
                  value={stats.avgSolvedElo > 0 ? String(stats.avgSolvedElo) : '—'}
                />
              </View>

              {/* ============ TIEMPO / DIFICULTAD ============ */}
              <SectionTitle
                icon="speedometer-outline"
                title="POR DIFICULTAD"
                hint="barra = tiempo medio"
              />
              {stats.buckets.length === 0 ? (
                <EmptyHint text="Necesitas más intentos para desglosar por dificultad." />
              ) : (
                stats.buckets.map(b => (
                  <MetricRow
                    key={b.from}
                    label={`${b.from}–${b.to}`}
                    ratio={b.avgSolveMs / slowestBucketMs}
                    tint={accuracyTint(b.accuracy)}
                    value={formatShort(b.avgSolveMs)}
                    note={`${pct(b.accuracy)} · ${b.attempts}`}
                  />
                ))
              )}

              {/* ============ TEMAS ============ */}
              <SectionTitle icon="pricetags-outline" title="POR TEMA TÁCTICO" />

              {(strongest || weakest) && (
                <View style={styles.insightBox}>
                  {strongest && (
                    <Text style={styles.insightText}>
                      <Text style={{ color: PALETTE.success }}>▲ </Text>
                      Mejor tema: <Text style={styles.insightStrong}>{strongest.name}</Text> ({pct(strongest.accuracy)})
                    </Text>
                  )}
                  {weakest && (
                    <Text style={styles.insightText}>
                      <Text style={{ color: PALETTE.error }}>▼ </Text>
                      A entrenar: <Text style={styles.insightStrong}>{weakest.name}</Text> ({pct(weakest.accuracy)})
                    </Text>
                  )}
                </View>
              )}

              <View style={styles.sortRow}>
                {SORT_OPTIONS.map(opt => {
                  const isActive = themeSort === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      activeOpacity={0.7}
                      onPress={() => setThemeSort(opt.key)}
                      style={[styles.sortChip, isActive && styles.sortChipActive]}
                    >
                      <Text style={[styles.sortChipText, isActive && styles.sortChipTextActive]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {sortedThemes.length === 0 ? (
                <EmptyHint text="Todavía no has jugado ningún tema en este periodo." />
              ) : (
                sortedThemes.map(t => (
                  <MetricRow
                    key={t.id}
                    label={t.name}
                    ratio={t.accuracy}
                    tint={accuracyTint(t.accuracy)}
                    value={pct(t.accuracy)}
                    note={t.elo ? `${t.solved}/${t.attempts} · ${t.elo}` : `${t.solved}/${t.attempts}`}
                    faded={t.attempts < MIN_THEME_ATTEMPTS}
                  />
                ))
              )}
              <Text style={styles.footnote}>
                Los temas atenuados tienen menos de {MIN_THEME_ATTEMPTS} intentos: el porcentaje aún no es fiable.
                Un puzle suma a todos sus temas, por eso la suma supera al total de intentos.
              </Text>

              {/* ============ ACTIVIDAD ============ */}
              <SectionTitle
                icon="calendar-outline"
                title="ACTIVIDAD"
                hint={`últimos ${ACTIVITY_DAYS} días`}
              />
              <ActivityBars days={stats.days} />
              <View style={styles.grid}>
                <StatCell label="DÍAS ACTIVOS" value={`${stats.activeDays}/${ACTIVITY_DAYS}`} />
                <StatCell label="RACHA DE DÍAS" value={String(stats.dayStreak)} />
                <StatCell
                  label="MEJOR DÍA"
                  value={stats.bestDay ? String(stats.bestDay.attempts) : '—'}
                />
              </View>

              <View style={styles.bottomSpacer} />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  card: {
    width: '95%', height: '90%', backgroundColor: '#141414', borderRadius: 24,
    paddingHorizontal: 18, paddingTop: 20, paddingBottom: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 10,
    elevation: 20,
  },

  header: { flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 16 },
  headerLeft: { flex: 1, minWidth: 0 },
  title: { color: PALETTE.primary, fontSize: 18, fontWeight: '900', letterSpacing: 1.5 },
  subtitle: { color: PALETTE.secondary, fontSize: 13, fontWeight: '800', marginTop: 4 },
  subtitleDim: { color: PALETTE.chipText, fontSize: 11, fontWeight: '700' },
  closeBtn: { backgroundColor: 'rgba(255,255,255,0.05)', padding: 6, borderRadius: 50 },

  rangeTabsRow: { flexDirection: 'row', width: '100%', gap: 6, marginBottom: 4 },
  rangeTab: {
    flex: 1, minWidth: 0, paddingVertical: 7, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  rangeTabActive: { backgroundColor: PALETTE.tagBg, borderColor: PALETTE.primary },
  rangeTabText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, color: PALETTE.secondary },
  rangeTabTextActive: { color: PALETTE.primary },

  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 20 },
  emptyTitle: { color: PALETTE.accent, fontSize: 14, fontWeight: '800' },
  emptySub: { color: PALETTE.chipText, fontSize: 12, textAlign: 'center', lineHeight: 18 },

  scroll: { width: '100%', flex: 1 },
  scrollContent: { paddingTop: 14 },

  heroBox: {
    width: '100%', alignItems: 'center', backgroundColor: 'rgba(26,26,26,0.6)',
    borderRadius: 16, paddingVertical: 18, paddingHorizontal: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  heroValue: { fontSize: 46, fontWeight: '900', lineHeight: 52, fontVariant: ['tabular-nums'] },
  heroLabel: { color: PALETTE.chipText, fontSize: 10, fontWeight: '900', letterSpacing: 2, marginTop: -2 },
  heroBar: { width: '100%', marginTop: 16 },
  heroLegend: { flexDirection: 'row', gap: 18, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: PALETTE.accent, fontSize: 11, fontWeight: '700' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', width: '100%', marginTop: 6 },

  insightBox: {
    width: '100%', gap: 6, backgroundColor: PALETTE.chipBg, borderRadius: 12,
    borderWidth: 1, borderColor: PALETTE.chipBorder, paddingVertical: 10, paddingHorizontal: 12,
    marginBottom: 10,
  },
  insightText: { color: PALETTE.chipText, fontSize: 11, fontWeight: '600' },
  insightStrong: { color: PALETTE.accent, fontWeight: '800' },

  sortRow: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  sortChip: {
    paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  sortChipActive: { backgroundColor: PALETTE.tagBg, borderColor: PALETTE.primary },
  sortChipText: { color: PALETTE.chipText, fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  sortChipTextActive: { color: PALETTE.primary },

  footnote: { color: PALETTE.chipText, fontSize: 9, lineHeight: 14, marginTop: 8, opacity: 0.8 },
  bottomSpacer: { height: 20 },
});
