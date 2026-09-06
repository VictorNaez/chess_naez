import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DayStat } from '../../lib/statsQueries';
import { PALETTE } from '../colors';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// Todos los componentes viven a nivel de módulo: definirlos dentro del render
// del modal haría que React los tratara como tipos nuevos en cada pasada.

export const pct = (ratio: number): string => `${Math.round(ratio * 100)}%`;

// Verde / ámbar / rojo según lo bien que se lleve ese tema o dificultad.
export const accuracyTint = (accuracy: number): string => {
  if (accuracy >= 0.7) return PALETTE.success;
  if (accuracy >= 0.5) return PALETTE.warning;
  return PALETTE.error;
};

// =========================================================
// CABECERA DE SECCIÓN
// =========================================================
export const SectionTitle = React.memo(({ icon, title, hint }: {
  icon: IoniconName;
  title: string;
  hint?: string;
}) => (
  <View style={styles.sectionHeader}>
    <Ionicons name={icon} size={13} color={PALETTE.primary} />
    <Text style={styles.sectionTitle}>{title}</Text>
    {!!hint && <Text style={styles.sectionHint}>{hint}</Text>}
  </View>
));

// =========================================================
// CELDA DE DATO (rejilla de 3 columnas)
// =========================================================
export const StatCell = React.memo(({ label, value, tint }: {
  label: string;
  value: string;
  tint?: string;
}) => (
  <View style={styles.statCell}>
    <Text style={[styles.statValue, !!tint && { color: tint }]} numberOfLines={1} adjustsFontSizeToFit>
      {value}
    </Text>
    <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
  </View>
));

// =========================================================
// BARRA ACIERTOS / FALLOS
// =========================================================
export const SplitBar = React.memo(({ solved, failed }: { solved: number; failed: number }) => {
  const total = solved + failed;
  if (total === 0) return <View style={styles.splitBarTrack} />;

  return (
    <View style={styles.splitBarTrack}>
      <View style={[styles.splitBarFill, { flex: solved, backgroundColor: PALETTE.success }]} />
      <View style={[styles.splitBarFill, { flex: failed, backgroundColor: PALETTE.error }]} />
    </View>
  );
});

// =========================================================
// FILA CON BARRA DE PROGRESO
// Sirve para temas, modos y dificultades: etiqueta + barra + dos cifras.
// =========================================================
export const MetricRow = React.memo(({ label, ratio, tint, value, note, faded }: {
  label: string;
  ratio: number;          // 0..1, ancho de la barra
  tint: string;
  value: string;          // cifra grande a la derecha
  note?: string;          // cifra pequeña bajo la anterior
  faded?: boolean;        // pocos datos: se atenúa para no sacar conclusiones
}) => (
  <View style={[styles.metricRow, faded && styles.metricRowFaded]}>
    <View style={styles.metricLeft}>
      <Text style={styles.metricLabel} numberOfLines={1}>{label}</Text>
      <View style={styles.metricTrack}>
        <View
          style={[
            styles.metricFill,
            { width: `${Math.max(2, Math.min(100, ratio * 100))}%`, backgroundColor: tint },
          ]}
        />
      </View>
    </View>

    <View style={styles.metricRight}>
      <Text style={[styles.metricValue, { color: tint }]}>{value}</Text>
      {!!note && <Text style={styles.metricNote}>{note}</Text>}
    </View>
  </View>
));

// =========================================================
// ACTIVIDAD DIARIA
// Barra apilada por día: verde lo resuelto, rojo lo fallado.
// =========================================================
export const ActivityBars = React.memo(({ days }: { days: DayStat[] }) => {
  const maxAttempts = Math.max(1, ...days.map(d => d.attempts));

  return (
    <View style={styles.activityWrap}>
      <View style={styles.activityRow}>
        {days.map((d) => {
          const heightPct = d.attempts === 0 ? 0 : (d.attempts / maxAttempts) * 100;
          const failed = d.attempts - d.solved;
          const dayNumber = Number(d.day.slice(8, 10));

          return (
            <View key={d.day} style={styles.activityCol}>
              <View style={styles.activityBarArea}>
                {d.attempts === 0 ? (
                  <View style={styles.activityEmptyDot} />
                ) : (
                  <View style={[styles.activityBar, { height: `${Math.max(6, heightPct)}%` }]}>
                    {failed > 0 && (
                      <View style={[styles.activitySegment, { flex: failed, backgroundColor: PALETTE.error }]} />
                    )}
                    {d.solved > 0 && (
                      <View style={[styles.activitySegment, { flex: d.solved, backgroundColor: PALETTE.success }]} />
                    )}
                  </View>
                )}
              </View>
              <Text style={styles.activityDayText}>{dayNumber}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
});

// =========================================================
// ESTADO VACÍO DE UNA SECCIÓN
// =========================================================
export const EmptyHint = React.memo(({ text }: { text: string }) => (
  <Text style={styles.emptyHint}>{text}</Text>
));

const styles = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 22, marginBottom: 10 },
  sectionTitle: { color: PALETTE.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  sectionHint: { flex: 1, minWidth: 0, color: PALETTE.chipText, fontSize: 9, fontWeight: '700', textAlign: 'right' },

  statCell: { width: '33.33%', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 2 },
  statValue: { color: PALETTE.accent, fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statLabel: { color: PALETTE.chipText, fontSize: 8, fontWeight: '800', letterSpacing: 0.8, marginTop: 4 },

  splitBarTrack: {
    flexDirection: 'row', width: '100%', height: 10, borderRadius: 6,
    backgroundColor: PALETTE.chipBg, overflow: 'hidden',
  },
  splitBarFill: { height: '100%' },

  metricRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  metricRowFaded: { opacity: 0.45 },
  metricLeft: { flex: 1, minWidth: 0 },
  metricLabel: { color: PALETTE.accent, fontSize: 12, fontWeight: '700', marginBottom: 5 },
  metricTrack: { width: '100%', height: 6, borderRadius: 4, backgroundColor: PALETTE.chipBg, overflow: 'hidden' },
  metricFill: { height: '100%', borderRadius: 4 },
  metricRight: { width: 62, alignItems: 'flex-end' },
  metricValue: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  metricNote: { color: PALETTE.chipText, fontSize: 9, fontWeight: '700', marginTop: 2, fontVariant: ['tabular-nums'] },

  activityWrap: { width: '100%' },
  activityRow: { flexDirection: 'row', alignItems: 'flex-end', height: 90, gap: 3 },
  activityCol: { flex: 1, minWidth: 0, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  activityBarArea: { width: '100%', flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  activityBar: { width: '100%', borderRadius: 3, overflow: 'hidden', minHeight: 4 },
  activitySegment: { width: '100%' },
  activityEmptyDot: { width: '100%', height: 3, borderRadius: 2, backgroundColor: PALETTE.chipBg },
  activityDayText: { color: PALETTE.chipText, fontSize: 8, fontWeight: '700', marginTop: 5 },

  emptyHint: { color: PALETTE.chipText, fontSize: 11, fontWeight: '600', paddingVertical: 12, textAlign: 'center' },
});
