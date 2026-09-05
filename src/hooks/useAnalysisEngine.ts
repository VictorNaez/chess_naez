import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from './useSettings';
import { useStockfishWebview } from './useStockfishWebview';

export interface EngineLine {
  id: number;
  score: string;
  move: string;
  pv: string;
  mateIn: number | null;
}

// Gestiona todo el ciclo de vida del motor Stockfish: encendido/apagado al
// entrar/salir de modo análisis, reposicionado automático al cambiar la FEN,
// parseo de la salida UCI, y las primitivas de pausa/reanudación que usa
// `handleEngineSequencePress` (en App) para reproducir una línea de análisis
// sobre el tablero sin que el motor compita por CPU con la animación.
export function useAnalysisEngine(fen: string) {
  const [isAnalysisMode, setIsAnalysisMode] = useState(false);
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [bestEngineMove, setBestEngineMove] = useState<string | null>(null);
  const [centiPawnScore, setCentiPawnScore] = useState<string | null>(null);
  const [mateInMoves, setMateInMoves] = useState<string | null>(null);
  const [engineLines, setEngineLines] = useState<EngineLine[]>([]);
  // true mientras esperamos la primera línea real del motor para la posición
  // actual: evita mostrar la evaluación de la posición anterior como si fuera
  // la de la posición nueva.
  const [isEvaluating, setIsEvaluating] = useState(false);

  const { engineDepth, engineHash, engineMultiPV } = useSettings();

  // Los ajustes se leen desde callbacks estables (processStockfishLine tiene deps
  // vacías, restartSearch solo depende de sendCommandToStockfish). Un ref evita
  // recrear esas funciones y, con ellas, disparar el EFECTO 2 en cada cambio.
  const engineCfgRef = useRef({ depth: engineDepth, hash: engineHash, multiPV: engineMultiPV });
  useEffect(() => {
    engineCfgRef.current = { depth: engineDepth, hash: engineHash, multiPV: engineMultiPV };
  }, [engineDepth, engineHash, engineMultiPV]);

  // Clave de la última configuración aplicada al motor. Evita que el EFECTO 3
  // relance una búsqueda nada más entrar en análisis (el handshake ya la mandó).
  const lastAppliedCfgRef = useRef<string>('');

  const isEngineStarted = useRef(false);
  const ignoreEngineOutputRef = useRef(false); // true mientras cancelamos una búsqueda obsoleta
  const linesRef = useRef<Record<number, EngineLine>>({});
  const isSequencePlayingRef = useRef(false);
  const lastUpdateTime = useRef(0);
  const searchActiveRef = useRef(false);               // ¿hay un "go" en curso?
  const pendingStopResolveRef = useRef<(() => void) | null>(null); // resuelve cuando llega el bestmove del "stop"
  const searchTurnRef = useRef<'w' | 'b'>('w');

  const processStockfishLine = useCallback((rawLine: string) => {
    let cleanLine = rawLine.trim();

    if (cleanLine === '[SF] FATAL-CRASH') {
      console.warn('[SF] ⚠️ Motor WASM colapsado. Recuperando...');

      // Reseteamos todo el estado que pudiera quedar bloqueado
      setIsEngineReady(false);
      setBestEngineMove(null);
      setCentiPawnScore(null);
      setMateInMoves(null);
      setEngineLines([]);
      linesRef.current = {};
      searchActiveRef.current = false;
      isSequencePlayingRef.current = false;
      pendingStopResolveRef.current = null;
      ignoreEngineOutputRef.current = false;

      reloadEngine();

      // Tras la recarga, la WebView vuelve a disparar onLoadEnd y readyRef se pone a true,
      // pero el handshake UCI (uci/setoption/isready) solo se manda cuando cambia isAnalysisMode.
      // Como seguimos en modo análisis, lo reenviamos manualmente tras dar tiempo a que cargue.
      setTimeout(() => {
        sendCommandToStockfish('uci');
        sendCommandToStockfish('setoption name Threads value 1');
        sendCommandToStockfish(`setoption name Hash value ${engineCfgRef.current.hash}`);
        sendCommandToStockfish(`setoption name MultiPV value ${engineCfgRef.current.multiPV}`);
        sendCommandToStockfish('isready');
      }, 800); // margen para que la WebView recargue e inicialice el WASM de nuevo

      return;
    }

    if (!cleanLine) return;

    if (cleanLine.startsWith('[SF-OUT] ')) {
      cleanLine = cleanLine.replace('[SF-OUT] ', '');
    }

    if (cleanLine === 'readyok') {
      setIsEngineReady(true);
      return;
    }

    if (cleanLine.startsWith('info') && cleanLine.includes(' score ')) {
      // Descartamos cualquier línea que pertenezca a una búsqueda que estamos
      // cancelando (llegan tras mandar 'stop', antes de que llegue 'bestmove').
      // Sin esto, esos datos "viejos" pisan brevemente al análisis nuevo.
      if (ignoreEngineOutputRef.current) return;

      const multipvMatch = cleanLine.match(/multipv (\d+)/);
      const pvIdx = multipvMatch ? parseInt(multipvMatch[1], 10) : 1;

      let formattedScore = '0.00';
      let mateIn: number | null = null;
      const scoreMatch = cleanLine.match(/score (cp|mate) (-?\d+)/);

      if (scoreMatch) {
        const type = scoreMatch[1];
        const rawValue = parseInt(scoreMatch[2], 10);
        const normalized = searchTurnRef.current === 'b' ? -rawValue : rawValue;

        if (type === 'mate') {
          mateIn = normalized;
          formattedScore = rawValue === 0 ? 'M0' : `#${normalized > 0 ? '+' : ''}${normalized}`;
        } else {
          const val = normalized / 100;
          formattedScore = `${val > 0 ? '+' : ''}${val.toFixed(2)}`;
        }
      }

      let firstMove = '';
      let fullPv = '';
      if (cleanLine.includes(' pv ')) {
        fullPv = cleanLine.split(' pv ')[1].trim();
        firstMove = fullPv.split(' ')[0];
      }

      if (pvIdx <= engineCfgRef.current.multiPV) {
        linesRef.current[pvIdx] = {
          id: pvIdx,
          score: formattedScore,
          move: firstMove,
          pv: fullPv,
          mateIn,
        };
      }

      const now = Date.now();
      if (now - lastUpdateTime.current > 100) {
        const sortedLines = Object.values(linesRef.current).sort((a, b) => a.id - b.id);
        setEngineLines(sortedLines);

        if (sortedLines[0]) {
          setIsEvaluating(false); // ya tenemos datos reales de la posición actual
          setBestEngineMove(sortedLines[0].move);
          if (sortedLines[0].mateIn !== null) {
            setMateInMoves(String(sortedLines[0].mateIn));
            setCentiPawnScore(null);
          } else {
            setMateInMoves(null);
            setCentiPawnScore(sortedLines[0].score);
          }
        }
        lastUpdateTime.current = now;
      }
    }

    if (cleanLine.startsWith('bestmove')) {
      const parts = cleanLine.split(' ');
      if (parts.length > 1 && parts[1] !== '(none)') {
        setBestEngineMove(parts[1]);
      }

      // Volcado final forzado: la búsqueda terminó, no llegarán más líneas 'info',
      // así que sincronizamos el estado con el contenido completo de linesRef.current
      // sin esperar al throttle de 100ms.
      const finalLines = Object.values(linesRef.current).sort((a, b) => a.id - b.id);
      if (finalLines.length > 0) {
        setEngineLines(finalLines);
        setIsEvaluating(false);
        if (finalLines[0].mateIn !== null && finalLines[0].mateIn !== undefined) {
          setMateInMoves(String(finalLines[0].mateIn));
          setCentiPawnScore(null);
        } else {
          setMateInMoves(null);
          setCentiPawnScore(finalLines[0].score);
        }
      }
      lastUpdateTime.current = Date.now();

      searchActiveRef.current = false;
      if (pendingStopResolveRef.current) {
        pendingStopResolveRef.current();
        pendingStopResolveRef.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El bridge puede entregarte varias líneas UCI pegadas en una sola llamada
  // (sobre todo en "go infinite", que genera ráfagas). Las separamos siempre,
  // así funcione ya línea a línea o no.
  const handleStockfishOutput = useCallback((output: string) => {
    output.split('\n').forEach(processStockfishLine);
  }, [processStockfishLine]);

  const stockfishConfig = useMemo(() => ({
    onOutput: handleStockfishOutput,
    onError: (error: string) => {
      console.error('❌ [Stockfish Error Nativo]:', error);
    }
  }), [handleStockfishOutput]);

  const { StockfishWebView, sendCommandToStockfish, reloadEngine } = useStockfishWebview(stockfishConfig);

  const enterAnalysisMode = useCallback(() => setIsAnalysisMode(true), []);
  const exitAnalysisMode = useCallback(() => setIsAnalysisMode(false), []);
  const clearBestMove = useCallback(() => setBestEngineMove(null), []);

  // Detiene la búsqueda en curso (si la hay) y espera a que el motor confirme
  // que paró, antes de continuar. Usado por quien reproduce una secuencia de
  // movimientos animada (ver handleEngineSequencePress en App) para pausar
  // el motor mientras las piezas se mueven solas.
  const pauseSearch = useCallback(async () => {
    ignoreEngineOutputRef.current = true;
    linesRef.current = {};
    setIsEvaluating(true);
    setBestEngineMove(null);

    if (searchActiveRef.current) {
      await new Promise<void>((resolve) => {
        let settled = false;
        const safeResolve = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        pendingStopResolveRef.current = safeResolve;
        sendCommandToStockfish('stop');
        setTimeout(safeResolve, 2000); // Si en 2.0s no llega 'bestmove', desbloqueamos igualmente
      });
    }
  }, [sendCommandToStockfish]);

  // Reposiciona el motor en una nueva FEN y lanza una búsqueda nueva, con un
  // pequeño retraso en el 'go' para no competir con la animación en curso.
  // Devuelve el timer del 'go' para que el llamador pueda cancelarlo si hace falta.
  const restartSearch = useCallback((targetFen: string) => {
    searchTurnRef.current = targetFen.split(' ')[1] === 'b' ? 'b' : 'w';
    sendCommandToStockfish(`position fen ${targetFen}`);

    return setTimeout(() => {
      sendCommandToStockfish(`go depth ${engineCfgRef.current.depth}`);
      searchActiveRef.current = true;
      ignoreEngineOutputRef.current = false;
    }, 250);
  }, [sendCommandToStockfish]);

  // EFECTO 1: ENCENDIDO DE MOTOR (STOCKFISH)
  useEffect(() => {
    let initTimer: ReturnType<typeof setTimeout> | null = null;

    if (isAnalysisMode) {
      if (!isEngineStarted.current) {
        isEngineStarted.current = true;
      }

      // Marcamos la config como aplicada AQUÍ (no dentro del setTimeout) para que
      // el EFECTO 3 no la vuelva a mandar cuando llegue el readyok.
      lastAppliedCfgRef.current = `${engineHash}-${engineMultiPV}-${engineDepth}`;

      initTimer = setTimeout(() => {
        sendCommandToStockfish('uci');
        sendCommandToStockfish('setoption name Threads value 1');
        sendCommandToStockfish(`setoption name Hash value ${engineCfgRef.current.hash}`);
        sendCommandToStockfish(`setoption name MultiPV value ${engineCfgRef.current.multiPV}`);
        sendCommandToStockfish('isready');
      }, 250);
    }

    return () => {
      if (initTimer) clearTimeout(initTimer);
      if (isEngineStarted.current) {
        sendCommandToStockfish('stop');
        setIsEngineReady(false);
        setBestEngineMove(null);
        setCentiPawnScore(null);
        isEngineStarted.current = false;
        searchActiveRef.current = false;
        pendingStopResolveRef.current = null;
        ignoreEngineOutputRef.current = false;
        lastAppliedCfgRef.current = '';   // al salir de análisis, forzamos handshake nuevo la próxima vez
      }
    };
  }, [isAnalysisMode, sendCommandToStockfish]);

  // EFECTO 2: REPOSICIONAR EL MOTOR CADA VEZ QUE CAMBIA LA POSICIÓN
  useEffect(() => {
    if (!(isAnalysisMode && isEngineReady) || isSequencePlayingRef.current) return;

    let cancelled = false;
    let goTimer: ReturnType<typeof setTimeout> | null = null;
    let ownResolve: (() => void) | null = null;

    const reposition = async () => {
      ignoreEngineOutputRef.current = true;
      linesRef.current = {};
      setIsEvaluating(true);
      setBestEngineMove(null);

      if (searchActiveRef.current) {
        await new Promise<void>((resolve) => {
          let settled = false;
          const safeResolve = () => {
            if (settled) return;
            settled = true;
            resolve();
          };
          ownResolve = safeResolve;
          pendingStopResolveRef.current = safeResolve;
          sendCommandToStockfish('stop');
          setTimeout(safeResolve, 2000);
        });
      }

      if (cancelled) return;

      setBestEngineMove(null);
      goTimer = restartSearch(fen);
    };

    reposition();

    return () => {
      cancelled = true;
      if (goTimer) clearTimeout(goTimer);
      if (ownResolve && pendingStopResolveRef.current === ownResolve) {
        pendingStopResolveRef.current = null;
      }
    };
  }, [fen, isAnalysisMode, isEngineReady, sendCommandToStockfish, restartSearch]);

  // EFECTO 3: APLICAR CAMBIOS DE AJUSTES DEL MOTOR EN CALIENTE
  // UCI solo acepta 'setoption' con el motor parado, así que el orden es
  // obligatoriamente stop → setoption → position → go.
  useEffect(() => {
    if (!(isAnalysisMode && isEngineReady)) return;
    if (isSequencePlayingRef.current) return;

    const cfgKey = `${engineHash}-${engineMultiPV}-${engineDepth}`;
    if (lastAppliedCfgRef.current === cfgKey) return;
    lastAppliedCfgRef.current = cfgKey;

    let cancelled = false;
    let goTimer: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      await pauseSearch();
      if (cancelled) return;

      sendCommandToStockfish(`setoption name Hash value ${engineHash}`);
      sendCommandToStockfish(`setoption name MultiPV value ${engineMultiPV}`);

      // Si bajamos MultiPV, las líneas sobrantes seguirían en el ref y se
      // pintarían indefinidamente: el motor ya no las va a sobrescribir.
      linesRef.current = {};
      setEngineLines([]);

      goTimer = restartSearch(fen);
    })();

    return () => {
      cancelled = true;
      if (goTimer) clearTimeout(goTimer);
    };
  }, [engineHash, engineMultiPV, engineDepth, isAnalysisMode, isEngineReady, fen, pauseSearch, restartSearch, sendCommandToStockfish]);

return {
  isAnalysisMode,
  isEngineReady,
  bestEngineMove,
  centiPawnScore,
  mateInMoves,
  engineLines,
  isEvaluating,
  StockfishWebView,
  enterAnalysisMode,
  exitAnalysisMode,
  clearBestMove,
  pauseSearch,
  restartSearch,
  isSequencePlayingRef,
};
}