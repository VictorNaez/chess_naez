import React, { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

export const StreakBadge = React.memo(function StreakBadge({ streak }: { streak: number }) {
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    // 1.12 y no 1.22: ahora va pegado al borde inferior de la fila de ELO,
    // que recorta (overflow hidden), y a la sparkline por la derecha.
    pulseScale.value = withSequence(
      withTiming(1.12, { duration: 120 }),
      withTiming(1, { duration: 180 })
    );
  }, [streak]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(250).springify().damping(14)}
      exiting={FadeOut.duration(150)}
      style={styles.streakBadgeWrapper}
    >
      <Animated.View style={[styles.streakBadge, pulseStyle]}>
        <Text style={styles.streakText} numberOfLines={1}>🔥 {streak}</Text>
      </Animated.View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  // Va debajo del badge de ELO y con su mismo ancho (columna de la fila de ELO):
  // mismo fondo y borde, pero bajo (~20 dp) para que los dos quepan en 76.
  streakBadgeWrapper: { alignSelf: 'stretch' },
  streakBadge: { alignItems: 'center', backgroundColor: 'rgba(26, 26, 26, 0.65)', borderRadius: 10, paddingVertical: 2, paddingHorizontal: 8, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)' },
  streakText: { fontSize: 12, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },
});