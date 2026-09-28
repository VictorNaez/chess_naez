import { Ionicons } from '@expo/vector-icons';
import { curveMonotoneX } from 'd3-shape';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Stop } from 'react-native-svg';
import { LineChart } from 'react-native-wagmi-charts';
import { useT } from '../../i18n/I18nProvider';
import { formatDuration } from '../../lib/time';
import { MODAL_MAX_WIDTH, MODAL_WIDTH_RATIO, modalWidthFor } from '../../theme/responsive';
import { themeNames as resolveThemeNames } from '../chess_themes';
import { MiniBoardPreview } from '../ChessBoard';
import { PALETTE } from '../colors';
import { Skeleton } from '../ui/Skeleton';

interface EloPoint {
  value: number;
  timestamp: number;
}

interface HistoryModalProps {
  visible: boolean;
  onClose: () => void;
  globalElo: number;
  eloHistoryData: EloPoint[];
  recentPuzzles: any[];
  isHistoryListReady: boolean;
  isChartReady: boolean; 
  selectedHistoryItem: any;
  onSelectPuzzle: (puzzleData: any) => void;
}

// =========================================================
// RANGOS TEMPORALES DE LA GRÁFICA
// =========================================================
type TimeRange = 'all' | 'year' | 'month' | 'week' | 'today';
const RANGE_OPTIONS: TimeRange[] = ['all', 'year', 'month', 'week', 'today'];
const DAY_MS = 24 * 60 * 60 * 1000;
const CHART_BLOCK_HEIGHT = 214;

//   curveLinear      -> líneas rectas, sin suavizado
//   curveMonotoneX   -> suave sin sobrepasar los valores (no inventa máximos)
//   curveNatural     -> spline cúbica, más suelta, puede sobrepasar un poco
//   curveCatmullRom  -> suave y algo más "redonda" que monotone
// NO usar curveStep* ni curveBasis: generan un número distinto de segmentos y
// desalinean el cursor/tooltip respecto a los datos.
const ELO_LINE_SHAPE = curveMonotoneX;

const getCutoff = (range: TimeRange): number => {
  const now = Date.now();
  switch (range) {
    case 'year':  return now - 365 * DAY_MS;
    case 'month': return now - 30 * DAY_MS;
    case 'week':  return now - 7 * DAY_MS;
    case 'today': {
      const d = new Date();
      d.setHours(0, 0, 0, 0);   // desde medianoche local, no "últimas 24h"
      return d.getTime();
    }
    default: return 0;
  }
};

// =========================================================
// SERIE TEMPORAL DE LA GRÁFICA (eje X lineal en el tiempo)
// =========================================================
// El eje X es tiempo real en TODOS los rangos: un día sin jugar ocupa lo mismo
// que un día jugando. Como el ELO solo cambia al resolver un puzle, entre dos
// puntos separados por un hueco el valor real es constante; por eso se inserta
// un punto de "meseta" justo antes del siguiente y la línea queda plana durante
// el hueco en vez de subir o bajar en diagonal durante días.
const GAP_MIN_FRACTION = 0.02;   // hueco > 2% del ancho del eje -> meseta
const STEP_RISE_FRACTION = 0.004; // anchura del salto al final de la meseta
const MIN_SPAN_MS = 10 * 60 * 1000;           // ancho mínimo del eje
const TODAY_LEAD_FRACTION = 0.1;               // margen previo al 1er puzle de hoy
const TODAY_MIN_LEAD_MS = 2 * 60 * 1000;

interface ChartSeries {
  data: EloPoint[];
  xDomain: [number, number];
}

const buildChartSeries = (history: EloPoint[], range: TimeRange, now: number): ChartSeries | null => {
  if (history.length === 0) return null;

  const cutoff = range === 'all' ? history[0].timestamp : getCutoff(range);
  const firstIdx = history.findIndex(d => d.timestamp >= cutoff);
  if (firstIdx === -1) return null;

  // El eje llega hasta "ahora": si llevas días sin jugar, la línea sigue plana
  // hasta el borde derecho.
  const end = Math.max(now, history[history.length - 1].timestamp);

  let start: number;
  if (firstIdx === 0) {
    // El historial empieza dentro de la ventana (jugador nuevo): el eje arranca
    // en su primer puzle; no tiene sentido pintar meses vacíos antes de existir.
    start = history[0].timestamp;
  } else if (range === 'today') {
    // "Hoy" desde medianoche aplastaba una sesión de 10 min en 3-4 px contra el
    // borde. El eje arranca poco antes del primer puzle de hoy, con un margen
    // para que se vea el ELO de partida antes del primer salto.
    const firstToday = history[firstIdx].timestamp;
    const lead = Math.max((end - firstToday) * TODAY_LEAD_FRACTION, TODAY_MIN_LEAD_MS);
    start = Math.max(cutoff, firstToday - lead);
  } else {
    start = cutoff;
  }
  if (end - start < MIN_SPAN_MS) start = end - MIN_SPAN_MS;

  // Línea base: el ELO con el que arrancabas la ventana, fechado en su inicio.
  const raw: EloPoint[] = firstIdx > 0
    ? [{ value: history[firstIdx - 1].value, timestamp: start }, ...history.slice(firstIdx)]
    : history.slice(firstIdx);

  // Timestamps de SQLite con resolución de segundos: si dos filas comparten
  // segundo, vale la última (dx = 0 no aporta nada y descuadra la curva).
  const points: EloPoint[] = [];
  for (const p of raw) {
    const last = points[points.length - 1];
    if (last && p.timestamp <= last.timestamp) {
      points[points.length - 1] = { value: p.value, timestamp: last.timestamp };
    } else {
      points.push(p);
    }
  }

  const lastPoint = points[points.length - 1];
  if (lastPoint.timestamp < end) points.push({ value: lastPoint.value, timestamp: end });
  // wagmi-charts necesita 2 puntos mínimo para trazar la línea
  if (points.length === 1) points.unshift({ value: points[0].value, timestamp: start });

  const span = end - start;
  const minGap = span * GAP_MIN_FRACTION;
  const rise = span * STEP_RISE_FRACTION;
  const data: EloPoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    if (cur.value !== prev.value && cur.timestamp - prev.timestamp > minGap) {
      data.push({ value: prev.value, timestamp: cur.timestamp - rise });
    }
    data.push(cur);
  }

  return { data, xDomain: [start, end] };
};

const formatXTick = (ts: number, span: number): string => {
  const d = new Date(ts);
  if (span <= DAY_MS) return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (span > 400 * DAY_MS) return `${d.getMonth() + 1}/${String(d.getFullYear()).slice(-2)}`;
  return `${d.getDate()}/${d.getMonth() + 1}`;
};

const ChartSkeleton = React.memo(() => (
  <View style={styles.chartSkeleton}>
    <View style={styles.chartSkeletonYAxis}>
      {[0, 1, 2, 3].map(i => <Skeleton key={i} width={32} height={11} radius={4} />)}
    </View>
    <View style={styles.chartSkeletonBody}>
      <Skeleton height={180} radius={12} />
      <View style={styles.chartSkeletonXAxis}>
        {[0, 1, 2, 3].map(i => <Skeleton key={i} width={28} height={10} radius={4} />)}
      </View>
    </View>
  </View>
));

export const HistoryModal = React.memo(({
  visible,
  onClose,
  globalElo,
  eloHistoryData,
  recentPuzzles,
  isHistoryListReady,
  isChartReady,
  selectedHistoryItem,
  onSelectPuzzle,
}: HistoryModalProps) => {
  const t = useT();
  const { width: windowWidth } = useWindowDimensions();
  const chartWidth = modalWidthFor(windowWidth) * (0.74 / MODAL_WIDTH_RATIO);

// El mensaje de "vacío" solo se permite cuando la carga ha terminado de verdad
// y ha pasado un pequeño margen. Así el spinner nunca parpadea al abrir.
const [canShowEmpty, setCanShowEmpty] = useState(false);

  useEffect(() => {
    if (!visible) {
      setCanShowEmpty(false);
      return;
    }
    if (isHistoryListReady && recentPuzzles.length === 0) {
      const t = setTimeout(() => setCanShowEmpty(true), 400);
      return () => clearTimeout(t);
    }
    setCanShowEmpty(false);
  }, [visible, isHistoryListReady, recentPuzzles.length]);

  const showSpinner = !isHistoryListReady || (recentPuzzles.length === 0 && !canShowEmpty);

  const [timeRange, setTimeRange] = useState<TimeRange>('all');

  // --- Serie de la gráfica recortada al rango, con eje X temporal ---
  // `visible` entra en las dependencias para recalcular "ahora" al reabrir.
  const chartSeries = useMemo(
    () => buildChartSeries(eloHistoryData, timeRange, Date.now()),
    [eloHistoryData, timeRange, visible]
  );
  const chartData = chartSeries?.data ?? [];

  // --- Derivados de la gráfica: solo dependen de chartData ---
  const eloYAxisTicks = useMemo(() => {
    if (chartData.length === 0) return [];
    const values = chartData.map(d => d.value);
    const maxElo = Math.max(...values);
    const minElo = Math.min(...values);
    const rangoOriginal = maxElo - minElo;
    const padding = rangoOriginal * 0.1 || 10;
    const maxGrafica = maxElo + padding;
    const minGrafica = Math.max(0, minElo - padding);
    const rangoAjustado = maxGrafica - minGrafica;
    return [
      Math.round(maxGrafica),
      Math.round(maxGrafica - rangoAjustado * 0.33),
      Math.round(minGrafica + rangoAjustado * 0.33),
      Math.round(minGrafica),
    ];
  }, [chartData]);

  // Eje temporal: las etiquetas se reparten uniformemente en el TIEMPO, igual
  // que los puntos, así cada fecha queda encima de lo que ocurrió ese día.
  const eloXAxisTicks = useMemo(() => {
    if (!chartSeries) return [];
    const [start, end] = chartSeries.xDomain;
    const span = end - start;
    const tickCount = 4;
    return Array.from({ length: tickCount }).map((_, i) =>
      formatXTick(start + span * (i / (tickCount - 1)), span)
    );
  }, [chartSeries]);

  return (
    <Modal animationType="fade" transparent={true} visible={visible} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.historyModalContent}>

          {/* CABECERA DEL MODAL */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t.puzzle.history}</Text>
            <Text style={styles.footerLabel}>{t.puzzle.currentRatingLabel}</Text>
            <Text style={styles.footerValue}>{globalElo} ELO</Text>
            <TouchableOpacity style={styles.closeModalBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>

          {/* SELECTOR DE RANGO TEMPORAL */}
          <View style={styles.rangeTabsRow}>
            {RANGE_OPTIONS.map(key => {
              const isActive = timeRange === key;
              return (
                <TouchableOpacity
                  key={key}
                  activeOpacity={0.7}
                  onPress={() => setTimeRange(key)}
                  style={[styles.rangeTab, isActive && styles.rangeTabActive]}
                >
                  <Text style={[styles.rangeTabText, isActive && styles.rangeTabTextActive]}>
                    {t.historyRanges[key]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* CONTENIDO/GRÁFICA */}
          <View style={styles.chartContainer}>
            <View style={styles.chartBlock}>
              {!isChartReady ? (
                <ChartSkeleton />
              ) : chartData.length === 0 ? (
                <View style={styles.chartEmptyState}>
                  <Text style={styles.historyEmptyText}>{t.puzzle.noActivityPeriod}</Text>
                </View>
              ) : (
                <LineChart.Provider data={chartData} xDomain={chartSeries?.xDomain}>
                  <View style={{ width: '100%', height: 180, position: 'relative' }}>

                    <View style={styles.fixedYAxisContainer}>
                      {eloYAxisTicks.map((val, index) => (
                        <Text key={index} style={styles.axisTickText}>{val}</Text>
                      ))}
                    </View>

                    <View
                      style={[
                        StyleSheet.absoluteFill,
                        { paddingLeft: 45, justifyContent: 'space-between', height: 180, paddingVertical: 6 }
                      ]}
                      pointerEvents="none"
                    >
                      {[1, 2, 3, 4].map((_, i) => (
                        <View
                          key={i}
                          style={{ width: '100%', height: 1, backgroundColor: 'rgba(255, 255, 255, 0.06)', borderStyle: 'dashed' }}
                        />
                      ))}
                    </View>

                    <View style={{ paddingLeft: 45, width: '100%', height: 190 }}>
                      <LineChart width={chartWidth} height={180} shape={ELO_LINE_SHAPE}>
                        <LineChart.Path color={PALETTE.primary} pathProps={{ strokeWidth: 2 }}>
                          <LineChart.Gradient color={PALETTE.primary}>
                            <Stop offset="0%"   stopColor={PALETTE.primary} stopOpacity={0.5} />
                            <Stop offset="50%"  stopColor={PALETTE.primary} stopOpacity={0.45} />
                            <Stop offset="100%" stopColor={PALETTE.primary} stopOpacity={0} />
                          </LineChart.Gradient>
                        </LineChart.Path>
                        <LineChart.Cursor type="crosshair" snapToPoint>
                          <LineChart.Tooltip
                            position="top"
                            style={{ backgroundColor: "#1A1A1A", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
                            textStyle={{ color: "#FFF", fontWeight: "700" }}
                          />
                        </LineChart.Cursor>
                      </LineChart>
                    </View>
                  </View>

                  <View style={styles.xAxisContainer}>
                    {eloXAxisTicks.map((label, i) => (
                      <Text key={i} style={styles.xAxisTickText}>{label}</Text>
                    ))}
                  </View>
                </LineChart.Provider>
              )}
            </View>
          </View>

          {/* LISTA DE PUZLES DEL HISTORIAL */}
          <ScrollView
            style={styles.historyListScroll}
            contentContainerStyle={styles.historyListContent}
            showsVerticalScrollIndicator={false}
          >
            {showSpinner ? (
              <View style={styles.historyLoadingContainer}>
                <ActivityIndicator size="small" color={PALETTE.primary} />
              </View>
            ) : recentPuzzles.length === 0 ? (
              <Text style={styles.historyEmptyText}>{t.puzzle.noPuzzlesYet}</Text>
            ) : (
              recentPuzzles.map((puzzleData) => {
                const isSelected = selectedHistoryItem?.id === puzzleData?.id;
                const isSuccess = puzzleData.is_success === 1;
                const eloChangeText = puzzleData.elo_change >= 0
                  ? `+${puzzleData.elo_change}`
                  : `${puzzleData.elo_change}`;
                const themeNames = resolveThemeNames(t, puzzleData.puzzle_themes);
                const solveMs = puzzleData.solve_ms || 0;

                return (
                  <TouchableOpacity
                    key={puzzleData.id}
                    activeOpacity={0.7}
                    onPress={() => onSelectPuzzle(puzzleData)}
                    style={[styles.historyRow, isSelected && styles.historyRowSelected]}
                  >
                    <MiniBoardPreview fen={puzzleData.puzzle_fen} />

                    <View style={styles.historyRowInfo}>
                      <View style={styles.historyRowTopLine}>
                        <Text style={styles.historyRowEloText}>
                          {/* Las filas anteriores a que existiera puzzle_elo
                              guardan 0. Antes se pintaba un rating inventado en
                              su lugar; un guion dice la verdad: ese dato no se
                              llegó a registrar. */}
                          {puzzleData.puzzle_elo ? `${puzzleData.puzzle_elo} ELO` : '—'}
                        </Text>

                        <View style={styles.historyRowRight}>
                          {solveMs > 0 && (
                            <View style={styles.historyTimeChip}>
                              <Ionicons name="time-outline" size={10} color={PALETTE.secondary} />
                              <Text style={styles.historyTimeText}>
                                {formatDuration(solveMs)}
                              </Text>
                            </View>
                          )}

                          <View style={[
                            styles.historyChangeBadge,
                            { backgroundColor: isSuccess ? PALETTE.success : PALETTE.error }
                          ]}>
                            <Ionicons name={isSuccess ? 'arrow-up' : 'arrow-down'} size={10} color="#FFF" />
                            <Text style={styles.historyChangeText}>{eloChangeText}</Text>
                          </View>
                        </View>
                      </View>

                      <View style={styles.historyThemesRow}>
                        {themeNames ? (
                          themeNames.split(', ').map((name, idx) => (
                            <View key={idx} style={styles.minimalTag}>
                              <Text style={styles.minimalTagText}>{name.toUpperCase()}</Text>
                            </View>
                          ))
                        ) : (
                          <Text style={styles.historyNoThemesText}>—</Text>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
    modalTitle: { color: PALETTE.primary, fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
    historyModalContent: { width: '95%', maxWidth: MODAL_MAX_WIDTH, height: '90%',  backgroundColor: '#141414', borderRadius: 24, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)', shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 20,},
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 15,},
    closeModalBtn: { backgroundColor: 'rgba(255, 255, 255, 0.05)', padding: 6, borderRadius: 50,},
    footerLabel: { color: PALETTE.primary,fontSize: 14, fontWeight: '600', marginBottom:20,},
    footerValue: { color: PALETTE.secondary, fontSize: 18, fontWeight: '800', marginBottom:20,},

    // --- SELECTOR DE RANGO TEMPORAL ---
    rangeTabsRow: { flexDirection: 'row', width: '100%', gap: 6, marginBottom: 12 },
    rangeTab: { flex: 1, minWidth: 0, paddingVertical: 7, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
    rangeTabActive: { backgroundColor: PALETTE.tagBg, borderColor: PALETTE.primary },
    rangeTabText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, color: PALETTE.secondary },
    rangeTabTextActive: { color: PALETTE.primary },

    chartContainer: {width: '100%', backgroundColor: 'rgba(26, 26, 26, 0.5)', borderRadius: 16, paddingVertical: 15, paddingHorizontal: 10, overflow: 'hidden', alignItems: 'center', },
    fixedYAxisContainer: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 40, justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 5, zIndex: 10,},
    axisTickText: { fontSize: 11, color: "rgba(255, 255, 255, 0.6)", fontWeight: "600",  fontVariant: ['tabular-nums'], }, 
    xAxisContainer: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingLeft: 45, paddingRight: 4, marginTop: 8, },
    xAxisTickText: { fontSize: 10, color: "rgba(255, 255, 255, 0.5)", fontWeight: "600", },
    historyListScroll: { width: '100%', flex: 1, marginTop: 16, },
    historyListContent: { paddingBottom: 10, },
    historyEmptyText: { color: PALETTE.secondary, fontSize: 13, textAlign: 'center', marginTop: 30, opacity: 0.6, },
    historyRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: PALETTE.surface, borderRadius: 14, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)', },
    historyRowSelected: { borderColor: PALETTE.primary, backgroundColor: PALETTE.surfaceLight, },
    historyRowInfo: { flex: 1, marginLeft: 12, },
    historyRowTopLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, },
    historyRowEloText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', },

    // --- LADO DERECHO DE LA FILA: TIEMPO + CAMBIO DE ELO ---
    historyRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8, },
    historyTimeChip: { flexDirection: 'row', alignItems: 'center', gap: 3, },
    historyTimeText: { color: PALETTE.secondary, fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'], },

    historyChangeBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 20, },
    historyChangeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', },
    historyThemesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, },
    historyNoThemesText: { color: PALETTE.secondary, fontSize: 10, opacity: 0.5, },
    historyLoadingContainer: { paddingVertical: 40, alignItems: 'center', justifyContent: 'center', },
    minimalTag: { backgroundColor: PALETTE.tagBg, paddingVertical: 3, paddingHorizontal: 6, borderRadius: 6, borderWidth: 1, borderColor: PALETTE.tagBorder },
    minimalTagText: { color: PALETTE.primary, fontSize: 8, fontWeight: '800' },

    chartBlock: { width: '100%', height: CHART_BLOCK_HEIGHT },
    chartEmptyState: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
    chartSkeleton: { flexDirection: 'row', width: '100%', height: '100%', paddingVertical: 5 },
    chartSkeletonYAxis: { width: 45, height: 180, justifyContent: 'space-between', paddingVertical: 5 },
    chartSkeletonBody: { flex: 1 },
    chartSkeletonXAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingRight: 4 },
});