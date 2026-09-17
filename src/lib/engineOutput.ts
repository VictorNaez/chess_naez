import { useSyncExternalStore } from 'react';

// =========================================================
// SALIDA DEL MOTOR (store externo)
// =========================================================
// Evaluación, mejor jugada y líneas cambian varias veces por segundo mientras
// el motor busca. Si vivieran en el estado de useAnalysisEngine, cada cambio
// re-renderizaría App entero (que el React Compiler no optimiza). Aquí solo se
// suscriben quienes las pintan: la barra de evaluación, la flecha y el panel
// MultiPV.

export interface EngineLine {
  id: number;             // multipv (1..N)
  score: string;          // "+0.35", "#-3", "M0"
  move: string;           // primera jugada de la PV (UCI)
  pv: string;             // PV completa (UCI)
  mateIn: number | null;
  fen: string;            // posición desde la que se calculó (SAN y numeración)
  san: string[] | null;   // PV en SAN calculada en la WebView; null -> se calcula aquí
}

export interface EngineOutput {
  bestMove: string | null;    // flecha
  centipawn: string | null;   // barra (texto formateado, p.ej. "+0.35")
  mateIn: string | null;      // barra
  lines: EngineLine[];        // panel MultiPV
  // true mientras se busca una posición nueva: las líneas visibles aún son de
  // la anterior y se pintan atenuadas y sin respuesta al toque.
  isEvaluating: boolean;
}

export interface EngineOutputStore {
  get: () => EngineOutput;
  set: (patch: Partial<EngineOutput>) => void;
  subscribe: (listener: () => void) => () => void;
}

export const EMPTY_ENGINE_OUTPUT: EngineOutput = {
  bestMove: null,
  centipawn: null,
  mateIn: null,
  lines: [],
  isEvaluating: false,
};

export function createEngineOutputStore(): EngineOutputStore {
  let state = EMPTY_ENGINE_OUTPUT;
  const listeners = new Set<() => void>();

  return {
    get: () => state,
    set: (patch) => {
      const keys = Object.keys(patch) as (keyof EngineOutput)[];
      if (keys.every((key) => Object.is(state[key], patch[key]))) return;
      state = { ...state, ...patch };
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

const subscribeNothing = () => () => {};
const readEmpty = () => EMPTY_ENGINE_OUTPUT;

// El selector tiene que devolver un primitivo o una referencia que ya exista en
// el estado (p.ej. `s => s.lines`), nunca un objeto nuevo.
export function useEngineOutput<T>(
  store: EngineOutputStore | null | undefined,
  select: (output: EngineOutput) => T,
): T {
  return useSyncExternalStore(
    store ? store.subscribe : subscribeNothing,
    () => select(store ? store.get() : readEmpty()),
  );
}
