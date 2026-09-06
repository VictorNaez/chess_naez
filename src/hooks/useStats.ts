import * as SQLite from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';
import { EMPTY_STATS, loadStats, type StatsRange, type StatsSnapshot } from '../lib/statsQueries';

export const useStats = (db: SQLite.SQLiteDatabase | null) => {
  const [isStatsVisible, setIsStatsVisible] = useState(false);
  const [statsRange, setStatsRange] = useState<StatsRange>('all');
  const [stats, setStats] = useState<StatsSnapshot>(EMPTY_STATS);
  const [isStatsLoading, setIsStatsLoading] = useState(false);

  // Cambiar de rango dispara una consulta nueva sin esperar a la anterior.
  // El token descarta las respuestas que ya no corresponden al rango activo.
  const requestRef = useRef(0);

  const refresh = useCallback(async (range: StatsRange) => {
    if (!db) return;
    const token = ++requestRef.current;
    setIsStatsLoading(true);
    try {
      const snapshot = await loadStats(db, range);
      if (token === requestRef.current) setStats(snapshot);
    } catch (error) {
      console.error('Error cargando estadísticas:', error);
      if (token === requestRef.current) setStats(EMPTY_STATS);
    } finally {
      if (token === requestRef.current) setIsStatsLoading(false);
    }
  }, [db]);

  // Las consultas son varias y tocan toda la tabla: si se lanzan a la vez que
  // la animación de apertura, el modal entra a tirones. Esperamos a que acabe.
  const openStats = useCallback(() => {
    setIsStatsVisible(true);
    setIsStatsLoading(true);
    InteractionManager.runAfterInteractions(() => {
      refresh(statsRange);
    });
  }, [refresh, statsRange]);

  const closeStats = useCallback(() => setIsStatsVisible(false), []);

  // Recarga al cambiar de rango, solo con el panel abierto.
  useEffect(() => {
    if (!isStatsVisible) return;
    refresh(statsRange);
  }, [statsRange]);

  return {
    isStatsVisible,
    stats,
    isStatsLoading,
    statsRange,
    setStatsRange,
    openStats,
    closeStats,
  };
};
