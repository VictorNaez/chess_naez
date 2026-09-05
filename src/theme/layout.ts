import { Dimensions } from 'react-native';

export const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Alturas de las zonas animadas del área de juego
export const MOVE_LIST_HEIGHT = 40;   // modo puzzle: historial SAN en una línea
export const MULTI_PV_HEIGHT = 118;   // modo análisis: 3 líneas de multi-PV
export const ELO_ROW_HEIGHT = 76;

// Duración estándar de las transiciones de la app
export const ANIM_DURATION = 350;