import { Ionicons } from '@expo/vector-icons';
import MultiSlider from '@ptomasroos/react-native-multi-slider';
import * as SQLite from 'expo-sqlite';
import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { arraysEqualUnordered, buildThemeCondition, getRecommendedRange } from '../../lib/puzzleQueries';
import { SCREEN_WIDTH } from '../../theme/layout';
import { CHESS_THEMES, RADAR_CATEGORIES } from '../chess_themes';
import { PALETTE } from '../colors';

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
  const [tempEloRange, setTempEloRange] = useState<[number, number]>(currentEloRange);
  const [tempSelectedThemes, setTempSelectedThemes] = useState<string[]>(currentSelectedThemes);
  const [tempIsRecommendedMode, setTempIsRecommendedMode] = useState(currentIsRecommendedMode);
  const [isSliding, setIsSliding] = useState(false);
  const [tempAvailableCount, setTempAvailableCount] = useState(0);

  // Al abrir el modal, sincronizamos el estado temporal con el real.
  // Así cada apertura arranca "limpia", sin arrastrar ediciones canceladas.
  useEffect(() => {
    if (visible) {
      setTempEloRange(currentEloRange);
      setTempSelectedThemes(currentSelectedThemes);
      setTempIsRecommendedMode(currentIsRecommendedMode);
    }
  }, [visible]);

  // Contador de puzzles disponibles en tiempo real mientras se edita
  useEffect(() => {
    if (!db || !visible) return;
    let cancelled = false;

    (async () => {
      const res = await db.getFirstAsync<{ total: number }>(
        `SELECT COUNT(*) as total FROM puzzles WHERE rating BETWEEN ? AND ? ${buildThemeCondition(tempSelectedThemes)}`,
        [tempEloRange[0], tempEloRange[1]]
      );
      if (!cancelled) setTempAvailableCount(res?.total || 0);
    })();

    return () => { cancelled = true; };
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
      setTempEloRange(getRecommendedRange(globalElo));
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
          <Text style={styles.modalTitle}>FILTERS</Text>

          <View style={[styles.availableContainer, { alignSelf: 'center', marginBottom: 20 }]}>
            <Text style={[
              styles.availableBadge,
              tempAvailableCount === 0 && { color: PALETTE.warning }
            ]}>
              {tempAvailableCount === 0 ? "SIN PUZZLES DISPONIBLES" : `${tempAvailableCount} PUZZLES ENCONTRADOS`}
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
                  sliderLength={SCREEN_WIDTH * 0.75}
                  onValuesChangeStart={() => setIsSliding(true)}
                  onValuesChangeFinish={(values) => {
                    setIsSliding(false);
                    setTempEloRange(values as [number, number]);
                  }}
                  min={400}
                  max={3000}
                  step={50}
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
                  Nivel dinámico basado en tu progreso actual
                </Text>
              </View>
            )}
          </View>

          <Text style={styles.filterTitle}>TEMAS TÁCTICOS</Text>

          <ScrollView showsVerticalScrollIndicator={false} style={{ width: '100%' }}>
            {RADAR_CATEGORIES.map((category) => (
              <View key={category.id} style={{ marginBottom: 15 }}>
                <Text style={{ color: PALETTE.primary, fontSize: 12, fontWeight: '900', marginBottom: 8, opacity: 0.8, letterSpacing: 1 }}>
                  {category.name}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {CHESS_THEMES.filter(t => t.category === category.id).map((theme) => {
                    const isSelected = tempSelectedThemes.includes(theme.id);
                    return (
                      <TouchableOpacity
                        key={theme.id}
                        onPress={() => handleToggleTheme(theme.id)}
                        style={[styles.themeChip, isSelected && styles.themeChipActive]}
                      >
                        <Text style={[styles.themeChipText, isSelected && styles.themeChipTextActive]}>
                          {theme.name}
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
              <Text style={styles.btnText}>CANCELAR</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modalBtn,
                styles.btnApply,
                (tempAvailableCount === 0 || !hasFilterChanges) && { backgroundColor: PALETTE.disabled, opacity: 0.5 }
              ]}
              onPress={() => onApply(tempEloRange, tempSelectedThemes, tempIsRecommendedMode)}
              disabled={tempAvailableCount === 0 || !hasFilterChanges}
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
    filterModalContent: { width: '95%', height: '90%', backgroundColor: PALETTE.surfaceDark, borderRadius: 30, padding: 25, borderWidth: 1, borderColor: PALETTE.chipBorder },
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