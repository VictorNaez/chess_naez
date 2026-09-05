import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { setHapticsEnabled } from '../lib/haptics';

export interface AppSettings {
  soundEnabled: boolean;
  volume: number;          // 0..1
  hapticsEnabled: boolean;
  showTimer: boolean;
  showLegalMoves: boolean;
  engineDepth: number;     // profundidad del 'go depth N'
  engineHash: number;      // MB de tabla hash
  engineMultiPV: number;   // nº de líneas de análisis (1..3)
}

export const DEFAULT_SETTINGS: AppSettings = {
  soundEnabled: true,
  volume: 0.8,
  hapticsEnabled: true,
  showTimer: true,
  showLegalMoves: true,
  engineDepth: 15,
  engineHash: 16,
  engineMultiPV: 3,
};

const STORAGE_KEY = '@app_settings';

interface SettingsContextValue extends AppSettings {
  isSettingsLoaded: boolean;
  setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);
  const hasLoadedRef = useRef(false);

  // CARGA: pintamos con los defaults desde el primer frame y luego mezclamos lo
  // guardado. Si bloqueáramos el render hasta leer AsyncStorage, un fallo de
  // lectura dejaría la app colgada en el splash.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          // Mezcla con DEFAULT_SETTINGS: si mañana añades una opción nueva,
          // los usuarios antiguos no se quedan con undefined en esa clave.
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
        }
      } catch (e) {
        console.log('[useSettings] Error cargando ajustes:', e);
      } finally {
        hasLoadedRef.current = true;
        setIsSettingsLoaded(true);
      }
    })();
  }, []);

  // GUARDADO: nunca antes de haber leído, o el primer render pisaría con los
  // defaults lo que el usuario tenía guardado.
  useEffect(() => {
    if (!hasLoadedRef.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings)).catch(() => {});
  }, [settings]);

  // Puente hacia el módulo de haptics (bandera de módulo, no React)
  useEffect(() => {
    setHapticsEnabled(settings.hapticsEnabled);
  }, [settings.hapticsEnabled]);

  const setSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(prev => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }, []);

  const resetSettings = useCallback(() => setSettings(DEFAULT_SETTINGS), []);

  const value = useMemo(
    () => ({ ...settings, isSettingsLoaded, setSetting, resetSettings }),
    [settings, isSettingsLoaded, setSetting, resetSettings]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings debe usarse dentro de <SettingsProvider>');
  return ctx;
}