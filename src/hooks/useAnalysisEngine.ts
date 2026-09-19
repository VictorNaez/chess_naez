import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createEngineOutputStore, EMPTY_ENGINE_OUTPUT, type EngineLine } from '../lib/engineOutput';
import { useSettings } from './useSettings';
import { useStockfishWebview } from './useStockfishWebview';

export type { EngineLine } from '../lib/engineOutput';

// Gestiona todo el ciclo de vida del motor Stockfish: arranque (precargado o al
// entrar en análisis), reposicionado al cambiar la FEN, parseo de la salida UCI
// y las primitivas de pausa/reanudación que usa `handleEngineSequencePress` (en
// App) para reproducir una línea de análisis sobre el tablero.
//
// Lo que se pinta (evaluación, flecha, líneas) NO vive aquí como estado de
// React: va a `outputStore` (src/lib/engineOutput.ts) y solo se re-renderizan
// sus consumidores, no App.
//
// El motor, una vez arrancado, vive toda la sesión: salir de análisis lo para
// pero no lo destruye. Antes la WebView se desmontaba al salir y cada entrada
// volvía a crearla, a compilar el wasm y a repetir el handshake.
export function useAnalysisEngine(fen: string) {
  const [isAnalysisMode, setIsAnalysisMode] = useState(false);
  // true en cuanto alguien pide el motor (prewarm o entrar en análisis).
  const [engineRequested, setEngineRequested] = useState(false);
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [outputStore] = useState(createEngineOutputStore);

  const { engineDepth, engineHash, engineMultiPV } = useSettings();

  // Los ajustes se leen desde callbacks estables mediante un ref.
  const engineCfgRef = useRef({ depth: engineDepth, hash: engineHash, multiPV: engineMultiPV });
  useEffect(() => {
    engineCfgRef.current = { depth: engineDepth, hash: engineHash, multiPV: engineMultiPV };
  }, [engineDepth, engineHash, engineMultiPV]);

  // Opciones ya aplicadas al motor vivo. Hash solo se reenvía si cambia:
  // reasignarla vacía la tabla y se pierde lo ya calculado.
  const appliedOptionsRef = useRef<{ hash: number; multiPV: number } | null>(null);
  // Qué está buscando (o buscó por última vez) el motor.
  const searchRef = useRef<{ fen: string; depth: number } | null>(null);

  const handshakeSentRef = useRef(false);
  const ignoreEngineOutputRef = useRef(true);   // true mientras la salida es de una búsqueda obsoleta
  const linesRef = useRef<Record<number, EngineLine>>({});
  // Ventana en la que NO se publica al store (la pieza se está animando). El
  // parseo sigue: solo se retrasa el repintado, y al salir de la ventana se
  // vuelca lo último que haya.
  const holdUntilRef = useRef(0);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 'bestmove' llegado durante una retención: lo aplica el volcado diferido.
  const pendingBestMoveRef = useRef<string | null>(null);
  const isSequencePlayingRef = useRef(false);
  const searchActiveRef = useRef(false);        // ¿hay un "go" sin su bestmove?
  const stopWaitersRef = useRef<(() => void)[]>([]);  // se resuelven con el siguiente bestmove
  const searchTurnRef = useRef<'w' | 'b'>('w');

  // Se rellenan tras llamar a useStockfishWebview (los callbacks de salida se
  // le pasan antes de que existan sendCommandToStockfish y reloadEngine).
  const crashRecoveryRef = useRef<() => void>(() => {});
  const engineResetRef = useRef<() => void>(() => {});

  // Vuelca al store lo que haya ahora mismo en linesRef. Si ninguna línea ha
  // cambiado de identidad, se reutiliza el array anterior y `outputStore.set`
  // no llega a avisar a nadie.
  const publishLines = useCallback(() => {
    const ids = Object.keys(linesRef.current).map(Number).sort((a, b) => a - b);
    const lines = ids.map((id) => linesRef.current[id]);
    const first = lines[0];
    if (!first) return;
    const previous = outputStore.get().lines;
    const unchanged = previous.length === lines.length && lines.every((l, i) => l === previous[i]);
    const bestMove = pendingBestMoveRef.current ?? (first.move || null);
    pendingBestMoveRef.current = null;
    outputStore.set({
      lines: unchanged ? previous : lines,
      isEvaluating: false,              // ya hay datos reales de la posición actual
      bestMove,
      centipawn: first.mateIn === null ? first.score : null,
      mateIn: first.mateIn === null ? null : String(first.mateIn),
    });
  }, [outputStore]);

  // Publica salvo que estemos dentro de la ventana de animación; en ese caso
  // deja un único temporizador que volcará al salir de ella (y que se vuelve a
  // armar si mientras tanto llega otra jugada).
  const publishGated = useCallback(() => {
    const remaining = holdUntilRef.current - Date.now();
    if (remaining <= 0) {
      publishLines();
      return;
    }
    if (holdTimerRef.current !== null) return;
    holdTimerRef.current = setTimeout(function flushHeld() {
      holdTimerRef.current = null;
      const left = holdUntilRef.current - Date.now();
      if (left > 0) {
        holdTimerRef.current = setTimeout(flushHeld, left);
        return;
      }
      publishLines();
    }, remaining);
  }, [publishLines]);

  // La llama App justo al aplicar una jugada (o al navegar por el historial):
  // durante `ms` el motor trabaja igual pero el panel no se repinta.
  const holdOutput = useCallback((ms: number) => {
    const until = Date.now() + ms;
    if (until > holdUntilRef.current) holdUntilRef.current = until;
  }, []);

  const cancelHold = useCallback(() => {
    holdUntilRef.current = 0;
    if (holdTimerRef.current !== null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    pendingBestMoveRef.current = null;
  }, []);

  useEffect(() => cancelHold, [cancelHold]);

  // Una llamada por mensaje de la WebView. engine.html ya agrupa las líneas de
  // cada vaciado en un único mensaje, así que aquí se publica en el store una
  // sola vez por mensaje, sin throttle propio. (El anterior de 100 ms dejaba
  // pasar la primera línea y descartaba las que llegaban detrás sin volcarlas
  // después: las líneas 2 y 3 se quedaban una profundidad por detrás.)
  const handleStockfishOutput = useCallback((output: string) => {
    let linesChanged = false;

    for (const rawLine of output.split('\n')) {
      let line = rawLine.trim();
      if (!line) continue;

      if (line === '[SF] FATAL-CRASH') {
        console.warn('[SF] ⚠️ Motor WASM colapsado. Recuperando...');
        crashRecoveryRef.current();
        return;
      }

      // PV en SAN calculada en la WebView: siempre llega justo detrás de su línea.
      if (line.startsWith('[SF-SAN] ')) {
        if (ignoreEngineOutputRef.current) continue;
        const rest = line.slice(9);
        const sep = rest.indexOf(' ');
        const id = parseInt(sep === -1 ? rest : rest.slice(0, sep), 10);
        const current = linesRef.current[id];
        if (current) {
          const nextSan = sep === -1 ? [] : rest.slice(sep + 1).split(' ');
          const sameSan = current.san !== null
            && current.san.length === nextSan.length
            && current.san.every((move, i) => move === nextSan[i]);
          if (!sameSan) {
            linesRef.current[id] = { ...current, san: nextSan };
            linesChanged = true;
          }
        }
        continue;
      }

      if (line.startsWith('[SF-OUT] ')) line = line.slice(9);

      if (line === 'readyok') {
        setIsEngineReady(true);
        continue;
      }

      if (line.startsWith('info') && line.includes(' score ')) {
        // Líneas de una búsqueda que estamos cancelando: no deben pisar la nueva.
        if (ignoreEngineOutputRef.current) continue;

        const multipvMatch = line.match(/multipv (\d+)/);
        const pvIdx = multipvMatch ? parseInt(multipvMatch[1], 10) : 1;

        let formattedScore = '0.00';
        let mateIn: number | null = null;
        const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
        if (scoreMatch) {
          const rawValue = parseInt(scoreMatch[2], 10);
          const normalized = searchTurnRef.current === 'b' ? -rawValue : rawValue;
          if (scoreMatch[1] === 'mate') {
            mateIn = normalized;
            formattedScore = rawValue === 0 ? 'M0' : `#${normalized > 0 ? '+' : ''}${normalized}`;
          } else {
            const val = normalized / 100;
            formattedScore = `${val > 0 ? '+' : ''}${val.toFixed(2)}`;
          }
        }

        let fullPv = '';
        if (line.includes(' pv ')) fullPv = line.split(' pv ')[1].trim();

        if (pvIdx <= engineCfgRef.current.multiPV) {
          const lineFen = searchRef.current?.fen ?? '';
          const previous = linesRef.current[pvIdx];
          // Misma puntuación y misma PV que en la iteración anterior: se
          // conserva el objeto (con su SAN ya calculado) para que el memo de
          // PvLine acierte y la fila no se reconstruya.
          if (previous && previous.score === formattedScore && previous.pv === fullPv
              && previous.mateIn === mateIn && previous.fen === lineFen) {
            continue;
          }
          linesRef.current[pvIdx] = {
            id: pvIdx,
            score: formattedScore,
            move: fullPv.split(' ')[0] ?? '',
            pv: fullPv,
            mateIn,
            fen: lineFen,
            san: null,
          };
          linesChanged = true;
        }
        continue;
      }

      if (line.startsWith('bestmove')) {
        searchActiveRef.current = false;
        if (!ignoreEngineOutputRef.current) {
          // Volcado final: no llegarán más líneas de esta búsqueda.
          const parts = line.split(' ');
          if (parts.length > 1 && parts[1] !== '(none)') {
            pendingBestMoveRef.current = parts[1];
          }
          publishGated();
          linesChanged = false;
        }
        const waiters = stopWaitersRef.current;
        stopWaitersRef.current = [];
        waiters.forEach((resolve) => resolve());
      }
    }

    if (linesChanged) publishGated();
  }, [publishGated]);

  const handleEngineReset = useCallback(() => engineResetRef.current(), []);

  const stockfishConfig = useMemo(() => ({
    onOutput: handleStockfishOutput,
    onError: (error: string) => {
      console.error('❌ [Stockfish Error Nativo]:', error);
    },
    onEngineReset: handleEngineReset,
    enabled: engineRequested,
  }), [handleStockfishOutput, handleEngineReset, engineRequested]);

  const { StockfishWebView, sendCommandToStockfish, reloadEngine } = useStockfishWebview(stockfishConfig);

  // Deja el motor como recién creado: sin handshake, sin búsqueda y sin salida visible.
  const resetEngineState = useCallback(() => {
    setIsEngineReady(false);
    cancelHold();
    handshakeSentRef.current = false;
    appliedOptionsRef.current = null;
    searchRef.current = null;
    searchActiveRef.current = false;
    isSequencePlayingRef.current = false;
    ignoreEngineOutputRef.current = true;
    linesRef.current = {};
    const waiters = stopWaitersRef.current;
    stopWaitersRef.current = [];
    waiters.forEach((resolve) => resolve());
    outputStore.set(EMPTY_ENGINE_OUTPUT);
  }, [outputStore, cancelHold]);

  // Sin esperas fijas (antes 250 ms aquí + 200 ms en engine.html): los comandos
  // esperan en cola a que cargue la WebView y a que el motor exista, y nadie
  // manda 'position'/'go' antes del 'readyok'.
  const sendHandshake = useCallback(() => {
    const { hash, multiPV } = engineCfgRef.current;
    handshakeSentRef.current = true;
    appliedOptionsRef.current = { hash, multiPV };
    sendCommandToStockfish('uci');
    sendCommandToStockfish('setoption name Threads value 1');
    sendCommandToStockfish(`setoption name Hash value ${hash}`);
    sendCommandToStockfish(`setoption name MultiPV value ${multiPV}`);
    sendCommandToStockfish('isready');
  }, [sendCommandToStockfish]);

  useEffect(() => {
    // El WASM se colgó: se recarga la página y se repite el handshake (queda en
    // cola hasta que la WebView vuelva a cargar).
    crashRecoveryRef.current = () => {
      resetEngineState();
      reloadEngine();
      sendHandshake();
    };
    // La WebView se ha recreado (proceso de render terminado por el sistema).
    engineResetRef.current = () => {
      resetEngineState();
      sendHandshake();
    };
  }, [sendCommandToStockfish, resetEngineState, reloadEngine, sendHandshake]);

  const prewarm = useCallback(() => setEngineRequested(true), []);
  const enterAnalysisMode = useCallback(() => {
    setEngineRequested(true);
    setIsAnalysisMode(true);
  }, []);
  const exitAnalysisMode = useCallback(() => setIsAnalysisMode(false), []);
  const clearBestMove = useCallback(() => outputStore.set({ bestMove: null }), [outputStore]);

  // HANDSHAKE: una vez por motor vivo, en cuanto se pide.
  useEffect(() => {
    if (!engineRequested || handshakeSentRef.current) return;
    sendHandshake();
  }, [engineRequested, sendHandshake]);

  // 'stop' y espera al bestmove. Varios pueden esperar el mismo bestmove.
  // engine.html ejecuta 'stop' fuera de su cola, así que llega en milisegundos;
  // los 2 s son solo una red de seguridad.
  const stopAndWait = useCallback(() => new Promise<void>((resolve) => {
    if (!searchActiveRef.current) {
      resolve();
      return;
    }
    let settled = false;
    const safeResolve = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    stopWaitersRef.current.push(safeResolve);
    sendCommandToStockfish('stop');
    setTimeout(safeResolve, 2000);
  }), [sendCommandToStockfish]);

  // Reposiciona el motor y lanza la búsqueda YA. Antes el 'go' esperaba 250 ms
  // "para no competir con la animación", pero el motor corre en el proceso de la
  // WebView, no en el hilo de UI donde se anima la pieza.
  const restartSearch = useCallback((targetFen: string) => {
    const depth = engineCfgRef.current.depth;
    searchTurnRef.current = targetFen.split(' ')[1] === 'b' ? 'b' : 'w';
    searchRef.current = { fen: targetFen, depth };
    linesRef.current = {};
    sendCommandToStockfish(`position fen ${targetFen}`);
    sendCommandToStockfish(`go depth ${depth}`);
    searchActiveRef.current = true;
    ignoreEngineOutputRef.current = false;
  }, [sendCommandToStockfish]);

  // Detiene la búsqueda en curso y espera a que el motor confirme. Lo usa quien
  // reproduce una secuencia animada (handleEngineSequencePress en App). Las
  // líneas se quedan a la vista, atenuadas, hasta que haya datos nuevos.
  const pauseSearch = useCallback(async () => {
    ignoreEngineOutputRef.current = true;
    linesRef.current = {};
    outputStore.set({ isEvaluating: true, bestMove: null });
    await stopAndWait();
  }, [outputStore, stopAndWait]);

  // SALIR DE ANÁLISIS: el motor se para pero sigue vivo.
  useEffect(() => {
    if (isAnalysisMode) return;
    ignoreEngineOutputRef.current = true;
    linesRef.current = {};
    searchRef.current = null;
    cancelHold();
    if (searchActiveRef.current) sendCommandToStockfish('stop');
    outputStore.set(EMPTY_ENGINE_OUTPUT);
  }, [isAnalysisMode, sendCommandToStockfish, outputStore, cancelHold]);

  // SINCRONIZAR EL MOTOR con la posición y los ajustes. UCI solo acepta
  // 'setoption' con el motor parado, así que el orden es siempre
  // stop → (setoption) → position → go.
  useEffect(() => {
    if (!isAnalysisMode || !isEngineReady || isSequencePlayingRef.current) return;

    const applied = appliedOptionsRef.current;
    const optionsChanged = !applied || applied.hash !== engineHash || applied.multiPV !== engineMultiPV;
    const current = searchRef.current;
    // Ya busca (o ya buscó y se está pintando) exactamente esto: p.ej. al acabar
    // de reproducir una línea, App relanza la búsqueda antes de que llegue aquí.
    if (!optionsChanged && current && current.fen === fen && current.depth === engineDepth
        && !ignoreEngineOutputRef.current) {
      return;
    }

    let cancelled = false;
    ignoreEngineOutputRef.current = true;
    linesRef.current = {};
    outputStore.set({ isEvaluating: true, bestMove: null });

    (async () => {
      await stopAndWait();
      if (cancelled || isSequencePlayingRef.current) return;

      const previous = appliedOptionsRef.current;
      if (!previous || previous.hash !== engineHash) {
        sendCommandToStockfish(`setoption name Hash value ${engineHash}`);
      }
      if (!previous || previous.multiPV !== engineMultiPV) {
        sendCommandToStockfish(`setoption name MultiPV value ${engineMultiPV}`);
        // Con menos líneas, las sobrantes ya no las va a sobrescribir el motor.
        const kept = outputStore.get().lines.filter((l) => l.id <= engineMultiPV);
        outputStore.set({ lines: kept });
      }
      appliedOptionsRef.current = { hash: engineHash, multiPV: engineMultiPV };

      restartSearch(fen);
    })();

    return () => {
      cancelled = true;
    };
  }, [fen, isAnalysisMode, isEngineReady, engineDepth, engineHash, engineMultiPV,
    stopAndWait, restartSearch, sendCommandToStockfish, outputStore]);

  return {
    isAnalysisMode,
    isEngineReady,
    outputStore,
    StockfishWebView,
    prewarm,
    enterAnalysisMode,
    exitAnalysisMode,
    clearBestMove,
    holdOutput,
    pauseSearch,
    restartSearch,
    isSequencePlayingRef,
  };
}
