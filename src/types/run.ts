// Tipos compartidos por los modos "de partida" (contrarreloj y supervivencia).
// Ambos son lo mismo salvo por la condición de derrota: uno mide un reloj global
// y el otro un reloj por puzle + vidas. Todo lo demás (escalera de dificultad,
// intentos, resumen, récords, ranking) es idéntico, así que vive aquí.

export type RunKind = 'clock' | 'survival';

export type RunPhase = 'idle' | 'arming' | 'running' | 'finished';

export interface RunAttempt {
  puzzleId: string;
  rating: number;
  success: boolean;
  solveMs: number;
  // Solo en supervivencia: el fallo vino de agotar el tiempo, no de mover mal.
  // El grid de progreso los pinta igual (rojo); se guarda para estadísticas.
  timedOut?: boolean;
}

export interface RunSummary {
  // Contrarreloj: duración de la partida. Supervivencia: tiempo por puzle.
  // Es el "cubo" por el que se agrupan récords y ranking.
  durationMs: number;
  solved: number;
  failed: number;
  attempts: number;
  accuracy: number;          // 0..1
  avgSolvedRating: number;   // media de rating SOLO de los acertados
  maxSolvedRating: number;
  avgSolveMs: number;        // tiempo medio por acierto
  startedAt: number;         // epoch ms
  endedAt: number;           // epoch ms
}

export interface RunRanking {
  rank: number;              // 1 = mejor partida de ese cubo
  total: number;             // total de partidas de ese cubo
  isPersonalBest: boolean;
  isWeekBest: boolean;
  bestSolvedAllTime: number;
  bestSolvedThisWeek: number;
}

export interface RunRecords {
  bestAllTime: number;
  bestThisWeek: number;
  total: number;
}
