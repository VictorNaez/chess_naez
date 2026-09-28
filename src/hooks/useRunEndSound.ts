import { useEffect, useRef } from 'react';
import { CLOCK_TIMING } from '../lib/clock';
import type { RunPhase, RunRanking } from '../types/run';

type RunEndSound = 'run_end' | 'record';

// ---------------------------------------------------------------------------
// Sonido de fin de partida (contrarreloj / supervivencia).
//
// Suena 'record' solo con récord personal, que es lo que RunResultModal celebra
// a lo grande. El mejor de la semana no: es una etiqueta pequeña y además sale
// en la primera partida de cada semana, sea cual sea el resultado.
//
// Dos detalles de tiempo:
// - El ranking llega después de que la fase pase a 'finished' (se guarda la
//   partida en SQL y luego se calcula). Hasta tenerlo no sabemos si es récord,
//   así que se espera, con un tope por si la consulta falla.
// - Se retrasa un poco: en supervivencia la partida acaba justo en el fallo que
//   gasta la última vida, y el sonido de error aún está sonando.
// ---------------------------------------------------------------------------
export function useRunEndSound(
  phase: RunPhase,
  summary: { attempts: number } | null,
  ranking: RunRanking | null,
  play: (key: RunEndSound) => void,
) {
  // Refs: el sondeo corre en timeouts y debe leer el valor más reciente.
  const rankingRef = useRef(ranking);
  rankingRef.current = ranking;
  const summaryRef = useRef(summary);
  summaryRef.current = summary;

  useEffect(() => {
    if (phase !== 'finished') return;

    let done = false;
    let timer: ReturnType<typeof setTimeout>;
    const startedAt = Date.now();

    const check = () => {
      if (done) return;
      const r = rankingRef.current;
      // Sin intentos no se guarda la partida y el ranking nunca llega.
      const noRanking = (summaryRef.current?.attempts ?? 0) === 0
        || Date.now() - startedAt >= CLOCK_TIMING.runEndRankingWait;
      if (r || noRanking) {
        done = true;
        play(r?.isPersonalBest ? 'record' : 'run_end');
        return;
      }
      timer = setTimeout(check, 100);
    };

    timer = setTimeout(check, CLOCK_TIMING.runEndSound);
    // Salir de 'finished' (jugar otra vez, cerrar) antes de que suene lo cancela.
    return () => { done = true; clearTimeout(timer); };
  }, [phase, play]);
}
