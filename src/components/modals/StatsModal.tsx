import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CLOCK_DURATIONS } from '../../lib/clock';
import {
  ACTIVITY_DAYS,
  STATS_RANGE_OPTIONS,
  type RunModeStat,
  type StatsRange,
  type StatsSnapshot,
  type ThemeStat,
} from '../../lib/statsQueries';
import { SURVIVAL_SPEEDS } from '../../lib/survival';
import { PALETTE } from '../colors';
import { useT } from '../../i18n/I18nProvider';
import { themeName } from '../chess_themes';
import {
  accuracyTint,
  ActivityBars,
  EmptyHint,
  MetricRow,
  pct,
  RunTable,
  SectionTitle,
  SplitBar,
  StatCell,
  type RunTableRow,
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

// Puzles por hora de juego efectivo. Solo cuentan los intentos con tiempo
// creíble, que son los mismos que suman en totalTimeMs.
const formatPace = (timedAttempts: number, totalMs: number): string => {
  if (timedAttempts <= 0 || totalMs <= 0) return '—';
  const perHour = timedAttempts / (totalMs / 3_600_000);
  return perHour >= 100 ? String(Math.round(perHour)) : perHour.toFixed(1);
};

// Una fila por cubo de tiempo, en el orden en que aparecen en el menú de
// inicio, jugados o no. Las partidas con una duración que ya no está en la
// lista (por si algún día cambian los presets) se agrupan al final en vez de
// desaparecer del panel.
const buildRunRows = (
  stat: RunModeStat,
  presets: readonly { label: string; ms: number }[],
): RunTableRow[] => {
  const rows: RunTableRow[] = presets.map(p => {
    const found = stat.byDuration.find(d => d.durationMs === p.ms);
    return {
      label: p.label,
      runs: found?.runs ?? 0,
      bestSolved: found?.bestSolved ?? 0,
      totalSolved: found?.totalSolved ?? 0,
    };
  });

  const known = new Set(presets.map(p => p.ms));
  const others = stat.byDuration.filter(d => !known.has(d.durationMs));
  if (others.length > 0) {
    rows.push({
      label: 'OTROS',
      runs: others.reduce((n, d) => n + d.runs, 0),
      bestSolved: others.reduce((n, d) => Math.max(n, d.bestSolved), 0),
      totalSolved: others.reduce((n, d) => n + d.totalSolved, 0),
    });
  }

  return rows;
};

export const StatsModal = React.memo(({
  visible,
  onClose,
  stats,
  isLoading,
  range,
  onChangeRange,
  currentStreak,
}: StatsModalProps) => {
  const t = useT();
  const [themeSort, setThemeSort] = useState<ThemeSort>('accuracy');

  const sortedThemes = useMemo(() => {
    const key = (t: ThemeStat): number => {
      switch (themeSort) {
        case 'volume': return t.attempts;
        case 'elo':    return t.elo ?? 0;
        default:       return t.accuracy;
      }
    };

    // Siempre de mayor a menor, pero los temas con muy poca muestra bajan al
    // final: un 100% de 1/1 no debería encabezar la lista por delante de un
    // 78% de cuarenta intentos.
    return [...stats.themes].sort((a, b) => {
      const aSolid = a.attempts >= MIN_THEME_ATTEMPTS ? 1 : 0;
      const bSolid = b.attempts >= MIN_THEME_ATTEMPTS ? 1 : 0;
      if (aSolid !== bSolid) return bSolid - aSolid;
      return key(b) - key(a) || b.attempts - a.attempts;
    });
  }, [stats.themes, themeSort]);

  // Fuerte y débil solo entre los temas con muestra suficiente.
  const { strongest, weakest } = useMemo(() => {
    const solid = stats.themes.filter(t => t.attempts >= MIN_THEME_ATTEMPTS);
    if (solid.length < 2) return { strongest: null as ThemeStat | null, weakest: null as ThemeStat | null };
    const byAccuracy = [...solid].sort((a, b) => b.accuracy - a.accuracy);
    return { strongest: byAccuracy[0], weakest: byAccuracy[byAccuracy.length - 1] };
  }, [stats.themes]);

  const clockRows = useMemo(() => buildRunRows(stats.clock, CLOCK_DURATIONS), [stats.clock]);
  const survivalRows = useMemo(() => buildRunRows(stats.survival, SURVIVAL_SPEEDS), [stats.survival]);

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
              <Text style={styles.title}>{t.stats.title}</Text>
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
                <Text style={styles.heroLabel}>{t.stats.accuracy}</Text>

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
                <StatCell label={t.stats.puzzlesSolved} value={String(stats.attempts)} />
                <StatCell
                  label={t.stats.eloGained}
                  value={signed(stats.eloGain)}
                  tint={stats.eloGain >= 0 ? PALETTE.success : PALETTE.error}
                />
                <StatCell label={t.stats.totalTime} value={formatTotal(stats.totalTimeMs)} />
                <StatCell label={t.stats.currentStreak} value={String(currentStreak)} />
                <StatCell label={t.stats.bestStreak} value={String(stats.bestStreak)} />
                <StatCell label={t.stats.eloMax} value={String(stats.maxElo)} />
              </View>

              {/* ============ MODO DE SELECCIÓN DE ELO ============ */}
              {showModeSplit && (
                <>
                  <SectionTitle icon="options-outline" title={t.stats.sectionByType} />

                  <MetricRow
                    label={t.stats.eloAuto}
                    ratio={stats.auto.accuracy}
                    tint={accuracyTint(stats.auto.accuracy)}
                    value={stats.auto.attempts > 0 ? pct(stats.auto.accuracy) : '—'}
                    note={`${stats.auto.solved}/${stats.auto.attempts}`}
                    faded={stats.auto.attempts === 0}
                  />
                  <MetricRow
                    label={t.stats.eloManual}
                    ratio={stats.manual.accuracy}
                    tint={accuracyTint(stats.manual.accuracy)}
                    value={stats.manual.attempts > 0 ? pct(stats.manual.accuracy) : '—'}
                    note={`${stats.manual.solved}/${stats.manual.attempts}`}
                    faded={stats.manual.attempts === 0}
                  />

                </>
              )}

              {/* ============ TIEMPO ============ */}
              <SectionTitle icon="time-outline" title={t.stats.sectionSolveTime} />
              <View style={styles.grid}>
                <StatCell label={t.stats.avgOnSolved} value={formatShort(stats.avgSolveMsSuccess)} />
                <StatCell label={t.stats.avgOnFailed} value={formatShort(stats.avgSolveMsFail)} />
                <StatCell label={t.stats.fastest} value={formatShort(stats.fastestSolveMs)} />
                <StatCell
                  label={t.stats.puzzlesPerHour}
                  value={formatPace(stats.timedAttempts, stats.totalTimeMs)}
                />
                <StatCell
                  label={t.stats.hardestPuzzle}
                  value={stats.hardestSolvedElo > 0 ? String(stats.hardestSolvedElo) : '—'}
                />
                <StatCell
                  label={t.stats.eloAvgSolved}
                  value={stats.avgSolvedElo > 0 ? String(stats.avgSolvedElo) : '—'}
                />
              </View>

              {/* ============ TIEMPO / DIFICULTAD ============ */}
              <SectionTitle
                icon="speedometer-outline"
                title={t.stats.sectionByDifficulty}
              />
              {stats.buckets.length === 0 ? (
                <EmptyHint text={t.stats.emptyDifficulty} />
              ) : (
                stats.buckets.map(b => (
                  <MetricRow
                    key={b.from}
                    label={`${b.from}–${b.to}`}
                    ratio={b.accuracy}
                    tint={accuracyTint(b.accuracy)}
                    value={pct(b.accuracy)}
                    note={
                      b.avgSolveMs > 0
                        ? `${b.solved}/${b.attempts} · ${formatShort(b.avgSolveMs)}`
                        : `${b.solved}/${b.attempts}`
                    }
                  />
                ))
              )}

              {/* ============ TEMAS ============ */}
              <SectionTitle icon="pricetags-outline" title={t.stats.sectionByTheme} />

              {(strongest || weakest) && (
                <View style={styles.insightBox}>
                  {strongest && (
                    <Text style={styles.insightText}>
                      <Text style={{ color: PALETTE.success }}>▲ </Text>
                      {t.stats.bestTheme(themeName(t, strongest.id))} ({pct(strongest.accuracy)})
                    </Text>
                  )}
                  {weakest && (
                    <Text style={styles.insightText}>
                      <Text style={{ color: PALETTE.error }}>▼ </Text>
                      {t.stats.worstTheme(themeName(t, weakest.id))} ({pct(weakest.accuracy)})
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
                <EmptyHint text={t.stats.emptyThemes} />
              ) : (
                sortedThemes.map(th => (
                  <MetricRow
                    key={th.id}
                    label={themeName(t, th.id)}
                    ratio={th.accuracy}
                    tint={accuracyTint(th.accuracy)}
                    value={pct(th.accuracy)}
                    note={th.elo ? `${th.solved}/${th.attempts} · ${th.elo}` : `${th.solved}/${th.attempts}`}
                    faded={th.attempts < MIN_THEME_ATTEMPTS}
                  />
                ))
              )}

              {/* ============ OTROS MODOS DE JUEGO ============ */}
              {hasRuns && (
                <>
                  <SectionTitle
                    icon="trophy-outline"
                    title={t.stats.sectionOtherModes}
                  />
                  {stats.clock.runs > 0 && <RunTable title={t.stats.tableClock} rows={clockRows} />}
                  {stats.survival.runs > 0 && <RunTable title={t.stats.tableSurvival} rows={survivalRows} />}
                </>
              )}

              {/* ============ ACTIVIDAD ============ */}
              <SectionTitle
                icon="calendar-outline"
                title={t.stats.sectionActivity}
                hint={t.stats.lastNDays(ACTIVITY_DAYS)}
              />
              <ActivityBars days={stats.days} />
              <View style={styles.grid}>
                <StatCell label={t.stats.activeDays} value={`${stats.activeDays}/${ACTIVITY_DAYS}`} />
                <StatCell label={t.stats.dayStreak} value={String(stats.dayStreak)} />
                <StatCell
                  label={t.stats.bestDay}
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
