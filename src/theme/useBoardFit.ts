import { useCallback, useEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent, View } from 'react-native';

/** Fracción del ancho de ventana que ocupa el tablero cuando la altura no lo limita. */
export const BOARD_WIDTH_RATIO = 0.98;

/** Tablero mínimo: por debajo, las piezas dejan de ser jugables con el dedo. */
const MIN_BOARD_SIZE = 240;

/**
 * Espera tras el último cambio antes de medir. Tiene que superar la animación
 * más larga que mueve el layout (fila de ELO / multi-PV / eval bar: 350ms).
 */
const SETTLE_MS = 450;

/** Primer ajuste para un tamaño de ventana: preciso, solo ignora redondeos de texto. */
const INITIAL_RESIZE_TOLERANCE = 2;

/**
 * Ajustes posteriores con la misma ventana (cambios de modo, análisis): partes
 * no variables como la fila de turno o el footer difieren unos dp entre modos.
 * Sin esta histéresis, entrar en contrarreloj movería el tablero 4-5 dp.
 */
const MODE_RESIZE_TOLERANCE = 8;

interface BoardFitParams {
  windowWidth: number;
  windowHeight: number;
  /**
   * Suma de las alturas de las zonas que cambian de tamaño según el estado
   * (fila de ELO, margen superior del contenido, eval bar, move list / multi-PV),
   * en el estado ACTUAL una vez terminadas sus animaciones.
   */
  currentVariableHeight: number;
  /**
   * El mayor valor, entre todos los estados posibles, de
   * (alto variable − desbordamiento tolerado). El desbordamiento tolerado es lo
   * que el contenido centrado puede invadir de los márgenes vacíos de arriba y
   * abajo sin pisar nada: el diseño original de móvil ya contaba con ello.
   */
  worstEffectiveHeight: number;
}

/**
 * Calcula el tablero más grande que cabe a lo ancho Y a lo alto, midiendo el
 * layout real en lugar de estimar alturas de texto.
 *
 * Mide dos vistas: `outer` (el hueco flex:1 donde vive el contenido central) e
 * `inner` (lo que ese contenido ocupa de verdad). Su diferencia es la holgura
 * vertical, negativa si hay desbordamiento. A partir de ahí:
 *
 *   tablero_max = tablero_actual + holgura + variable_actual - efectivo_peor
 *
 * donde efectivo = variable − desbordamiento tolerado. La holgura puede ser
 * negativa: el contenido va centrado y reparte el exceso entre los márgenes de
 * arriba y abajo, que están vacíos (en un Pixel 7 eso ya pasaba antes con ~60 dp).
 *
 * Restar el peor caso hace que el tablero NO cambie de tamaño al entrar en
 * análisis o cambiar de modo: siempre queda sitio para el estado más alto. La
 * fórmula es un punto fijo: tras redimensionar, la holgura absorbe exactamente
 * la diferencia y el siguiente cálculo devuelve el mismo tamaño.
 *
 * Se mide con measure() pasado SETTLE_MS, no con los valores de onLayout:
 * durante una animación onLayout puede llegar a mitad de recorrido (o no llegar
 * al final) y mezclaría alturas intermedias con el estado final.
 */
export function useBoardFit({
  windowWidth,
  windowHeight,
  currentVariableHeight,
  worstEffectiveHeight,
}: BoardFitParams) {
  const maxByWidth = Math.floor(windowWidth * BOARD_WIDTH_RATIO);

  const [boardSize, setBoardSize] = useState(maxByWidth);
  // El primer ajuste puede cambiar el tablero de golpe (tablets). Hasta que
  // llega, el tablero se pinta transparente para que no se vea el salto.
  const [isBoardFitReady, setIsBoardFitReady] = useState(false);

  const outerRef = useRef<View>(null);
  const innerRef = useRef<View>(null);
  // measure() responde de forma asíncrona: el cálculo lee siempre los últimos
  // valores a través de refs. Se actualizan en un efecto y no durante el render
  // (el React Compiler está activado y no admite mutar refs en render).
  const boardSizeRef = useRef(boardSize);
  const paramsRef = useRef({ maxByWidth, currentVariableHeight, worstEffectiveHeight, windowKey: `${windowWidth}x${windowHeight}` });
  useEffect(() => {
    boardSizeRef.current = boardSize;
    paramsRef.current = { maxByWidth, currentVariableHeight, worstEffectiveHeight, windowKey: `${windowWidth}x${windowHeight}` };
  });
  // Ventana para la que ya se hizo el ajuste preciso.
  const fittedWindowKeyRef = useRef<string | null>(null);

  const readyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markReady = useCallback(() => {
    if (readyRef.current) return;
    readyRef.current = true;
    setIsBoardFitReady(true);
  }, []);

  const measureAndFit = useCallback(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    outer.measure((_ox, _oy, _ow, outerH) => {
      inner.measure((_ix, _iy, _iw, innerH) => {
        if (!outerH || !innerH) return;

        const { maxByWidth: widthCap, currentVariableHeight: vNow, worstEffectiveHeight: eWorst, windowKey } = paramsRef.current;
        const current = boardSizeRef.current;
        const slack = outerH - innerH;
        const maxByHeight = Math.floor(current + slack + vNow - eWorst);
        const next = Math.max(MIN_BOARD_SIZE, Math.min(widthCap, maxByHeight));

        if (__DEV__) {
          console.log(
            `[boardFit] outer=${outerH.toFixed(1)} inner=${innerH.toFixed(1)} slack=${slack.toFixed(1)} ` +
            `vNow=${vNow} eWorst=${eWorst} widthCap=${widthCap} heightCap=${maxByHeight} -> ${current} => ${next}`
          );
        }

        const isFirstFitForWindow = fittedWindowKeyRef.current !== windowKey;
        const tolerance = isFirstFitForWindow ? INITIAL_RESIZE_TOLERANCE : MODE_RESIZE_TOLERANCE;
        // Aunque sobre sitio, nunca por encima del límite por ancho.
        if (Math.abs(next - current) >= tolerance || current > widthCap) {
          setBoardSize(next);
        }
        fittedWindowKeyRef.current = windowKey;
        markReady();
      });
    });
  }, [markReady]);

  const scheduleFit = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    // En el arranque no hay animaciones en curso: se mide en el siguiente tick.
    timerRef.current = setTimeout(measureAndFit, readyRef.current ? SETTLE_MS : 0);
  }, [measureAndFit]);

  // Cambios que alteran el layout sin pasar necesariamente por onLayout de
  // estas dos vistas: rotación, pantalla dividida, modo, número de líneas multi-PV.
  useEffect(() => {
    scheduleFit();
  }, [windowWidth, windowHeight, currentVariableHeight, worstEffectiveHeight, scheduleFit]);

  // Red de seguridad: si la medición no llegara, el tablero no puede quedarse invisible.
  useEffect(() => {
    const fallback = setTimeout(markReady, 800);
    return () => {
      clearTimeout(fallback);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [markReady]);

  const onFitLayout = useCallback((_e: LayoutChangeEvent) => {
    scheduleFit();
  }, [scheduleFit]);

  // Ancho de la "columna" de UI. En móvil siempre es la ventana entera: si la
  // altura obliga a encoger el tablero, solo encoge el tablero, no la UI (el
  // cronómetro de la fila de turno no cabe en una columna más estrecha). En
  // pantallas grandes (ancho mínimo >= 600 dp) es proporcional al tablero, para
  // que header, ELO y controles queden alineados con él.
  const isLargeScreen = Math.min(windowWidth, windowHeight) >= 600;
  const contentWidth = !isLargeScreen || boardSize >= maxByWidth
    ? windowWidth
    : Math.min(windowWidth, boardSize / BOARD_WIDTH_RATIO);

  return {
    boardSize,
    contentWidth,
    isBoardFitReady,
    outerRef,
    innerRef,
    onFitLayout,
  };
}
