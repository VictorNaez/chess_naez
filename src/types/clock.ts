// Los tipos del contrarreloj se generalizaron a `types/run.ts` cuando entró
// supervivencia. Este archivo se mantiene como alias para no tocar los imports
// existentes (lib/clock, useClockMode, ClockProgressGrid...).
export type {
  RunAttempt as ClockAttempt,
  RunPhase as ClockPhase,
  RunRanking as ClockRanking,
  RunRecords as ClockRecords,
  RunSummary as ClockRunSummary
} from './run';

