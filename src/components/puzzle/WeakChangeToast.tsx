import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useT } from '../../i18n/I18nProvider';
import { PUZZLE_TIMING } from '../../lib/timing';
import type { WeakChange } from '../../lib/weakThemes';
import { themeName } from '../chess_themes';
import { PALETTE } from '../colors';
import { accuracyTint } from '../stats/StatPrimitives';

// =========================================================
// AVISO "CÓMO HA CAMBIADO TU PUNTO DÉBIL"
// =========================================================
// Sale sobre el tablero al acertar o fallar un puzle en modo puntos débiles.
// Lo único que se mueve de verdad es la cifra: cuenta desde la precisión de
// antes hasta la de ahora, y el color cambia en directo si cruza un umbral
// (rojo <-> ámbar en el 50%). Al final salta la diferencia: verde y hacia
// arriba si acertaste, roja y hacia abajo si fallaste. Mismo movimiento en los
// dos casos; lo que cambia es el sentido y el color.
//
// No intercepta toques (pointerEvents="none"): tras el veredicto el tablero
// sigue siendo usable (analizar, ver la solución), y el aviso tapa la franja
// de arriba unos segundos.
//
// Se desmonta solo al terminar (onDone). Si antes se pasa al siguiente puzle,
// quien lo pinta deja de hacerlo y la animación muere con él.

interface WeakChangeToastProps {
  changes: WeakChange[];
  onDone: () => void;
}

// Con historiales largos un intento mueve la precisión muy poco: 0,58/501 =
// 0,12 puntos al acertar con 500 intentos de un tema al 42% (y 0,08 al fallar).
// Por debajo de 0,1 un decimal enseñaría "42,3% -> 42,3%" y "0,0", así que ahí
// se pasa a dos.
const digitsFor = (g: WeakChange) => (Math.abs(g.after - g.before) * 100 >= 0.1 ? 1 : 2);

const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

export const WeakChangeToast = React.memo(function WeakChangeToast({ changes, onDone }: WeakChangeToastProps) {
  const t = useT();
  const reduceMotion = useReducedMotion();
  const { weakChangeDelay, weakChangeCount, weakChangeHold } = PUZZLE_TIMING;

  // 0 -> 1 durante la cuenta. En JS y no en el hilo de UI: animar texto en
  // Reanimated obliga al truco del TextInput, y aquí son ~40 fotogramas de un
  // componente de dos líneas.
  const [progress, setProgress] = useState(reduceMotion ? 1 : 0);

  const opacity = useSharedValue(0);
  const lift = useSharedValue(reduceMotion ? 0 : 10);
  const pop = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    const fadeIn = withTiming(1, { duration: 180 });
    const fadeOut = withTiming(0, { duration: 260 }, finished => {
      if (finished) runOnJS(onDone)();
    });
    const visibleFor = weakChangeCount + weakChangeHold;

    opacity.value = withSequence(withDelay(weakChangeDelay, fadeIn), withDelay(visibleFor, fadeOut));
    if (reduceMotion) return;

    lift.value = withSequence(
      withDelay(weakChangeDelay, withTiming(0, { duration: 260, easing: Easing.out(Easing.back(1.6)) })),
      withDelay(visibleFor - 80, withTiming(-8, { duration: 260 })),
    );
    // La diferencia aparece cuando la cuenta llega al final: primero ves
    // moverse la cifra y luego cuánto ha sido.
    pop.value = withDelay(
      weakChangeDelay + weakChangeCount,
      withSequence(withTiming(1.2, { duration: 130 }), withTiming(1, { duration: 150 })),
    );

    let frame = 0;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const x = Math.min(1, (now - start) / weakChangeCount);
      setProgress(easeOut(x));
      if (x < 1) frame = requestAnimationFrame(tick);
    };
    const timer = setTimeout(() => { frame = requestAnimationFrame(tick); }, weakChangeDelay);
    return () => { clearTimeout(timer); cancelAnimationFrame(frame); };
    // Una sola secuencia por montaje: quien lo pinta le da una key por puzle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: lift.value }],
  }));
  const popStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.value),
    transform: [{ scale: pop.value }],
  }));

  const a11y = changes
    .map(g => {
      const d = digitsFor(g);
      const say = g.after >= g.before ? t.filters.weakGainA11y : t.filters.weakLossA11y;
      return say(
        themeName(t, g.id),
        `${t.common.decimal(g.before * 100, d)}%`,
        `${t.common.decimal(g.after * 100, d)}%`,
      );
    })
    .join('. ');

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.toast, containerStyle]}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={a11y}
    >
      <Ionicons name="locate" size={18} color={PALETTE.secondary} />
      <View style={styles.rows}>
        {changes.map(g => {
          const d = digitsFor(g);
          const up = g.after >= g.before;
          const shown = g.before + (g.after - g.before) * progress;
          return (
            <View key={g.id} style={styles.row}>
              <Text style={styles.theme} numberOfLines={1}>{themeName(t, g.id)}</Text>
              <Text style={[styles.value, { color: accuracyTint(shown) }]}>
                {t.common.decimal(shown * 100, d)}%
              </Text>
              <Animated.View style={[styles.delta, up ? styles.deltaUp : styles.deltaDown, popStyle]}>
                <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={11} color={up ? PALETTE.success : PALETTE.error} />
                <Text style={[styles.deltaText, { color: up ? PALETTE.success : PALETTE.error }]}>
                  {t.common.decimal(Math.abs(g.after - g.before) * 100, d)}
                </Text>
              </Animated.View>
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  // Mismo cristal oscuro que StreakBadge y EloBadge: es de la familia de los
  // avisos de progreso, no un modal.
  toast: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: '92%',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(26, 26, 26, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(77, 171, 247, 0.35)',   // PALETTE.secondary, el azul del filtro
    zIndex: 10,
    elevation: 6,
  },
  rows: { gap: 4, flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  theme: { color: PALETTE.primary, fontSize: 13, fontWeight: '700', flexShrink: 1 },
  value: { fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  delta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  deltaUp: { backgroundColor: 'rgba(54, 171, 74, 0.16)' },     // PALETTE.success
  deltaDown: { backgroundColor: 'rgba(255, 107, 107, 0.16)' }, // PALETTE.error
  deltaText: { fontSize: 11, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
