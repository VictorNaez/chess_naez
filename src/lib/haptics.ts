import * as Haptics from 'expo-haptics';

// Bandera a nivel de módulo, no estado de React: así cualquier punto del código
// (incluido ChessBoard, que se re-renderiza en cada jugada) consulta el ajuste
// sin suscribirse a un contexto ni provocar renders extra.
let enabled = true;

export const setHapticsEnabled = (value: boolean) => { enabled = value; };
export const areHapticsEnabled = () => enabled;

export type ImpactStyle = 'light' | 'medium' | 'heavy';

const IMPACT_MAP = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
} as const;

export const hapticImpact = (style: ImpactStyle = 'medium') => {
  if (!enabled) return;
  Haptics.impactAsync(IMPACT_MAP[style]).catch(() => {});
};

export const hapticSuccess = () => {
  if (!enabled) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
};

export const hapticError = () => {
  if (!enabled) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
};