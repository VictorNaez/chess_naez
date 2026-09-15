import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Única fuente de verdad del tamaño de pantalla. Sustituye al antiguo
// theme/layout.ts, que leía Dimensions.get('window') una sola vez al importar:
// el valor quedaba congelado y no reaccionaba a rotación, pantalla dividida ni
// plegables.

/** Ancho (dp) del móvil de referencia sobre el que se diseñó la UI. Hasta aquí, escala 1. */
export const BASE_WIDTH = 411;

/** Tope del factor de escala: una tablet de 800 dp no debe duplicar botones y textos. */
export const MAX_UI_SCALE = 1.4;

/**
 * Qué parte del crecimiento se aplica. Con 0.75 y la escala al tope (1.4), un
 * elemento crece un 30%. Cada dp que crecen los controles se le quita al
 * tablero en pantallas limitadas por altura, así que no conviene escalar a lo bruto.
 */
const SCALE_STRENGTH = 0.75;

/** Ancho máximo de los modales grandes (filtros, ajustes, historial, estadísticas...). */
export const MODAL_MAX_WIDTH = 600;

/** Fracción del ancho de ventana que ocupan los modales grandes en móvil. */
export const MODAL_WIDTH_RATIO = 0.95;

export function uiScaleForWidth(width: number): number {
  return Math.min(Math.max(width / BASE_WIDTH, 1), MAX_UI_SCALE);
}

export function scaleSize(n: number, uiScale: number): number {
  return Math.round(n * (1 + (uiScale - 1) * SCALE_STRENGTH));
}

/** Ancho real de un modal grande: 95% en móvil, con tope en tablet. */
export function modalWidthFor(windowWidth: number): number {
  return Math.min(windowWidth * MODAL_WIDTH_RATIO, MODAL_MAX_WIDTH);
}

export function useResponsive() {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return useMemo(() => {
    // La escala depende SOLO del ancho de ventana, nunca del tamaño del
    // tablero: si dependiera del tablero, controles más grandes encogerían el
    // tablero, que a su vez encogería los controles, y el layout oscilaría.
    const uiScale = uiScaleForWidth(width);
    return {
      width,
      height,
      fontScale,
      insets,
      uiScale,
      /** Escala un tamaño de diseño (dp de móvil) al dispositivo actual. */
      s: (n: number) => scaleSize(n, uiScale),
      isLargeScreen: Math.min(width, height) >= 600,
      isLandscape: width > height,
    };
  }, [width, height, fontScale, insets]);
}
