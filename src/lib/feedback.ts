import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';

// ---------------------------------------------------------------------------
// CONTACTO POR CORREO
//
// Sin backend, sin formulario de terceros y sin telemetría: se abre el cliente
// de correo del usuario con un borrador prerrellenado. El bloque de datos
// técnicos viaja DENTRO del cuerpo, a la vista, y el usuario puede borrarlo
// antes de enviar. Eso es lo que lo mantiene compatible con la promesa de la
// app (offline-first, sin cuenta, sin recogida de datos).
// ---------------------------------------------------------------------------

export const FEEDBACK_EMAIL = 'chess.naez@gmail.com';

export type FeedbackCategory = 'bug' | 'suggestion' | 'puzzle' | 'translation';

export const FEEDBACK_CATEGORIES: FeedbackCategory[] = [
  'bug',
  'suggestion',
  'puzzle',
  'translation',
];

/**
 * Etiqueta del asunto. NO se traduce a propósito: la bandeja de entrada es
 * siempre la misma, así que el filtro tiene que funcionar igual escriba el
 * usuario en ruso o en alemán.
 */
const SUBJECT_TAG: Record<FeedbackCategory, string> = {
  bug: 'Bug',
  suggestion: 'Suggestion',
  puzzle: 'Puzzle',
  translation: 'Translation',
};

export interface FeedbackContext {
  /** Idioma efectivo de la app ('es', 'de'...). */
  locale: string;
  /** Modo activo cuando se abrió el contacto. */
  mode: string;
  /** ELO global; entero, sin historial ni nada identificable. */
  elo: number;
  /** Id del puzle en pantalla, si lo hay: convierte "está mal" en accionable. */
  puzzleId?: string | null;
}

/**
 * Las claves van en inglés y sin traducir: las lee el desarrollador, no el
 * usuario, y así un correo en ruso sigue siendo legible.
 */
export function formatDiagnostics(ctx: FeedbackContext): string {
  const version = Constants.expoConfig?.version ?? '?';
  const build = Constants.expoConfig?.android?.versionCode ?? '?';

  const lines = [
    `App: ${version} (${build})`,
    `OS: ${Platform.OS} ${Platform.Version}`,
    `Locale: ${ctx.locale}`,
    `Mode: ${ctx.mode}`,
    `ELO: ${Math.round(ctx.elo)}`,
  ];
  if (ctx.puzzleId) lines.push(`Puzzle: ${ctx.puzzleId}`);
  return lines.join('\n');
}

interface FeedbackLabels {
  /** Línea que invita a escribir, arriba del todo del cuerpo. */
  bodyIntro: string;
  /** Cabecera del bloque de datos técnicos. */
  diagnosticsTitle: string;
}

export function buildFeedbackMailto(
  category: FeedbackCategory,
  ctx: FeedbackContext,
  labels: FeedbackLabels,
): string {
  const subject = `[Chess Naez] ${SUBJECT_TAG[category]} (${ctx.locale})`;

  const body = [
    labels.bodyIntro,
    '',
    '',
    '',
    '-----------------------------',
    labels.diagnosticsTitle,
    formatDiagnostics(ctx),
  ].join('\n');

  // encodeURIComponent, nunca encodeURI: hay que escapar '&' y '#' o el cliente
  // de correo corta el cuerpo en el primer separador de parámetros.
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Devuelve false si no hay ninguna app de correo; el llamante enseña entonces
 * la dirección para copiarla a mano.
 *
 * Deliberadamente NO se usa `canOpenURL`: en Android 11+ devuelve false para
 * `mailto:` salvo que se declare `<queries>` en el manifest, así que el único
 * test fiable (y el que no obliga a tocar el manifest) es intentar abrirlo.
 */
export async function openFeedbackEmail(
  category: FeedbackCategory,
  ctx: FeedbackContext,
  labels: FeedbackLabels,
): Promise<boolean> {
  try {
    await Linking.openURL(buildFeedbackMailto(category, ctx, labels));
    return true;
  } catch (error) {
    console.log('[feedback] no se pudo abrir el cliente de correo:', error);
    return false;
  }
}
