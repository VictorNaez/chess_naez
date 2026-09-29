import { Ionicons } from '@expo/vector-icons';
import MultiSlider from '@ptomasroos/react-native-multi-slider';
import * as SQLite from 'expo-sqlite';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { countSolvedPuzzles } from '../../data/puzzleStats';
import { useSettings } from '../../hooks/useSettings';
import { useT } from '../../i18n/I18nProvider';
import { arraysEqualUnordered, countPuzzles, getRecommendedRange, readCatalogRatingRange } from '../../lib/puzzleQueries';
import { loadWeakThemes, type WeakTheme } from '../../lib/weakThemes';
import { MODAL_MAX_WIDTH, MODAL_WIDTH_RATIO, modalWidthFor } from '../../theme/responsive';
import { CHESS_THEMES, FILTER_CATEGORY_IDS, themeName } from '../chess_themes';
import { PALETTE } from '../colors';
import { accuracyTint, pct } from '../stats/StatPrimitives';

// Paso del slider de ELO. 50 puntos: countPuzzles ya no necesita que el rango
// encaje en bandas de 100, así que no hay razón de rendimiento para engordarlo.
const ELO_STEP = 50;

interface FilterModalProps {
  visible: boolean;
  onClose: () => void;
  db: SQLite.SQLiteDatabase | null;
  currentEloRange: [number, number];
  currentSelectedThemes: string[];
  currentIsRecommendedMode: boolean;
  currentIsWeakFocus: boolean;
  globalElo: number;
  onApply: (eloRange: [number, number], selectedThemes: string[], isRecommendedMode: boolean, isWeakFocus: boolean) => void;
}

const CustomSliderLabel = ({ oneMarkerValue, twoMarkerValue, oneMarkerLeftPosition, twoMarkerLeftPosition }: any) => (
  <View style={styles.labelsWrapper}>
    <View style={[styles.customLabelBubble, { left: oneMarkerLeftPosition - 18 }]}>
      <Text style={styles.customLabelText}>{oneMarkerValue}</Text>
    </View>
    <View style={[styles.customLabelBubble, { left: twoMarkerLeftPosition - 18 }]}>
      <Text style={styles.customLabelText}>{twoMarkerValue}</Text>
    </View>
  </View>
);

export const FilterModal = React.memo(({
  visible,
  onClose,
  db,
  currentEloRange,
  currentSelectedThemes,
  currentIsRecommendedMode,
  currentIsWeakFocus,
  globalElo,
  onApply,
}: FilterModalProps) => {
  const t = useT();
  // Mismo 75% de ventana que antes en móvil (card al 95%), con el tope del card en tablet.
  const { width: windowWidth } = useWindowDimensions();
  const eloSliderLength = modalWidthFor(windowWidth) * (0.75 / MODAL_WIDTH_RATIO);
  const [tempEloRange, setTempEloRange] = useState<[number, number]>(currentEloRange);
  const [tempSelectedThemes, setTempSelectedThemes] = useState<string[]>(currentSelectedThemes);
  const [tempIsRecommendedMode, setTempIsRecommendedMode] = useState(currentIsRecommendedMode);
  // Puntos débiles: con él activo los chips de temas no pintan nada (se
  // conservan, por si lo apagas) y cada puzle sale de uno de `weakThemes`.
  // null = todavía calculándose; [] = no hay historial suficiente.
  const [tempIsWeakFocus, setTempIsWeakFocus] = useState(currentIsWeakFocus);
  const [weakThemes, setWeakThemes] = useState<WeakTheme[] | null>(null);
  const weakIds = useMemo(() => (weakThemes ?? []).map(w => w.id), [weakThemes]);
  // Estado del filtro de puntos débiles tal y como le importa al contador. Con
  // el interruptor apagado es 'off' pase lo que pase con la lista: así el
  // contador no se relanza cuando la lista termina de cargar sin que se use.
  const weakGate: 'off' | 'loading' | 'none' | 'ready' = !tempIsWeakFocus
    ? 'off'
    : weakThemes === null ? 'loading' : weakThemes.length === 0 ? 'none' : 'ready';
  const weakUnavailable = weakGate === 'none';
  const countThemes = weakGate === 'ready' ? weakIds : tempSelectedThemes;
  const [isSliding, setIsSliding] = useState(false);
  // Disponibles = cumplen el filtro Y no los has resuelto: son los que te
  // puede servir el tablero. Con 0 disponibles pero resueltos > 0 solo se
  // puede aplicar con el modo "PUZLE REPETIDO" activo (ajuste allowRepeats): entonces
  // el tablero sirve repetidos. Sin él, ese filtro no daría ningún puzle.
  const [tempAvailableCount, setTempAvailableCount] = useState(0);
  const [tempSolvedCount, setTempSolvedCount] = useState(0);
  const { allowRepeats } = useSettings();
  const isEmptyFilter = tempAvailableCount === 0 && tempSolvedCount === 0;
  const isBlocked = isEmptyFilter || weakUnavailable || (tempAvailableCount === 0 && !allowRepeats);
  const [contando, setContando] = useState(false);

  // Extremos REALES del catálogo, no constantes a fuego. El slider llevaba
  // 400-3000 escritos a mano mientras el catálogo llegaba a 3323: los puzzles
  // por encima de 3000 eran inalcanzables, y el contador decía 495.835 de
  // 500.000 sin que se entendiera por qué faltaban.
  const [limites, setLimites] = useState<[number, number]>([400, 3000]);

  useEffect(() => {
    if (!db) return;
    let cancelado = false;
    readCatalogRatingRange(db).then(([lo, hi]) => {
      if (cancelado) return;
      // Se redondean HACIA FUERA al paso del slider para que los extremos del
      // catálogo queden siempre dentro del rango alcanzable.
      setLimites([Math.floor(lo / ELO_STEP) * ELO_STEP, Math.ceil(hi / ELO_STEP) * ELO_STEP]);
    }).catch(() => {});
    return () => { cancelado = true; };
  }, [db]);

  // Al abrir el modal, sincronizamos el estado temporal con el real.
  // Así cada apertura arranca "limpia", sin arrastrar ediciones canceladas.
  useEffect(() => {
    if (visible) {
      setTempEloRange(currentEloRange);
      setTempSelectedThemes(currentSelectedThemes);
      setTempIsRecommendedMode(currentIsRecommendedMode);
      setTempIsWeakFocus(currentIsWeakFocus);
    }
  }, [visible]);

  // Los puntos débiles se recalculan en cada apertura: entre una y otra has
  // jugado y el orden puede haber cambiado. Es la consulta del panel de
  // estadísticas (una fila por combinación de temas), así que es rápida, pero
  // se hace siempre y no solo con el interruptor activo para que al pulsarlo
  // la lista ya esté ahí.
  useEffect(() => {
    if (!db || !visible) return;
    let cancelado = false;
    setWeakThemes(null);
    loadWeakThemes(db)
      .then(list => { if (!cancelado) setWeakThemes(list); })
      .catch(err => {
        console.warn('[FILTROS] loadWeakThemes falló', String(err));
        if (!cancelado) setWeakThemes([]);
      });
    return () => { cancelado = true; };
  }, [visible, db]);

  // Contador de puzzles disponibles en tiempo real mientras se edita.
  //
  // countPuzzles responde desde las tablas precalculadas cuando puede (rango en
  // bandas enteras y como mucho un tema), y ahí es instantáneo. Con dos o más
  // temas la intersección no se puede precalcular y toca escanear con la
  // máscara, así que va con debounce: a 1M de filas ese escaneo ronda el
  // segundo en un móvil de gama media, y el slider dispara este efecto en cada
  // pixel que se arrastra.
  //
  // Con puntos débiles se cuenta la UNIÓN de esos temas: el tablero sirve uno
  // cada vez, pero cualquiera de ellos puede salir.
  useEffect(() => {
    if (!db || !visible) return;
    let cancelled = false;

    if (weakGate === 'loading') { setContando(true); return; }   // aún sin lista
    if (weakGate === 'none') {
      setTempAvailableCount(0); setTempSolvedCount(0); setContando(false);
      return;
    }
    const temas = countThemes;
    const match = weakGate === 'ready' ? 'any' : 'all';

    const lanzar = () => {
      setContando(true);
      Promise.all([
        countPuzzles(db, tempEloRange as [number, number], temas, match),
        countSolvedPuzzles(db, tempEloRange, temas, match),
      ])
        .then(([total, solved]) => {
          if (cancelled) return;
          setTempAvailableCount(Math.max(0, total - solved));
          setTempSolvedCount(solved);
        })
        .catch(err => {
          // No se silencia: un 0 se pinta igual que un filtro legítimamente
          // vacío, y eso ya nos costó una tarde de depuración.
          console.warn('[FILTROS] countPuzzles falló', { rango: tempEloRange, err: String(err) });
          if (!cancelled) { setTempAvailableCount(0); setTempSolvedCount(0); }
        })
        .finally(() => { if (!cancelled) setContando(false); });
    };

    if (temas.length <= 1) {
      lanzar();
      return () => { cancelled = true; };
    }
    setContando(true);   // el spinner entra ya, antes del debounce
    const id = setTimeout(lanzar, 250);
    return () => { cancelled = true; clearTimeout(id); };
  }, [tempEloRange, countThemes, weakGate, visible, db]);

  const hasFilterChanges =
    tempEloRange[0] !== currentEloRange[0] ||
    tempEloRange[1] !== currentEloRange[1] ||
    tempIsRecommendedMode !== currentIsRecommendedMode ||
    tempIsWeakFocus !== currentIsWeakFocus ||
    !arraysEqualUnordered(tempSelectedThemes, currentSelectedThemes);

  // APLICAR sin cambios normalmente no hace nada, pero hay un caso en que sí:
  // el filtro actual está agotado y el modo "PUZLE REPETIDO" está activo. Aplicarlo
  // otra vez recarga el tablero con un repetido (p. ej. si activaste el modo
  // con el aviso de "todos resueltos" en pantalla).
  const canReapplyExhausted = !hasFilterChanges && allowRepeats && tempAvailableCount === 0 && !isEmptyFilter;
  const isApplyDisabled = contando || isBlocked || (!hasFilterChanges && !canReapplyExhausted);

  const handleToggleRecommended = () => {
    const nextMode = !tempIsRecommendedMode;
    setTempIsRecommendedMode(nextMode);
    if (nextMode) {
      // Mismos límites que usa la app al servir el puzle (getRecommendedRange
      // sin catálogo explícito). Con `limites` (300-3400) el contador de un ELO
      // bajo hablaba de una ventana distinta de la que luego se servía.
      setTempEloRange(getRecommendedRange(globalElo));
    }
  };

  // Restablecer = sin temas, sin puntos débiles y ELO en AUTO. Solo toca el
  // estado temporal, como el resto del modal: hay que pulsar APLICAR para que
  // surta efecto (y CANCELAR lo deshace). El rango se recalcula igual que al
  // activar AUTO a mano.
  const isAlreadyReset = tempIsRecommendedMode && tempSelectedThemes.length === 0 && !tempIsWeakFocus;
  const handleReset = () => {
    setTempSelectedThemes([]);
    setTempIsWeakFocus(false);
    setTempIsRecommendedMode(true);
    setTempEloRange(getRecommendedRange(globalElo));
  };

  const handleToggleTheme = (themeId: string) => {
    setTempSelectedThemes(prev =>
      prev.includes(themeId) ? prev.filter(id => id !== themeId) : [...prev, themeId]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={styles.modalOverlay}>
        <View style={styles.filterModalContent}>
          {/* El botón va en absoluto para que el título siga centrado en el
              card. Los títulos son cortos en todos los idiomas, así que no se
              pisan. */}
          <View style={styles.titleRow}>
            <TouchableOpacity
              style={[styles.btnReset, isAlreadyReset && { opacity: 0.35 }]}
              onPress={handleReset}
              disabled={isAlreadyReset}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t.filters.reset}
            >
              <Ionicons name="refresh" size={20} color={PALETTE.accent} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { marginBottom: 0 }]}>{t.puzzle.filters}</Text>
          </View>

          <View style={[styles.availableContainer, {
            alignSelf: 'center', marginBottom: 20,
            flexDirection: 'row', alignItems: 'center', gap: 8,
          }]}>
            {contando && <ActivityIndicator size="small" color={PALETTE.secondary} />}
            <Text style={[
              styles.availableBadge,
              !contando && tempAvailableCount === 0 && { color: PALETTE.warning },
              contando && { opacity: 0.5 },
            ]}>
              {contando
                ? " "//"CONTANDO…"
                : isEmptyFilter
                  ? t.filters.noneAvailable
                  : (
                    <>
                      {t.filters.availableCount(tempAvailableCount)}
                      {/* Texto anidado: comparte línea base con el número y se
                          lee como una nota al margen. Sin resueltos no aporta
                          nada, así que no se pinta. */}
                      {tempSolvedCount > 0 && (
                        <Text style={styles.solvedNote}>
                          {'  '}{t.filters.solvedCount(tempSolvedCount)}
                        </Text>
                      )}
                    </>
                  )}
            </Text>
          </View>

          <View style={styles.filterSection}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, width: '90%' }}>
              <Text style={[styles.filterTitle, { marginBottom: 0 }]}>
                {t.puzzle.puzzleElo}: {tempEloRange[0]} — {tempEloRange[1]}
              </Text>

              <TouchableOpacity
                style={[
                  styles.recommendedToggle,
                  { marginHorizontal: 0 },
                  tempIsRecommendedMode && { borderColor: PALETTE.secondary, backgroundColor: 'rgba(52, 152, 219, 0.1)' }
                ]}
                onPress={handleToggleRecommended}
              >
                <Ionicons
                  name={tempIsRecommendedMode ? "checkbox" : "square-outline"}
                  size={18}
                  color={tempIsRecommendedMode ? PALETTE.secondary : PALETTE.primary}
                />
                <Text style={[styles.recommendedText, tempIsRecommendedMode && { color: PALETTE.secondary }]}>
                  AUTO
                </Text>
              </TouchableOpacity>
            </View>

            {!tempIsRecommendedMode ? (
              <View style={{ alignItems: 'center' }}>
                <MultiSlider
                  values={[tempEloRange[0], tempEloRange[1]]}
                  sliderLength={eloSliderLength}
                  onValuesChangeStart={() => setIsSliding(true)}
                  onValuesChangeFinish={(values) => {
                    setIsSliding(false);
                    setTempEloRange(values as [number, number]);
                  }}
                  min={limites[0]}
                  max={limites[1]}
                  step={ELO_STEP}
                  snapped={true}
                  enableLabel={isSliding}
                  customLabel={(labelProps) => isSliding ? <CustomSliderLabel {...labelProps} /> : null}
                  selectedStyle={{ backgroundColor: PALETTE.secondary }}
                  trackStyle={{ height: 4, backgroundColor: 'rgba(255,255,255,0.1)' }}
                  markerStyle={styles.sliderMarker}
                />
              </View>
            ) : (
              <View style={styles.recommendedActivePanel}>
                <Ionicons name="flash" size={18} color={PALETTE.secondary} />
                <Text style={styles.recommendedActiveText}>
                  {t.filters.dynamicLevel}
                </Text>
              </View>
            )}
          </View>

          {/* Mismo patrón que la fila del ELO: título a la izquierda y el
              interruptor que sustituye la selección manual a la derecha. */}
          <View style={styles.themesHeader}>
            <Text style={[styles.filterTitle, { marginBottom: 0 }]}>{t.filters.themesTitle}</Text>
            <TouchableOpacity
              style={[
                styles.recommendedToggle,
                tempIsWeakFocus && { borderColor: PALETTE.secondary, backgroundColor: 'rgba(52, 152, 219, 0.1)' },
              ]}
              onPress={() => setTempIsWeakFocus(v => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: tempIsWeakFocus }}
              accessibilityHint={t.filters.weakFocusHint}
            >
              <Ionicons
                name={tempIsWeakFocus ? "checkbox" : "square-outline"}
                size={18}
                color={tempIsWeakFocus ? PALETTE.secondary : PALETTE.primary}
              />
              <Text style={[styles.recommendedText, tempIsWeakFocus && { color: PALETTE.secondary }]}>
                {t.filters.weakFocus}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ width: '100%' }}>
            {tempIsWeakFocus ? (
              <View style={styles.weakPanel}>
                <View style={styles.weakPanelHeader}>
                  <Ionicons name="locate" size={18} color={PALETTE.secondary} />
                  <Text style={[styles.recommendedActiveText, { flexShrink: 1 }]}>
                    {weakUnavailable ? t.filters.weakFocusNoData : t.filters.weakFocusHint}
                  </Text>
                </View>
                {weakThemes === null ? (
                  <ActivityIndicator size="small" color={PALETTE.secondary} />
                ) : (
                  // Del más flojo al menos. La cifra es la precisión real, la
                  // misma que en estadísticas; el orden viene suavizado por el
                  // número de intentos (ver lib/weakThemes.ts).
                  <View style={styles.weakChips}>
                    {weakThemes.map(w => (
                      <View key={w.id} style={[styles.themeChip, styles.weakChip]}>
                        <Text style={styles.themeChipText}>
                          {themeName(t, w.id)}
                          <Text style={[styles.weakChipPct, { color: accuracyTint(w.accuracy) }]}>
                            {'  '}{pct(w.accuracy)}
                          </Text>
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ) : FILTER_CATEGORY_IDS.map((categoryId) => (
              <View key={categoryId} style={{ marginBottom: 15 }}>
                <Text style={{ color: PALETTE.primary, fontSize: 12, fontWeight: '900', marginBottom: 8, opacity: 0.8, letterSpacing: 1 }}>
                  {t.themeCategories[categoryId]}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {CHESS_THEMES.filter(th => th.categoryId === categoryId).map((theme) => {
                    const isSelected = tempSelectedThemes.includes(theme.key);
                    return (
                      <TouchableOpacity
                        key={theme.key}
                        onPress={() => handleToggleTheme(theme.key)}
                        style={[styles.themeChip, isSelected && styles.themeChipActive]}
                      >
                        <Text style={[styles.themeChipText, isSelected && styles.themeChipTextActive]}>
                          {themeName(t, theme.key)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity style={[styles.modalBtn, styles.btnCancel]} onPress={onClose}>
              <Text style={styles.btnText}>{t.common.cancel}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modalBtn,
                styles.btnApply,
                isApplyDisabled && { backgroundColor: PALETTE.disabled, opacity: 0.5 }
              ]}
              onPress={() => onApply(tempEloRange, tempSelectedThemes, tempIsRecommendedMode, tempIsWeakFocus)}
              disabled={isApplyDisabled}
            >
              <Text style={styles.btnText}>
                {isBlocked ? "REVISAR FILTROS" : "APLICAR"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
    modalTitle: { color: PALETTE.primary, fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
    modalFooter: { flexDirection: 'row', gap: 12, marginTop: 10 },
    modalBtn: { flex: 1, height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    btnText: { color: PALETTE.accent, fontWeight: '900', fontSize: 14, letterSpacing: 1.5 },
    filterTitle: { color: PALETTE.chipText, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8, marginLeft: '5%' },
    filterModalContent: { width: '95%', maxWidth: MODAL_MAX_WIDTH, height: '90%', backgroundColor: PALETTE.surfaceDark, borderRadius: 30, padding: 25, borderWidth: 1, borderColor: PALETTE.chipBorder },
    filterSection: { marginBottom: 30, alignItems: 'center' },
    availableContainer: { marginTop: 5, backgroundColor: PALETTE.tagBg, paddingVertical: 4, paddingHorizontal: 12, borderRadius: 12 },
    availableBadge: { color: PALETTE.secondary, fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
    // Anidado dentro de availableBadge: hereda el color (azul, o naranja si no
    // quedan disponibles) y se apaga con opacidad en vez de con un gris fijo.
    // Minúsculas y sin tracking para que se note que es secundario.
    solvedNote: { fontSize: 11, fontWeight: '600', textTransform: 'none', letterSpacing: 0.2, opacity: 0.6 },
    sliderMarker: { backgroundColor: '#ffffff', height: 20, width: 20, borderRadius: 10, borderWidth: 2, borderColor: PALETTE.secondary, elevation: 5, shadowColor: '#000000' },
    themeChip: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, backgroundColor: PALETTE.chipBg, marginRight: 10, borderWidth: 1, borderColor: PALETTE.chipBorder },
    themeChipActive: { backgroundColor: PALETTE.chipActiveBg, borderColor: PALETTE.secondary, borderWidth: 2 },
    themeChipTextActive: { color: PALETTE.secondary, fontWeight: '800' },
    themeChipText: { color: PALETTE.chipText, fontSize: 12, fontWeight: '600' },
    btnCancel: { backgroundColor: PALETTE.surfaceLight },
    titleRow: { justifyContent: 'center', alignItems: 'center', marginBottom: 20, minHeight: 36 },
    btnReset: { position: 'absolute', left: 0, width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: PALETTE.surfaceLight },
    btnApply: { backgroundColor: PALETTE.secondary },
    recommendedToggle: {flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', },
    recommendedText: { color: PALETTE.primary, fontSize: 10, fontWeight: '800', marginLeft: 6,},
    recommendedActivePanel: { height: 50, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, borderWidth: 1, borderColor: 'rgba(52, 152, 219, 0.3)', borderStyle: 'dashed',},
    recommendedActiveText: { color: PALETTE.secondary, fontSize: 12, fontWeight: '600', marginLeft: 10, textAlign: 'center', },
    // paddingRight 5%: el interruptor queda en la misma vertical que el de AUTO,
    // cuya fila ocupa el 90% centrado.
    themesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingRight: '5%' },
    // Mismo borde discontinuo que el panel de AUTO: "esto lo decide la app".
    weakPanel: { backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(52, 152, 219, 0.3)', borderStyle: 'dashed', padding: 15, gap: 12 },
    weakPanelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
    weakChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
    // Sin marginRight: aquí el hueco lo pone el gap y el bloque va centrado.
    weakChip: { marginRight: 0 },
    weakChipPct: { fontWeight: '800', fontVariant: ['tabular-nums'] },
    labelsWrapper: { position: 'absolute', top: -25, width: '100%', },
    customLabelBubble: { position: 'absolute', backgroundColor: 'rgba(26, 26, 26, 0.95)', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8,  borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 3, elevation: 5, },
    customLabelText: {color: PALETTE.secondary, fontSize: 13, fontWeight: '800',  fontVariant: ['tabular-nums'], },
});