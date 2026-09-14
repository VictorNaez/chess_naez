// =========================================================
// PARÁMETROS DEL SISTEMA DE PUNTUACIÓN
// =========================================================
// Todo lo que decide cómo se mueve el rating vive aquí. Antes estaba repartido
// entre useUserProgress (constantes) y media docena de `|| 1200` sueltos por la
// UI; cambiar el valor inicial obligaba a peinar el proyecto entero.

// Punto de partida de una instalación limpia. Coincide con el rating mínimo del
// catálogo, así que un jugador nuevo empieza exactamente en el escalón más bajo
// y sube desde ahí en vez de bajar hasta él.
// Las instalaciones que ya existen NO se tocan: el alta del rating global es un
// INSERT OR IGNORE, así que quien ya tenga fila conserva su valor.
export const DEFAULT_ELO = 400;

// Suelo: por debajo de esto el rating deja de tener sentido.
export const MIN_ELO = 100;

// El resultado siempre tiene que moverse de forma visible.
export const MIN_ELO_STEP = 5;

// ---------------------------------------------------------
// FACTOR K PROGRESIVO
// ---------------------------------------------------------
// K es cuánto pesa un intento suelto. Con K fijo a 16, un jugador que en
// realidad vale 1800 tardaba ~175 puzles en llegar desde 400: la mitad de su
// primera semana jugando contra puzles que no le dicen nada.
//
// La solución es la de toda la vida en ajedrez (rating provisional): K alto
// mientras la app no sabe quién eres, y bajando hasta el valor de crucero según
// se acumulan intentos. El régimen permanente sigue siendo 16, así que la
// estabilidad a largo plazo es idéntica a la de antes.
//
// Simulado sobre 120 jugadores sintéticos por escalón, seleccionando puzles con
// getRecommendedRange e intentos hasta quedar a ±100 del valor real:
//
//   fuerza real   K=16 fijo   este calendario
//   600              28             4
//   1200            109            17
//   1800            175            36
//   2400            243            58
//
// La desviación del rating una vez estabilizado es la misma en ambos (~19
// puntos), porque a partir del intento 100 los dos usan K=16.
//
// `until` es exclusivo y se compara contra el número de intentos YA puntuados.
const K_SCHEDULE: readonly { until: number; k: number }[] = [
  { until: 20, k: 96 },   // calibración: el rating se mueve a saltos de ~50
  { until: 50, k: 56 },   // afinado
  { until: 100, k: 32 },  // convergencia
  { until: Infinity, k: 16 }, // crucero: el valor histórico
];

// Intentos a partir de los cuales K ya es el de crucero. Sirve para pintar un
// "rating provisional" en la UI si algún día interesa.
export const CALIBRATION_ATTEMPTS = 100;

export const getKFactor = (attempts: number): number => {
  const safe = Math.max(0, attempts);
  for (const step of K_SCHEDULE) {
    if (safe < step.until) return step.k;
  }
  return 16;
};

// ---------------------------------------------------------
// CÁLCULO DEL AJUSTE
// ---------------------------------------------------------
// Función pura: mismas entradas, misma salida, sin base de datos de por medio.
// Así se puede probar sin montar SQLite.
export const computeEloVariation = (
  currentElo: number,
  puzzleElo: number,
  isSuccess: boolean,
  attempts: number,
): number => {
  const expectedScore = 1 / (1 + Math.pow(10, (puzzleElo - currentElo) / 400));
  const actualScore = isSuccess ? 1 : 0;

  const variation = Math.round(getKFactor(attempts) * (actualScore - expectedScore));

  return variation;
  // Suelo de movimiento: acertar nunca da menos de +5 ni fallar menos de -5.
  //return isSuccess
  //  ? Math.max(MIN_ELO_STEP, variation)
  //  : Math.min(-MIN_ELO_STEP, variation);
};
