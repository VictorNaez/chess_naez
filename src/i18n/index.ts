import { de } from './locales/de';
import { en } from './locales/en';
import { es } from './locales/es';
import { fr } from './locales/fr';
import { pt } from './locales/pt';
import { ru } from './locales/ru';

// La forma del diccionario la manda el español. Cualquier idioma nuevo se tipa
// como `Dictionary` y el compilador exige que esté completo.
export type Dictionary = typeof es;

export type Locale = 'es' | 'en' | 'pt' | 'ru' | 'fr' | 'de';

// 'system' no es un idioma: es "usa lo que diga el móvil". Se guarda tal cual
// para que si el usuario cambia el idioma del sistema, la app le siga.
export type LocalePreference = Locale | 'system';

export const DICTIONARIES: Record<Locale, Dictionary> = { es, en, pt, ru, fr, de };

/**
 * `label` es el código corto (para chips o sitios estrechos).
 * `nativeName` es el nombre del idioma EN ESE IDIOMA: no se traduce nunca, es
 * la convención de cualquier selector de idioma (un ruso debe reconocer
 * "Русский" aunque la app esté en español porque se equivocó al elegir).
 */
export const AVAILABLE_LOCALES: { code: Locale; label: string; nativeName: string }[] = [
  { code: 'es', label: 'ES', nativeName: 'Español' },
  { code: 'en', label: 'EN', nativeName: 'English' },
  { code: 'pt', label: 'PT', nativeName: 'Português' },
  { code: 'ru', label: 'RU', nativeName: 'Русский' },
  { code: 'fr', label: 'FR', nativeName: 'Français' },
  { code: 'de', label: 'DE', nativeName: 'Deutsch' },
];

/** Nombre nativo de una locale ya resuelta. Útil para "Sistema (Español)". */
export function nativeNameOf(code: Locale): string {
  return AVAILABLE_LOCALES.find(l => l.code === code)?.nativeName ?? code.toUpperCase();
}
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

export function isLocalePreference(raw: unknown): raw is LocalePreference {
  return typeof raw === 'string' && (raw === 'system' || raw in DICTIONARIES);
}
