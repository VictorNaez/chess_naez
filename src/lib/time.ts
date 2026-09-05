// Formatea milisegundos a reloj legible: 0:07 · 1:32 · 1:05:20
export const formatDuration = (ms: number | null | undefined): string => {
  if (ms === null || ms === undefined || ms < 0) return '—';

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};