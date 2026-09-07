// OJO CON EL NOMBRE: `index.tsx` ya tiene un estado llamado `isReviewMode` que
// significa "estoy mirando una jugada anterior del historial del puzle". No
// tiene nada que ver con esto. Para que no se pisen, en TypeScript esta
// funcionalidad se llama SIEMPRE `repaso`. En SQL sí usamos inglés, como el
// resto de tablas de la app (elo_history, user_progress, clock_runs).

// Por qué entró un puzle en la cola. Se guarda como INTEGER para poder escalar
// el motivo con un simple MAX() en el UPSERT: si pediste pista y además lo
// fallaste, se queda con 'fail', que es el motivo más grave.
export const REPASO_REASON = { hint: 1, solution: 2, fail: 3 } as const;

export type RepasoReason = keyof typeof REPASO_REASON;

export const repasoReasonFromRank = (rank: number): RepasoReason =>
  rank >= 3 ? 'fail' : rank === 2 ? 'solution' : 'hint';

export interface RepasoStats {
  count: number;
  minRating: number;
  maxRating: number;
  avgRating: number;
  byReason: Record<RepasoReason, number>;
  // epoch ms del puzle más antiguo de la cola, o null si está vacía
  oldestAt: number | null;
}

export const EMPTY_REPASO_STATS: RepasoStats = {
  count: 0,
  minRating: 0,
  maxRating: 0,
  avgRating: 0,
  byReason: { hint: 0, solution: 0, fail: 0 },
  oldestAt: null,
};

export type RepasoOrder = 'oldest' | 'random' | 'hardest';

// Sin 'arming': aquí no hay reloj que sincronizar con el primer movimiento de
// la máquina, así que la fase pasa directa de idle a running.
export type RepasoPhase = 'idle' | 'running' | 'finished';

export interface RepasoSummary {
  reviewed: number;   // puzles que llegaron a aparecer en pantalla
  solved: number;     // acertados a la primera -> salieron de la cola
  failed: number;     // fallados o resueltos con ayuda -> siguen en la cola
  skipped: number;    // pasaste al siguiente sin contestar -> siguen en la cola
  startedAt: number;  // epoch ms
  endedAt: number;    // epoch ms
}

export interface RepasoPosition {
  current: number;  // 1-based, para pintar "3 / 12"
  total: number;
}
