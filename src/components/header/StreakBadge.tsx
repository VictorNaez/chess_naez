import React, { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

export const StreakBadge = React.memo(({ streak }: { streak: number }) => {
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    pulseScale.value = withSequence(
      withTiming(1.22, { duration: 120 }),
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
        <Text style={styles.streakText}>STREAK {streak} 🔥</Text>
      </Animated.View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  streakBadgeWrapper: { alignItems: 'center', width: '100%' },
  streakBadge: { alignSelf: 'center', marginTop: 8, backgroundColor: 'rgba(26, 26, 26, 0.65)', borderRadius: 14, paddingVertical: 6, paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)' },
  streakText: { fontSize: 13, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },
});