import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';

// ---------------------------------------------------------------------------
// RESEÑA IN-APP
//
// Google limita por su cuenta cuántas veces se puede mostrar el diálogo, y no
// te dice si se ha mostrado ni qué votó el usuario. Eso NO nos exime de poner
// nuestras propias guardas: si lo pedimos en cada arranque, Google se lo come
// en silencio y quemamos la única oportunidad real que teníamos.
//
// Condiciones para pedirla:
//   - racha de 5 aciertos seguidos (el usuario está en buena racha, no acaba
//     de fallar);
//   - 15 minutos de uso real acumulado (no es alguien que acaba de instalar);
//   - no se lo hemos pedido en los últimos 30 días.
// ---------------------------------------------------------------------------

export const REVIEW_MIN_STREAK = 5;
export const REVIEW_MIN_USAGE_MS = 15 * 60 * 1000;

const LAST_ASK_KEY = '@review_last_ask';
const MIN_DAYS_BETWEEN_ASKS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

interface ReviewContext {
  /** Aciertos consecutivos ahora mismo. */
  streak: number;
  /** Milisegundos de uso en primer plano acumulados, de useAppUsageTime. */
  usageMs: number;
}

/**
 * Pide la reseña si se cumplen todas las condiciones. Silenciosa por diseño:
 * nunca lanza, nunca bloquea, y el llamante no necesita saber si se mostró.
 */
export const maybeAskForReview = async (ctx: ReviewContext): Promise<void> => {
  if (ctx.streak < REVIEW_MIN_STREAK) return;
  if (ctx.usageMs < REVIEW_MIN_USAGE_MS) return;

  try {
    // hasAction() es lo que hay que mirar, no isAvailableAsync(): en un APK
    // instalado fuera de Play el diálogo no existe aunque el módulo sí.
    if (!(await StoreReview.hasAction())) return;

    const raw = await AsyncStorage.getItem(LAST_ASK_KEY);
    const last = raw ? Number(raw) : 0;
    if (last && Date.now() - last < MIN_DAYS_BETWEEN_ASKS * DAY_MS) return;

    // Se marca ANTES de pedir: si requestReview falla a medias, preferimos
    // perder una petición a spamear en el siguiente arranque.
    await AsyncStorage.setItem(LAST_ASK_KEY, String(Date.now()));
    await StoreReview.requestReview();
  } catch (error) {
    console.log('[review] no se pudo pedir la reseña:', error);
  }
};
