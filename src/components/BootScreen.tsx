import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue,
  withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { useI18n } from '../i18n/I18nProvider';
import { PALETTE } from './colors';

// =========================================================
// PANTALLA DE ARRANQUE
// =========================================================
// Tapa el hueco entre que el splash del sistema desaparece y el tablero tiene
// datos que pintar. Antes ahí se veían los esqueletos de la interfaz, que en un
// arranque normal está bien, pero en una instalación limpia (65 MB de catálogo
// copiándose del APK) daban la sensación de app colgada.
//
// El fondo y el logo son los del splash nativo a propósito: así el relevo entre
// los dos no se nota, y lo que el usuario ve es una sola pantalla que respira.
//
// El mensaje explicativo NO sale de entrada. Aparece solo si la espera se
// alarga, que es justo cuando hace falta explicar algo. Un arranque rápido no
// llega a enseñarlo nunca, y así no hay que preguntarle a nadie si esta es la
// primera vez que se abre la app.
const EXPLAIN_AFTER_MS = 2500;
const FADE_OUT_MS = 260;

interface BootScreenProps {
  /** false en cuanto la pantalla de verdad tiene datos: entonces se desvanece. */
  visible: boolean;
}

export const BootScreen = React.memo(({ visible }: BootScreenProps) => {
  const { t } = useI18n();
  const { width } = useWindowDimensions();

  // Se mantiene montada durante el fundido: desmontarla al instante sería un
  // corte seco justo en el momento más visible.
  const [mounted, setMounted] = useState(true);
  const [explain, setExplain] = useState(false);

  const opacity = useSharedValue(1);
  const pulse = useSharedValue(0);
  const slide = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
    slide.value = withRepeat(
      withDelay(120, withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.cubic) })),
      -1,
      false,
    );
    return () => { cancelAnimation(pulse); cancelAnimation(slide); };
  }, [pulse, slide]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setExplain(true), EXPLAIN_AFTER_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  useEffect(() => {
    if (visible) return;
    opacity.value = withTiming(0, { duration: FADE_OUT_MS }, () => {
      // Las animaciones en bucle seguirían corriendo detrás de una vista
      // invisible: desmontar es lo que de verdad las para.
    });
    const timer = setTimeout(() => setMounted(false), FADE_OUT_MS + 40);
    return () => clearTimeout(timer);
  }, [visible, opacity]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const logoStyle = useAnimatedStyle(() => ({
    opacity: 0.75 + pulse.value * 0.25,
    transform: [{ scale: 0.98 + pulse.value * 0.04 }],
  }));

  const barWidth = Math.min(width * 0.42, 220);
  const chunkWidth = barWidth * 0.45;
  // El recorrido va de fuera a fuera: arranca con la pieza escondida por la
  // izquierda y termina con ella escondida por la derecha, así que son el ancho
  // del carril MÁS el de la pieza. Con un recorrido más corto, la barra parecía
  // frenar antes de llegar al final y daba sensación de proceso atascado.
  const travel = barWidth + chunkWidth;
  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -chunkWidth + slide.value * travel }],
  }));

  if (!mounted) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.container, containerStyle]} pointerEvents="auto">
      <Animated.View style={logoStyle}>
        <Image
          source={require('../../assets/images/splash-icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>

      <View style={[styles.track, { width: barWidth }]}>
        <Animated.View style={[styles.bar, { width: chunkWidth }, trackStyle]} />
      </View>

      {/* El hueco se reserva siempre para que la aparición del texto no
          desplace el logo hacia arriba. */}
      <View style={styles.messageSlot}>
        {explain && <Text style={styles.message}>{t.common.preparing}</Text>}
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  // El mismo color de fondo que el splash nativo de app.json.
  container: { backgroundColor: '#070A11', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  logo: { width: 200, height: 200 },
  track: {
    height: 3,
    borderRadius: 2,
    marginTop: 26,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  bar: { height: 3, borderRadius: 2, backgroundColor: PALETTE.secondary },
  messageSlot: { height: 28, justifyContent: 'center', marginTop: 14 },
  message: { color: PALETTE.chipText, fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },
});
