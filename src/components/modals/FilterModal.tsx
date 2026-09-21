import { Ionicons } from '@expo/vector-icons';
import MultiSlider from '@ptomasroos/react-native-multi-slider';
import * as SQLite from 'expo-sqlite';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { countSolvedPuzzles } from '../../data/puzzleStats';
import { useT } from '../../i18n/I18nProvider';
import { arraysEqualUnordered, countPuzzles, getRecommendedRange, readCatalogRatingRange } from '../../lib/puzzleQueries';
import { MODAL_MAX_WIDTH, MODAL_WIDTH_RATIO, modalWidthFor } from '../../theme/responsive';
import { CHESS_THEMES, FILTER_CATEGORY_IDS, themeName } from '../chess_themes';
import { PALETTE } from '../colors';

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
  globalElo: number;
  onApply: (eloRange: [number, number], selectedThemes: string[], isRecommendedMode: boolean) => void;
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
  const [isSliding, setIsSliding] = useState(false);
  // Disponibles = cumplen el filtro Y no los has resuelto: son los que te
  // puede servir el tablero. Si llega a 0 con resueltos > 0, aplicar solo
  // llevaría al aviso de "todos resueltos", así que APLICAR se desactiva igual
  // que con un filtro vacío.
  const [tempAvailableCount, setTempAvailableCount] = useState(0);
  const [tempSolvedCount, setTempSolvedCount] = useState(0);
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
    }
  }, [visible]);

  // Contador de puzzles disponibles en tiempo real mientras se edita.
  //
  // countPuzzles responde desde las tablas precalculadas cuando puede (rango en
  // bandas enteras y como mucho un tema), y ahí es instantáneo. Con dos o más
  // temas la intersección no se puede precalcular y toca escanear con la
  // máscara, así que va con debounce: a 1M de filas ese escaneo ronda el
  // segundo en un móvil de gama media, y el slider dispara este efecto en cada
  // pixel que se arrastra.
  useEffect(() => {
    if (!db || !visible) return;
    let cancelled = false;

    const lanzar = () => {
      setContando(true);
      Promise.all([
        countPuzzles(db, tempEloRange as [number, number], tempSelectedThemes),
        countSolvedPuzzles(db, tempEloRange, tempSelectedThemes),
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

    if (tempSelectedThemes.length <= 1) {
      lanzar();
      return () => { cancelled = true; };
    }
    setContando(true);   // el spinner entra ya, antes del debounce
    const id = setTimeout(lanzar, 250);
    return () => { cancelled = true; clearTimeout(id); };
  }, [tempEloRange, tempSelectedThemes, visible, db]);

  const hasFilterChanges =
    tempEloRange[0] !== currentEloRange[0] ||
    tempEloRange[1] !== currentEloRange[1] ||
    tempIsRecommendedMode !== currentIsRecommendedMode ||
    !arraysEqualUnordered(tempSelectedThemes, currentSelectedThemes);

  const handleToggleRecommended = () => {
    const nextMode = !tempIsRecommendedMode;
    setTempIsRecommendedMode(nextMode);
    if (nextMode) {
      setTempEloRange(getRecommendedRange(globalElo, limites));
    }
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
          <Text style={styles.modalTitle}>{t.puzzle.filters}</Text>

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
                : tempAvailableCount === 0 && tempSolvedCount === 0
                  ? t.filters.noneAvailable
                  : t.filters.available(tempAvailableCount, tempSolvedCount)}
            </Text>
          </View>

          <View style={styles.filterSection}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, width: '90%' }}>
              <Text style={[styles.filterTitle, { marginBottom: 0 }]}>
                PUZZLE ELO: {tempEloRange[0]} — {tempEloRange[1]}
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

          <Text style={styles.filterTitle}>{t.filters.themesTitle}</Text>

          <ScrollView showsVerticalScrollIndicator={false} style={{ width: '100%' }}>
            {FILTER_CATEGORY_IDS.map((categoryId) => (
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
                (contando || tempAvailableCount === 0 || !hasFilterChanges) && { backgroundColor: PALETTE.disabled, opacity: 0.5 }
              ]}
              onPress={() => onApply(tempEloRange, tempSelectedThemes, tempIsRecommendedMode)}
              disabled={contando || tempAvailableCount === 0 || !hasFilterChanges}
            >
              <Text style={styles.btnText}>
                {tempAvailableCount === 0 ? "REVISAR FILTROS" : "APLICAR"}
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
    availableBadge: { color: PALETTE.secondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    sliderMarker: { backgroundColor: '#ffffff', height: 20, width: 20, borderRadius: 10, borderWidth: 2, borderColor: PALETTE.secondary, elevation: 5, shadowColor: '#000000' },
    themeChip: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, backgroundColor: PALETTE.chipBg, marginRight: 10, borderWidth: 1, borderColor: PALETTE.chipBorder },
    themeChipActive: { backgroundColor: PALETTE.chipActiveBg, borderColor: PALETTE.secondary, borderWidth: 2 },
    themeChipTextActive: { color: PALETTE.secondary, fontWeight: '800' },
    themeChipText: { color: PALETTE.chipText, fontSize: 12, fontWeight: '600' },
    btnCancel: { backgroundColor: PALETTE.surfaceLight },
    btnApply: { backgroundColor: PALETTE.secondary },
    recommendedToggle: {flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', },
    recommendedText: { color: PALETTE.primary, fontSize: 10, fontWeight: '800', marginLeft: 6,},
    recommendedActivePanel: { height: 50, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, borderWidth: 1, borderColor: 'rgba(52, 152, 219, 0.3)', borderStyle: 'dashed',},
    recommendedActiveText: { color: PALETTE.secondary, fontSize: 12, fontWeight: '600', marginLeft: 10, textAlign: 'center', },
    labelsWrapper: { position: 'absolute', top: -25, width: '100%', },
    customLabelBubble: { position: 'absolute', backgroundColor: 'rgba(26, 26, 26, 0.95)', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8,  borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 3, elevation: 5, },
    customLabelText: {color: PALETTE.secondary, fontSize: 13, fontWeight: '800',  fontVariant: ['tabular-nums'], },
});