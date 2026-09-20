import type { ThemeKey } from '../data/themeBits';

export interface Puzzle {
  id: string;
  fen: string;
  solution: string[];
  rating: number;
  /** Claves de Lichess ('fork', 'smotheredMate'...), ya decodificadas de th0/th1/th2. */
  themes: ThemeKey[];
}
