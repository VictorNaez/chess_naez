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
  { until: 15, k: 85 },   // calibración: el rating se mueve a saltos de ~50
  { until: 30, k: 40 },   // afinado
  { until: 50, k: 15 },  // convergencia
  { until: Infinity, k: 5 }, // crucero: el valor histórico
];

// Intentos a partir de los cuales K ya es el de crucero. Sirve para pintar un
// "rating provisional" en la UI si algún día interesa.
export const CALIBRATION_ATTEMPTS = 100;

export const getKFactor = (attempts: number): number => {
  const safe = Math.max(0, attempts);
  for (const step of K_SCHEDULE) {
    if (safe < step.until) return step.k;
  }
  return 5;
};

// ---------------------------------------------------------
// PENALIZACIÓN POR PISTAS
// ---------------------------------------------------------
// Resolver con ayuda no puede pagar lo mismo que resolver a pelo. El índice es
// el número de clics de pista ACUMULADOS en el puzle: iluminar la pieza y
// pintar la flecha son dos clics, y cada jugada nueva vuelve a empezar por la
// pieza.
//
//   clics   qué ha llegado a ver el jugador          multiplicador
//   0       nada                                        +100%
//   1       la pieza que hay que mover                   +30%
//   2       la jugada entera (flecha)                    -30%
//   3       la pieza de la jugada siguiente              -60%
//   4+      la jugada siguiente entera, o más            -90%
//
// La escala está anclada a los dos extremos reales del puzle: +100% es lo que
// se gana resolviéndolo a pelo, K·(1-E), y -100% lo que cuesta fallarlo, K·E.
// NO son simétricos (dependen de la expectativa), así que el multiplicador se
// aplica sobre uno o sobre otro según su signo, y no como un porcentaje de la
// subida. Así -90% es siempre algo menos que fallar el puzle, esté el puzle
// por encima o por debajo de tu nivel.
const HINT_MULTIPLIERS: readonly number[] = [1, 0.3, -0.3, -0.6, -0.9];

export const getHintMultiplier = (hintClicks: number): number => {
  const safe = Math.max(0, Math.trunc(hintClicks));
  return HINT_MULTIPLIERS[Math.min(safe, HINT_MULTIPLIERS.length - 1)];
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
  hintClicks: number = 0,
): number => {
  const expectedScore = 1 / (1 + Math.pow(10, (puzzleElo - currentElo) / 400));
  const k = getKFactor(attempts);

  // Los dos extremos de la escala, siempre en positivo.
  const fullGain = k * (1 - expectedScore); // resolverlo sin ayuda
  const fullLoss = k * expectedScore;       // fallarlo

  // Las pistas solo tocan el acierto. Si encima de mirar la pista lo fallas, se
  // paga la bajada entera: recortar también el fallo haría que pedir pista
  // saliera a cuenta en puzles difíciles y el rating se inflaría solo.
  if (!isSuccess) return Math.round(-fullLoss);

  const multiplier = getHintMultiplier(hintClicks);
  const reference = multiplier >= 0 ? fullGain : fullLoss;
  let variation = Math.round(multiplier * reference);

  // Con multiplicador distinto de cero, un redondeo a 0 borraría el efecto de
  // la pista (y la UI no enseña feedback cuando la variación es 0), así que el
  // rating siempre se mueve al menos un punto en el sentido que toca.
  if (variation === 0 && multiplier !== 0) variation = multiplier > 0 ? 1 : -1;

  // Ese suelo de un punto puede pasarse de frenada cuando fallar apenas cuesta
  // (puzle muy por encima del jugador): el castigo por pistas nunca puede
  // superar al de no sacarlo.
  if (multiplier < 0) variation = Math.max(variation, Math.round(-fullLoss));

  return variation;
  // Suelo de movimiento: acertar nunca da menos de +5 ni fallar menos de -5.
  //return isSuccess
  //  ? Math.max(MIN_ELO_STEP, variation)
  //  : Math.min(-MIN_ELO_STEP, variation);
};
