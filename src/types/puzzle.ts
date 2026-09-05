export interface Puzzle {
  id: string;
  fen: string;
  solution: string[];
  rating: number;
  themes: string;
}