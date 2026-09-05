export type ClockPhase = 'idle' | 'arming' | 'running' | 'finished';

export interface ClockAttempt {
  puzzleId: string;
  rating: number;
  success: boolean;
  solveMs: number;
}

export interface ClockRunSummary {
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

export interface ClockRanking {
  rank: number;              // 1 = mejor partida de esa duración
  total: number;             // total de partidas de esa duración
  isPersonalBest: boolean;
  isWeekBest: boolean;
  bestSolvedAllTime: number;
  bestSolvedThisWeek: number;
}

export interface ClockRecords {
  bestAllTime: number;
  bestThisWeek: number;
  total: number;
}