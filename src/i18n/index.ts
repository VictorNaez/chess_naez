import { es } from './locales/es';
import { en } from './locales/en';

// La forma del diccionario la manda el español. Cualquier idioma nuevo se tipa
// como `Dictionary` y el compilador exige que esté completo.
export type Dictionary = typeof es;

export type Locale = 'es' | 'en';

// 'system' no es un idioma: es "usa lo que diga el móvil". Se guarda tal cual
// para que si el usuario cambia el idioma del sistema, la app le siga.
export type LocalePreference = Locale | 'system';

export const DICTIONARIES: Record<Locale, Dictionary> = { es, en };

export const AVAILABLE_LOCALES: { code: Locale; label: string }[] = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
];

export const FALLBACK_LOCALE: Locale = 'es';

/**
 * Idioma del dispositivo SIN expo-localization.
 *
 * expo-localization es un módulo nativo: añadirlo obliga a un rebuild de EAS
 * completo. Hermes en RN 0.81 ya expone Intl en Android, así que la locale del
 * sistema sale de ahí gratis. El try/catch cubre motores sin Intl (y web).
 */
export function getDeviceLocale(): Locale {
  try {
    const tag = Intl.DateTimeFormat().resolvedOptions().locale; // p.ej. "es-ES"
    const base = tag.split('-')[0].toLowerCase();
    if (base in DICTIONARIES) return base as Locale;
  } catch {
    // Sin Intl: nos quedamos con el fallback.
  }
  return FALLBACK_LOCALE;
}

export function resolveLocale(pref: LocalePreference): Locale {
  return pref === 'system' ? getDeviceLocale() : pref;
}
