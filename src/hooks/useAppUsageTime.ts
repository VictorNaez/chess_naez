import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

// ---------------------------------------------------------------------------
// TIEMPO DE USO ACUMULADO
//
// Mide solo tiempo en primer plano: si el usuario deja la app abierta y se va a
// comer, eso no cuenta. Mismo patrón de segmentos que el cronómetro de puzles
// (acumulador + segmento abierto), por la misma razón: sumar deltas entre
// eventos de AppState es lo único que sobrevive a que Android congele el
// proceso sin avisar.
//
// El valor se expone por función y no por estado a propósito. Si fuera estado
// y se actualizara cada segundo, el componente raíz —que es el de 2300 líneas—
// se repintaría entero sesenta veces por minuto para alimentar una condición
// que se consulta una vez cada varios minutos.
// ---------------------------------------------------------------------------

const USAGE_KEY = '@usage_ms_total';
const FLUSH_INTERVAL_MS = 60_000;

export function useAppUsageTime() {
  // Tiempo cerrado y ya contabilizado de sesiones anteriores.
  const accumulatedRef = useRef(0);
  // Inicio del segmento abierto ahora mismo, o null si estamos en segundo plano.
  const segmentStartRef = useRef<number | null>(Date.now());
  const loadedRef = useRef(false);

  const closeSegment = useCallback(() => {
    if (segmentStartRef.current === null) return;
    accumulatedRef.current += Date.now() - segmentStartRef.current;
    segmentStartRef.current = null;
  }, []);

  const persist = useCallback(() => {
    // Hasta que no hayamos leído el valor guardado no escribimos: si no, el
    // primer flush machacaría el histórico con el tiempo de esta sesión.
    if (!loadedRef.current) return;
    AsyncStorage.setItem(USAGE_KEY, String(accumulatedRef.current)).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(USAGE_KEY)
      .then(raw => {
        if (cancelled) return;
        const previous = raw ? Number(raw) : 0;
        if (Number.isFinite(previous) && previous > 0) {
          accumulatedRef.current += previous;
        }
        loadedRef.current = true;
      })
      .catch(() => { loadedRef.current = true; });

    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        // Solo abrimos segmento si no había uno: 'active' puede llegar
        // repetido tras un 'inactive' que no llegó a segundo plano.
        if (segmentStartRef.current === null) segmentStartRef.current = Date.now();
      } else {
        closeSegment();
        persist();
      }
    });

    // Red de seguridad: si Android mata el proceso desde primer plano no hay
    // ningún evento que avise, así que sin esto una sesión larga se perdería
    // entera y el usuario nunca cruzaría el umbral.
    const flush = setInterval(() => {
      const open = segmentStartRef.current;
      if (open === null) return;
      accumulatedRef.current += Date.now() - open;
      segmentStartRef.current = Date.now();
      persist();
    }, FLUSH_INTERVAL_MS);

    return () => {
      cancelled = true;
      sub.remove();
      clearInterval(flush);
      closeSegment();
      persist();
    };
  }, [closeSegment, persist]);

  /** Milisegundos totales de uso en primer plano, incluido el segmento abierto. */
  return useCallback(() => {
    const open = segmentStartRef.current;
    return accumulatedRef.current + (open === null ? 0 : Date.now() - open);
  }, []);
}
