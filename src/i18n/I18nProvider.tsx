import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  DICTIONARIES,
  FALLBACK_LOCALE,
  isLocalePreference,
  resolveLocale,
  type Dictionary,
  type Locale,
  type LocalePreference,
} from './index';

const STORAGE_KEY = '@app_locale';

interface I18nContextValue {
  t: Dictionary;                 // diccionario ya resuelto
  locale: Locale;                // idioma efectivo ('es' | 'en')
  preference: LocalePreference;  // lo que eligió el usuario ('system' incluido)
  setPreference: (p: LocalePreference) => void;
  isLocaleLoaded: boolean;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Arrancamos en 'system' para que el primer frame ya salga en el idioma del
  // móvil; si hay preferencia guardada, se aplica en cuanto llega AsyncStorage.
  const [preference, setPreferenceState] = useState<LocalePreference>('system');
  const [isLocaleLoaded, setIsLocaleLoaded] = useState(false);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (isLocalePreference(raw)) {
        setPreferenceState(raw);
      }
      } catch (e) {
        console.log('[i18n] Error cargando idioma:', e);
      } finally {
        hasLoadedRef.current = true;
        setIsLocaleLoaded(true);
      }
    })();
  }, []);

  // Mismo patrón que useSettings: no escribir antes de haber leído, o el primer
  // render pisaría la preferencia guardada con el default.
  useEffect(() => {
    if (!hasLoadedRef.current) return;
    AsyncStorage.setItem(STORAGE_KEY, preference).catch(() => {});
  }, [preference]);

  const setPreference = useCallback((p: LocalePreference) => {
    setPreferenceState(prev => (prev === p ? prev : p));
  }, []);

  const locale = useMemo(() => resolveLocale(preference), [preference]);

  const value = useMemo<I18nContextValue>(() => ({
    t: DICTIONARIES[locale] ?? DICTIONARIES[FALLBACK_LOCALE],
    locale,
    preference,
    setPreference,
    isLocaleLoaded,
  }), [locale, preference, setPreference, isLocaleLoaded]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n debe usarse dentro de <I18nProvider>');
  return ctx;
}

/** Atajo para el caso normal: `const t = useT(); ... t.settings.title` */
export function useT(): Dictionary {
  return useI18n().t;
}
