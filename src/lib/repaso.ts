import type { AppMode } from '../types/mode';
import type { RepasoOrder } from '../types/repaso';

// =========================================================
// QUÉ MODOS ALIMENTAN LA COLA
// =========================================================
// Contrarreloj y supervivencia se quedan fuera A PROPÓSITO: allí se falla por
// prisa, no por no ver el puzle, y una partida de 3 minutos metería 15-20
// puzles basura en la cola. Con dos runs al día la cola dejaría de significar
// nada y el modo repaso sería inútil.
//
// Si quieres cambiar de opinión, esta lista es el único sitio que hay que
// tocar: `canFeedRepaso` en index.tsx se deriva de aquí.
export const REPASO_SOURCE_MODES: readonly AppMode[] = ['puzzles'];

export const feedsRepaso = (mode: AppMode): boolean =>
  REPASO_SOURCE_MODES.includes(mode);

// =========================================================
// TAMAÑO DE SESIÓN
// =========================================================
// La cola se lee entera de golpe al empezar (una sola consulta) y se guarda en
// memoria. Con un tope de 300 el JOIN tarda <1 ms y el array pesa nada; si
// alguien acumula más, repasa los 300 primeros y el resto sigue esperando.
export const REPASO_SESSION_LIMIT = 300;

// =========================================================
// ORDEN DE LA SESIÓN
// =========================================================
export const REPASO_ORDERS: readonly { id: RepasoOrder; label: string }[] = [
  { id: 'oldest', label: 'ANTIGUOS' },
  { id: 'random', label: 'ALEATORIO' },
  { id: 'hardest', label: 'DIFÍCILES' },
];

export const DEFAULT_REPASO_ORDER: RepasoOrder = 'oldest';

// Retardo del primer movimiento de la máquina en repaso. Más corto que en modo
// puzles (1000 ms) porque ya conoces la posición, pero no tanto como en las
// partidas (CLOCK_TIMING.firstMove) porque aquí no corre el reloj.
export const REPASO_FIRST_MOVE_MS = 650;

// "hace 3 días" para el puzle más antiguo de la cola.
export const formatRelativeDays = (ts: number | null): string => {
  if (!ts) return '—';
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'hace 1 mes' : `hace ${months} meses`;
};
