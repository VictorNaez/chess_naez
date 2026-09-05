import { Ionicons } from '@expo/vector-icons';
import MultiSlider from '@ptomasroos/react-native-multi-slider';
import React, { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { AppSettings, DEFAULT_SETTINGS, useSettings } from '../../hooks/useSettings';
import { SCREEN_WIDTH } from '../../theme/layout';
import { PALETTE } from '../colors';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  onPreviewSound?: () => void;   // para oír el volumen al soltar el slider
}

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// --- FILAS REUTILIZABLES ---
// Definidas a nivel de módulo a propósito: dentro del render, React las trataría
// como componentes nuevos en cada pasada y las remontaría.

const ToggleRow = React.memo(({ icon, label, hint, value, onChange, disabled }: {
  icon: IoniconName; label: string; hint?: string;
  value: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) => (
  <View style={[styles.row, disabled && { opacity: 0.4 }]}>
    <View style={styles.rowLeft}>
      <Ionicons name={icon} size={18} color={PALETTE.secondary} style={styles.rowIcon} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {!!hint && <Text style={styles.rowHint}>{hint}</Text>}
      </View>
    </View>
    <Switch
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      trackColor={{ false: PALETTE.surfaceLight, true: PALETTE.secondary }}
      thumbColor="#ffffff"
      ios_backgroundColor={PALETTE.surfaceLight}
    />
  </View>
));

const SegmentedRow = React.memo(({ label, hint, options, value, onChange }: {
  label: string; hint?: string;
  options: { label: string; value: number }[];
  value: number; onChange: (v: number) => void;
}) => (
  <View style={styles.segmentedBlock}>
    <Text style={styles.rowLabel}>{label}</Text>
    {!!hint && <Text style={styles.rowHint}>{hint}</Text>}
    <View style={styles.segmentedRow}>
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[styles.segment, active && styles.segmentActive]}
            onPress={() => onChange(opt.value)}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  </View>
));

export const SettingsModal = React.memo(({ visible, onClose, onPreviewSound }: SettingsModalProps) => {
  const {
    soundEnabled, volume, hapticsEnabled, showTimer, showLegalMoves,
    engineDepth, engineMultiPV, setSetting, resetSettings,
  } = useSettings();

  // Los sliders se editan en local y se confirman al soltar: si escribiéramos en
  // los ajustes en cada frame del arrastre, cada frame acabaría en AsyncStorage.
  const [tempVolume, setTempVolume] = useState(Math.round(volume * 100));
  const [tempDepth, setTempDepth] = useState(engineDepth);

  // Foto de los ajustes al abrir. Como todo se aplica en vivo, "Cancelar"
  // necesita esta referencia para revertir lo tocado en esta sesión.
  const snapshotRef = useRef<Omit<AppSettings, 'engineHash'> | null>(null);

  useEffect(() => {
    if (visible) {
      snapshotRef.current = {
        soundEnabled, volume, hapticsEnabled, showTimer, showLegalMoves,
        engineDepth, engineMultiPV,
      };
      setTempVolume(Math.round(volume * 100));
      setTempDepth(engineDepth);
    }
  }, [visible]);

  const handleReset = () => {
    resetSettings();
    setTempVolume(Math.round(DEFAULT_SETTINGS.volume * 100));
    setTempDepth(DEFAULT_SETTINGS.engineDepth);
  };

  // Revierte a la foto y cierra. Los setSetting encadenados van por updater
  // (prev => ...), así que React los agrupa en un único re-render y una sola
  // escritura a AsyncStorage.
  const handleCancel = () => {
    const snap = snapshotRef.current;
    if (snap) {
      setSetting('soundEnabled', snap.soundEnabled);
      setSetting('volume', snap.volume);
      setSetting('hapticsEnabled', snap.hapticsEnabled);
      setSetting('showTimer', snap.showTimer);
      setSetting('showLegalMoves', snap.showLegalMoves);
      setSetting('engineDepth', snap.engineDepth);
      setSetting('engineMultiPV', snap.engineMultiPV);
    }
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={handleCancel}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.resetBtn}
              onPress={handleReset}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="refresh-outline" size={13} color={PALETTE.chipText} />
              <Text style={styles.resetBtnText}>Restablecer</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>AJUSTES</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ width: '100%' }}>

            {/* --- SONIDO --- */}
            <Text style={styles.sectionTitle}>SONIDO</Text>
            <View style={styles.card}>
              <ToggleRow
                icon="volume-high-outline"
                label="Efectos de sonido"
                value={soundEnabled}
                onChange={(v) => setSetting('soundEnabled', v)}
              />

              <View style={[styles.volumeBlock, !soundEnabled && { opacity: 0.35 }]}>
                <View style={styles.volumeHeader}>
                  <Text style={styles.rowHint}>Volumen</Text>
                  <Text style={styles.volumeValue}>{tempVolume}%</Text>
                </View>
                <View pointerEvents={soundEnabled ? 'auto' : 'none'} style={{ alignItems: 'center' }}>
                  <MultiSlider
                    values={[tempVolume]}
                    sliderLength={SCREEN_WIDTH * 0.66}
                    min={0}
                    max={100}
                    step={5}
                    snapped
                    onValuesChange={(vals) => setTempVolume(vals[0])}
                    onValuesChangeFinish={(vals) => {
                      setSetting('volume', vals[0] / 100);
                      if (vals[0] > 0) onPreviewSound?.();
                    }}
                    selectedStyle={{ backgroundColor: PALETTE.secondary }}
                    trackStyle={{ height: 4, backgroundColor: 'rgba(255,255,255,0.1)' }}
                    markerStyle={styles.sliderMarker}
                  />
                </View>
              </View>
            </View>

            {/* --- VIBRACIÓN --- */}
            <Text style={styles.sectionTitle}>VIBRACIÓN</Text>
            <View style={styles.card}>
              <ToggleRow
                icon="phone-portrait-outline"
                label="Vibración"
                hint="Feedback al mover, capturar, acertar o fallar"
                value={hapticsEnabled}
                onChange={(v) => setSetting('hapticsEnabled', v)}
              />
            </View>

            {/* --- TABLERO --- */}
            <Text style={styles.sectionTitle}>TABLERO</Text>
            <View style={styles.card}>
              <ToggleRow
                icon="time-outline"
                label="Cronómetro"
                hint="El tiempo se sigue registrando aunque lo ocultes"
                value={showTimer}
                onChange={(v) => setSetting('showTimer', v)}
              />
              <View style={styles.divider} />
              <ToggleRow
                icon="radio-button-on-outline"
                label="Movimientos legales"
                hint="Muestra los movimientos legales de la pieza seleccionada"
                value={showLegalMoves}
                onChange={(v) => setSetting('showLegalMoves', v)}
              />
            </View>

            {/* --- MOTOR --- */}
            <Text style={styles.sectionTitle}>MOTOR (STOCKFISH)</Text>
            <View style={styles.card}>
              <View style={styles.depthBlock}>
                <View style={styles.volumeHeader}>
                  <Text style={styles.rowLabel}>Profundidad de análisis</Text>
                  <Text style={styles.volumeValue}>{tempDepth}</Text>
                </View>
                <Text style={styles.rowHint}>
                  A mayor profundidad, mejores jugadas pero más lento y más batería
                </Text>
                <View style={styles.depthSliderWrap}>
                  <View style={styles.depthGuide}>
                    <Text style={[styles.depthGuideText, { textAlign: 'left' }]}>RÁPIDO</Text>
                    <Text style={[styles.depthGuideText, { textAlign: 'center' }]}>NORMAL</Text>
                    <Text style={[styles.depthGuideText, { textAlign: 'right' }]}>PROFUNDO</Text>
                  </View>
                  <MultiSlider
                    values={[tempDepth]}
                    sliderLength={SCREEN_WIDTH * 0.78}
                    min={10}
                    max={25}
                    step={1}
                    snapped
                    onValuesChange={(vals) => setTempDepth(vals[0])}
                    onValuesChangeFinish={(vals) => setSetting('engineDepth', vals[0])}
                    selectedStyle={{ backgroundColor: PALETTE.secondary }}
                    trackStyle={{ height: 4, backgroundColor: 'rgba(255,255,255,0.1)' }}
                    markerStyle={styles.sliderMarker}
                  />
                </View>
              </View>
              <View style={styles.divider} />
              <SegmentedRow
                label="Líneas de análisis"
                hint="Variantes que muestra el motor a la vez"
                value={engineMultiPV}
                onChange={(v) => setSetting('engineMultiPV', v)}
                options={[
                  { label: '1', value: 1 },
                  { label: '2', value: 2 },
                  { label: '3', value: 3 },
                ]}
              />
            </View>

          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity style={[styles.modalBtn, styles.btnCancel]} onPress={handleCancel}>
              <Text style={styles.btnText}>CANCELAR</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalBtn, styles.btnApply]} onPress={onClose}>
              <Text style={styles.btnText}>GUARDAR</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '95%', maxHeight: '90%', backgroundColor: PALETTE.surfaceDark, borderRadius: 30, padding: 25, borderWidth: 1, borderColor: PALETTE.chipBorder },

  modalHeader: { justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  modalTitle: { color: PALETTE.primary, fontSize: 20, fontWeight: 'bold', textAlign: 'center' },
  resetBtn: { position: 'absolute', left: 0, flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 6 },
  resetBtnText: { color: PALETTE.chipText, fontSize: 11, fontWeight: '700' },

  sectionTitle: { color: PALETTE.chipText, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)' },

  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 },
  rowIcon: { width: 24 },
  rowLabel: { color: PALETTE.primary, fontSize: 14, fontWeight: '700' },
  rowHint: { color: PALETTE.chipText, fontSize: 11, marginTop: 2, opacity: 0.8 },

  volumeBlock: { paddingBottom: 14, paddingTop: 2 },
  volumeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, paddingHorizontal: 2 },
  volumeValue: { color: PALETTE.secondary, fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sliderMarker: { backgroundColor: '#ffffff', height: 20, width: 20, borderRadius: 10, borderWidth: 2, borderColor: PALETTE.secondary, elevation: 5, shadowColor: '#000000' },

  depthBlock: { paddingVertical: 12 },
  depthSliderWrap: { width: SCREEN_WIDTH * 0.78, alignSelf: 'center', marginTop: 10 },
  depthGuide: { flexDirection: 'row', marginBottom: 2 },
  depthGuideText: { flex: 1, color: PALETTE.chipText, fontSize: 10, fontWeight: '800', letterSpacing: 0.5, opacity: 0.85 },

  segmentedBlock: { paddingVertical: 12 },
  segmentedRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  // minWidth: 0 obligatorio: sin él, el ancho intrínseco del texto se impone
  // al flex y los 3 segmentos dejan de repartirse el espacio a partes iguales.
  segment: { flex: 1, minWidth: 0, paddingVertical: 9, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: PALETTE.chipBg, borderWidth: 1, borderColor: PALETTE.chipBorder },
  segmentActive: { backgroundColor: PALETTE.chipActiveBg, borderColor: PALETTE.secondary, borderWidth: 2 },
  segmentText: { color: PALETTE.chipText, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  segmentTextActive: { color: PALETTE.secondary, fontWeight: '900' },

  modalFooter: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalBtn: { flex: 1, minWidth: 0, height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  btnCancel: { backgroundColor: PALETTE.surfaceLight },
  btnApply: { backgroundColor: PALETTE.secondary },
  btnText: { color: PALETTE.accent, fontWeight: '900', fontSize: 13, letterSpacing: 1.2 },
});
