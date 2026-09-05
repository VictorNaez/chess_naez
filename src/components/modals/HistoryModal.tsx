import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LineChart } from 'react-native-wagmi-charts';
import { getThemeNames } from '../../lib/puzzleQueries';
import { formatDuration } from '../../lib/time';
import { SCREEN_WIDTH } from '../../theme/layout';
import { MiniBoardPreview } from '../ChessBoard';
import { PALETTE } from '../colors';

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
  selectedHistoryItem: any;
  onSelectPuzzle: (puzzleData: any) => void;
}

// =========================================================
// RANGOS TEMPORALES DE LA GRÁFICA
// =========================================================
type TimeRange = 'all' | 'year' | 'month' | 'week' | 'today';

const RANGE_OPTIONS: { key: TimeRange; label: string }[] = [
  { key: 'all',   label: 'ALL'   },
  { key: 'year',  label: '1Y'    },
  { key: 'month', label: '30D'   },
  { key: 'week',  label: '7D'    },
  { key: 'today', label: 'TODAY' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

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

export const HistoryModal = React.memo(({
  visible,
  onClose,
  globalElo,
  eloHistoryData,
  recentPuzzles,
  isHistoryListReady,
  selectedHistoryItem,
  onSelectPuzzle,
}: HistoryModalProps) => {

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

  // --- Datos de la gráfica ya recortados al rango seleccionado ---
  const chartData = useMemo(() => {
    if (timeRange === 'all') return eloHistoryData;

    const cutoff = getCutoff(timeRange);
    const firstIdx = eloHistoryData.findIndex(d => d.timestamp >= cutoff);
    if (firstIdx === -1) return [];

    const inRange = eloHistoryData.slice(firstIdx);

    // Línea base: el ELO con el que arrancabas la ventana, pero con el timestamp
    // del INICIO de la ventana (medianoche en "today"), no el suyo real.
    // Si conserváramos el original (ayer, hace un mes...) el eje X se estiraría
    // hacia atrás y todo lo del rango quedaría aplastado contra el borde derecho.
    const baseline = firstIdx > 0
      ? { value: eloHistoryData[firstIdx - 1].value, timestamp: cutoff }
      : null;

    const points = baseline ? [baseline, ...inRange] : inRange;

    // wagmi-charts necesita 2 puntos mínimo para trazar la línea
    if (points.length === 1) {
      const only = points[0];
      const startTs = only.timestamp > cutoff ? cutoff : only.timestamp - 60 * 60 * 1000;
      return [{ value: only.value, timestamp: startTs }, only];
    }
    return points;
  }, [eloHistoryData, timeRange]);

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

  const eloChartXDomain = useMemo((): [number, number] | undefined => {
    if (chartData.length < 2) return undefined;
    const first = chartData[0].timestamp;
    const last = chartData[chartData.length - 1].timestamp;
    if (first === last) {
      return [first - 12 * 60 * 60 * 1000, last + 12 * 60 * 60 * 1000];
    }
    return [first, last];
  }, [chartData]);

  // Al repartir por índice, cada etiqueta debe ser la de un punto REAL.
  // (Antes se interpolaba el tiempo, que solo cuadra si el eje X es temporal.)
  const eloXAxisTicks = useMemo(() => {
    if (chartData.length < 2) return [];
    const first = chartData[0].timestamp;
    const last = chartData[chartData.length - 1].timestamp;
    const tickCount = 4;
    const spansOneDay = last - first <= DAY_MS;

    return Array.from({ length: tickCount }).map((_, i) => {
      const idx = Math.round((chartData.length - 1) * (i / (tickCount - 1)));
      const d = new Date(chartData[idx].timestamp);
      return spansOneDay
        ? `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
        : `${d.getDate()}/${d.getMonth() + 1}`;
    });
  }, [chartData]);

  return (
    <Modal animationType="fade" transparent={true} visible={visible} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.historyModalContent}>

          {/* CABECERA DEL MODAL */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>HISTORY</Text>
            <Text style={styles.footerLabel}>Current Rating:</Text>
            <Text style={styles.footerValue}>{globalElo} ELO</Text>
            <TouchableOpacity style={styles.closeModalBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>

          {/* SELECTOR DE RANGO TEMPORAL */}
          <View style={styles.rangeTabsRow}>
            {RANGE_OPTIONS.map(opt => {
              const isActive = timeRange === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  activeOpacity={0.7}
                  onPress={() => setTimeRange(opt.key)}
                  style={[styles.rangeTab, isActive && styles.rangeTabActive]}
                >
                  <Text style={[styles.rangeTabText, isActive && styles.rangeTabTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* CONTENIDO/GRÁFICA */}
          <View style={styles.chartContainer}>
            {chartData.length === 0 ? (
              <View style={styles.chartEmptyState}>
                <Text style={styles.historyEmptyText}>No activity in this period</Text>
              </View>
            ) : (
              <LineChart.Provider data={chartData} xDomain={timeRange === 'all' ? eloChartXDomain : undefined}>
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
                    <LineChart width={SCREEN_WIDTH * 0.74} height={180}>
                      <LineChart.Path color={PALETTE.primary} pathProps={{ strokeWidth: 3 }}>
                        <LineChart.Gradient color={PALETTE.primary} opacity={1} />
                      </LineChart.Path>
                      <LineChart.Cursor type="crosshair">
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
              <Text style={styles.historyEmptyText}>No puzzles solved yet</Text>
            ) : (
              recentPuzzles.map((puzzleData) => {
                const isSelected = selectedHistoryItem?.id === puzzleData?.id;
                const isSuccess = puzzleData.is_success === 1;
                const eloChangeText = puzzleData.elo_change >= 0
                  ? `+${puzzleData.elo_change}`
                  : `${puzzleData.elo_change}`;
                const themeNames = getThemeNames(puzzleData.puzzle_themes);
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
                          {puzzleData.puzzle_elo || 1200} ELO
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
    historyModalContent: { width: '95%', height: '90%',  backgroundColor: '#141414', borderRadius: 24, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)', shadowColor: '#000',
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
    chartEmptyState: { height: 214, width: '100%', alignItems: 'center', justifyContent: 'center' },
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
    minimalTag: { backgroundColor: PALETTE.tagBg, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: PALETTE.tagBorder },
    minimalTagText: { color: PALETTE.primary, fontSize: 9, fontWeight: '800' },
});
