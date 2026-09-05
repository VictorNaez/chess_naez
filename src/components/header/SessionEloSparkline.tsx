import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { runOnJS, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { PALETTE } from '../colors';

const SPARKLINE_HEIGHT = 80;
const SPARKLINE_LABEL_WIDTH = 30;
const SPARKLINE_RIGHT_PADDING = 12;

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export const SessionEloSparkline = React.memo(({ data, globalElo }: { data: number[]; globalElo: number }) => {
  const [width, setWidth] = useState(0);

  const handleLayout = useCallback((e: any) => {
    const w = e.nativeEvent.layout.width;
    setWidth(prev => (Math.abs(prev - w) > 1 ? w : prev));
  }, []);

  const chartWidth = Math.max(0, width - SPARKLINE_LABEL_WIDTH - SPARKLINE_RIGHT_PADDING);
  const rightEdge = width - SPARKLINE_RIGHT_PADDING;

  const paddingY = 8;
  const drawHeight = SPARKLINE_HEIGHT - paddingY * 2;
  const baselineY = paddingY + drawHeight;

  const guideLines = useMemo(() => {
    let min: number, max: number;

    if (data.length >= 1) {
      const realMin = Math.min(...data);
      const realMax = Math.max(...data);
      const range = realMax - realMin || 60;
      min = realMin - range * 0.1;
      max = realMax + range * 0.1;
    } else {
      min = globalElo - 50;
      max = globalElo + 50;
    }

    const range = max - min || 1;
    return [0, 1 / 3, 2 / 3, 1].map((frac) => ({
      value: Math.round(max - frac * range),
      y: paddingY + frac * drawHeight,
    }));
  }, [data, drawHeight, globalElo]);

  const svgContent = useMemo(() => {
    if (data.length < 2 || chartWidth === 0) return null;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const valueToY = (value: number) => {
      const normalized = (value - min) / range;
      return paddingY + (1 - normalized) * drawHeight;
    };

    const points = data.map((value, index) => ({
      x: SPARKLINE_LABEL_WIDTH + (index / (data.length - 1)) * chartWidth,
      y: valueToY(value),
    }));

    const pathD = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(' ');

    const areaPathD =
      `${pathD} ` +
      `L ${points[points.length - 1].x.toFixed(2)} ${baselineY.toFixed(2)} ` +
      `L ${points[0].x.toFixed(2)} ${baselineY.toFixed(2)} Z`;

    let length = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      length += Math.sqrt(dx * dx + dy * dy);
    }

    return { pathD, areaPathD, length, lineColor: PALETTE.primary, points };
  }, [data, chartWidth, drawHeight, baselineY]);

  const [displayedContent, setDisplayedContent] = useState<typeof svgContent>(null);
  const hasContentRef = useRef(false);
  const pendingRevealRef = useRef(false);

  const eraseX = useSharedValue(0);
  const dashOffset = useSharedValue(0);
  const revealWidth = useSharedValue(0);
  const lastPointScale = useSharedValue(0);

  // Monta el contenido nuevo y lo marca como "pendiente de revelar".
  // La animación NO se lanza aquí a propósito (ver el efecto de abajo).
  const stageContent = useCallback((next: typeof svgContent) => {
    pendingRevealRef.current = true;
    setDisplayedContent(next);
  }, []);

  useEffect(() => {
    if (!svgContent) return;

    if (!hasContentRef.current) {
      hasContentRef.current = true;
      dashOffset.value = svgContent.length;
      revealWidth.value = 0;
      lastPointScale.value = 0;
      stageContent(svgContent);
      return;
    }

    eraseX.value = 0;
    eraseX.value = withTiming(width, { duration: 280 }, (finishedErase) => {
      if (!finishedErase) return;

      dashOffset.value = svgContent.length;
      revealWidth.value = 0;
      lastPointScale.value = 0;

      runOnJS(stageContent)(svgContent);
      eraseX.value = 0;
    });
  }, [svgContent?.pathD, width]);

  // Dibujado: solo DESPUÉS de que el contenido nuevo ya está montado con los
  // valores en estado oculto. Si se lanzara en el mismo tick que el setState,
  // el primer frame se pintaría con el trazo completo (el parpadeo).
  useEffect(() => {
    if (!displayedContent || !pendingRevealRef.current) return;
    pendingRevealRef.current = false;

    dashOffset.value = withTiming(0, { duration: 500 });
    revealWidth.value = withTiming(width, { duration: 500 });
    lastPointScale.value = withDelay(
      420,
      withSequence(withTiming(1.4, { duration: 150 }), withTiming(1, { duration: 130 }))
    );
  }, [displayedContent, width]);

  const eraseWindowStyle = useAnimatedStyle(() => ({ left: eraseX.value }));
  const eraseContentStyle = useAnimatedStyle(() => ({ left: -eraseX.value }));

  const animatedPathProps = useAnimatedProps(() => ({
    strokeDashoffset: dashOffset.value,
  }));

  const revealAnimatedStyle = useAnimatedStyle(() => ({
    width: revealWidth.value,
  }));

  const lastPointAnimatedProps = useAnimatedProps(() => ({
    r: 3 * lastPointScale.value,
  }));

  return (
    <View style={[styles.sparklineContainer, { position: 'relative' }]} onLayout={handleLayout}>
      <Svg width="100%" height={SPARKLINE_HEIGHT}>
        {width > 0 && guideLines.map((g, i) => (
          <React.Fragment key={i}>
            <Line
              x1={SPARKLINE_LABEL_WIDTH} y1={g.y} x2={rightEdge} y2={g.y}
              stroke="rgba(255,255,255,0.08)" strokeWidth={1}
            />
            <SvgText
              x={SPARKLINE_LABEL_WIDTH - 6} y={g.y + 4}
              fontSize={11} fontWeight="600" fill="rgba(255,255,255,0.55)" textAnchor="end"
            >
              {g.value}
            </SvgText>
          </React.Fragment>
        ))}
      </Svg>

      {displayedContent && width > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            { position: 'absolute', top: 0, right: 0, height: SPARKLINE_HEIGHT, overflow: 'hidden' },
            eraseWindowStyle,
          ]}
        >
          <Animated.View style={[{ position: 'absolute', top: 0, width, height: SPARKLINE_HEIGHT }, eraseContentStyle]}>
            <Animated.View
              style={[
                { position: 'absolute', top: 0, left: 0, width: 0, height: SPARKLINE_HEIGHT, overflow: 'hidden' },
                revealAnimatedStyle,
              ]}
            >

              <Svg width={width} height={SPARKLINE_HEIGHT}>
                <Defs>
                  <LinearGradient id="sparklineAreaGradient" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={PALETTE.primary} stopOpacity={0.25} />
                    <Stop offset="1" stopColor={PALETTE.primary} stopOpacity={0} />
                  </LinearGradient>
                </Defs>
                <Path d={displayedContent.areaPathD} fill="url(#sparklineAreaGradient)" stroke="none" />
                {displayedContent.points.slice(0, -1).map((p, i) => (
                  <Circle key={i} cx={p.x} cy={p.y} r={2} fill={displayedContent.lineColor} />
                ))}
              </Svg>
            </Animated.View>

            <Svg width={width} height={SPARKLINE_HEIGHT} style={{ position: 'absolute', top: 0, left: 0 }}>
              <AnimatedPath
                d={displayedContent.pathD}
                stroke={displayedContent.lineColor}
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={`${displayedContent.length},${displayedContent.length}`}
                strokeDashoffset={displayedContent.length}
                animatedProps={animatedPathProps}
              />
              {displayedContent.points.length > 0 && (
                <AnimatedCircle
                  cx={displayedContent.points[displayedContent.points.length - 1].x}
                  cy={displayedContent.points[displayedContent.points.length - 1].y}
                  r={0}
                  fill={displayedContent.lineColor}
                  animatedProps={lastPointAnimatedProps}
                />
              )}
            </Svg>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  sparklineContainer: { flex: 1, height: SPARKLINE_HEIGHT, justifyContent: 'center' },
});