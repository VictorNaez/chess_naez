import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { hapticImpact } from '../../lib/haptics';
import { SCREEN_WIDTH } from '../../theme/layout';
import type { AppMode } from '../../types/mode';
import { PALETTE } from '../colors';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface MainMenuModalProps {
  visible: boolean;
  onClose: () => void;
  currentMode: AppMode;
  onSelectMode: (mode: AppMode) => void;
  onOpenSupport: () => void;
  onOpenSettings: () => void;
}

// Nunca ocupa la pantalla entera: el trozo de fondo visible a la derecha es lo
// que comunica "esto está encima, tócalo para volver". El tope de 320 evita que
// en tablets se convierta en media pantalla gigante.
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.68, 320);
const DRAWER_TOP_PAD = Platform.OS === 'ios' ? 60 : 44;

const MODES: { id: AppMode; icon: IoniconName; label: string; available: boolean }[] = [
  { id: 'puzzles', icon: 'extension-puzzle-outline', label: 'Modo puzles',       available: true  },
  { id: 'rush',    icon: 'flash-outline',            label: 'Modo rush',         available: false },
  { id: 'clock',   icon: 'timer-outline',            label: 'Modo contrarreloj', available: true  },
];

// Acciones de análisis: no son modos, no cambian la sesión. Cuando construyas
// cada una, pon available: true y pásale su handler desde index.
const ANALYSIS_ITEMS: { id: string; icon: IoniconName; label: string; available: boolean }[] = [
  { id: 'stats',  icon: 'bar-chart-outline',   label: 'Estadísticas', available: false },
  { id: 'review', icon: 'repeat-outline',      label: 'Repaso',       available: false },
];

// A nivel de módulo a propósito: definida dentro del render, React la trataría
// como un componente nuevo en cada pasada y la remontaría.
const MenuRow = React.memo(({ icon, label, active, disabled, badge, tint, onPress }: {
  icon: IoniconName;
  label: string;
  active?: boolean;
  disabled?: boolean;
  badge?: string;
  tint?: string;
  onPress: () => void;
}) => (
  <Pressable
    style={({ pressed }) => [
      styles.row,
      active && styles.rowActive,
      disabled && styles.rowDisabled,
      pressed && !disabled && styles.rowPressed,
    ]}
    onPress={onPress}
    disabled={disabled}
  >
    <Ionicons
      name={icon}
      size={20}
      color={disabled ? PALETTE.disabled : (tint ?? (active ? PALETTE.secondary : PALETTE.primary))}
      style={styles.rowIcon}
    />
    <Text
      style={[
        styles.rowLabel,
        active && styles.rowLabelActive,
        disabled && styles.rowLabelDisabled,
      ]}
      numberOfLines={1}
    >
      {label}
    </Text>

    {/* El check marca "estás aquí": el modo activo no es una acción que pulsar */}
    {active && <Ionicons name="checkmark" size={18} color={PALETTE.secondary} />}
    {!!badge && !active && (
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{badge}</Text>
      </View>
    )}
  </Pressable>
));

export const MainMenuModal = React.memo(({
  visible,
  onClose,
  currentMode,
  onSelectMode,
  onOpenSupport,
  onOpenSettings,
}: MainMenuModalProps) => {
  // El Modal no puede desmontarse a la vez que 'visible' pasa a false o la
  // animación de salida no llega a verse. Lo apagamos en el callback del timing.
  const [isMounted, setIsMounted] = useState(visible);
  const translateX = useSharedValue(-DRAWER_WIDTH);
  const overlayOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setIsMounted(true);
      overlayOpacity.value = withTiming(1, { duration: 240 });
      translateX.value = withTiming(0, { duration: 240 });
    } else {
      overlayOpacity.value = withTiming(0, { duration: 200 });
      translateX.value = withTiming(-DRAWER_WIDTH, { duration: 200 }, (finished) => {
        if (finished) runOnJS(setIsMounted)(false);
      });
    }
  }, [visible]);

  const drawerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));
  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));

  return (
    <Modal visible={isMounted} animationType="none" transparent onRequestClose={onClose}>
      <View style={styles.root}>
        {/* Fondo oscurecido: cubre todo y cierra al tocarlo */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, overlayStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View style={[styles.drawer, drawerStyle]}>
          <View style={styles.drawerHeader}>
            <Text style={styles.drawerTitle}>MENÚ</Text>
          </View>

          <Text style={styles.sectionTitle}>MODOS</Text>
          {MODES.map(mode => (
            <MenuRow
              key={mode.id}
              icon={mode.icon}
              label={mode.label}
              active={mode.id === currentMode}
              disabled={!mode.available}
              badge={!mode.available ? 'PRONTO' : undefined}
              onPress={() => {
                hapticImpact('light');
                onSelectMode(mode.id);
              }}
            />
          ))}

          <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>ANÁLISIS</Text>
          {ANALYSIS_ITEMS.map(item => (
            <MenuRow
              key={item.id}
              icon={item.icon}
              label={item.label}
              disabled={!item.available}
              badge={!item.available ? 'PRONTO' : undefined}
              onPress={() => { /* pendiente: abrir estadísticas / repaso */ }}
            />
          ))}

          {/* Empuja ayudas y ajustes al fondo del drawer */}
          <View style={styles.spacer} />

          <View style={styles.divider} />

          <MenuRow
            icon="heart-outline"
            label="Donaciones"
            tint={PALETTE.error}
            onPress={() => { hapticImpact('light'); onOpenSupport(); }}
          />
          <MenuRow
            icon="settings-outline"
            label="Ajustes"
            onPress={() => { hapticImpact('light'); onOpenSettings(); }}
          />
        </Animated.View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: { backgroundColor: 'rgba(0,0,0,0.6)' },

  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: DRAWER_WIDTH,
    backgroundColor: PALETTE.surfaceDark,
    paddingTop: DRAWER_TOP_PAD,
    paddingBottom: Platform.OS === 'ios' ? 60 : 48,
    paddingHorizontal: 10,
    borderRightWidth: 1,
    borderRightColor: PALETTE.chipBorder,
    elevation: 16,
    shadowColor: '#000000',
  },

  drawerHeader: { paddingHorizontal: 14, paddingBottom: 18 },
  drawerTitle: { color: PALETTE.primary, fontSize: 18, fontWeight: '900', letterSpacing: 2 },

  sectionTitle: {
    color: PALETTE.chipText,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 6,
    marginLeft: 14,
  },

  sectionTitleSpaced: { marginTop: 18 },
  spacer: { flex: 1},
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 14, borderRadius: 12 },
  rowActive: { backgroundColor: PALETTE.chipActiveBg },
  rowPressed: { backgroundColor: PALETTE.chipBg },
  rowDisabled: { opacity: 0.55 },
  rowIcon: { width: 30 },
  rowLabel: { flex: 1, minWidth: 0, color: PALETTE.primary, fontSize: 14, fontWeight: '700' },
  rowLabelActive: { color: PALETTE.secondary, fontWeight: '900' },
  rowLabelDisabled: { color: PALETTE.disabled },

  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 10, marginHorizontal: 14 },

  badge: { backgroundColor: PALETTE.chipBg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: PALETTE.chipBorder },
  badgeText: { color: PALETTE.chipText, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
});