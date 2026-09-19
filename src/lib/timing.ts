// =========================================================
// TIEMPOS DEL MODO PUZLES
// =========================================================
// Hermano de CLOCK_TIMING (src/lib/clock.ts), que hace lo mismo para
// contrarreloj y supervivencia. Hasta ahora estos números vivían sueltos como
// literales repartidos por app/index.tsx, así que contrarreloj estaba afinado y
// el modo normal se había quedado con los valores del primer prototipo: el
// doble de lentos sin ninguna razón técnica.
//
// El ciclo completo de "pulsar Siguiente hasta poder mover" era:
//   180 (salida del tablero) + 1000 (firstMove) = ~1180 ms
// de los cuales solo 220 se iban en el deslizamiento de entrada. El resto era
// un tablero terminado y quieto en pantalla.
//
// Si algo se siente precipitado, se sube AQUÍ y en un solo sitio.
export const PUZZLE_TIMING = {
  // Espera antes de que la máquina haga la jugada forzada que abre el puzle.
  // Tiene que dar tiempo a que entre el tablero (BOARD_SLIDE_IN = 220) y a que
  // el ojo se sitúe, no más. Antes: 1000.
  firstMove: 600,

  // Pausa entre tu jugada correcta y la respuesta de la máquina. La animación
  // de la pieza dura `pieceMove`, así que esto es ese tiempo más el respiro
  // que quede. Antes: 450.
  machineReply: 320,

  // Duración de la animación de una pieza al desplazarse.
  pieceMove: 200,

  // Ventana en la que el panel de análisis deja de PUBLICAR resultados tras
  // una jugada. El motor sigue buscando y parseando: lo único que se retrasa
  // es el repintado, que en Fabric monta vistas en el hilo de UI, el mismo en
  // el que Reanimated está animando la pieza. Las profundidades bajas salen
  // casi instantáneas, así que sin esto caen 3-5 re-renders del panel MultiPV
  // justo encima de la animación. Tiene que cubrir `pieceMove` con holgura.
  engineOutputHold: 240,

  // Retardo del "✅" y del desbloqueo del tablero al completar el puzle.
  // Antes: 250.
  solvedFeedback: 180,

  // Retardo del "❌". Se deja más largo que el acierto a propósito: el fallo
  // hay que registrarlo visualmente antes de poder tocar nada.
  failFeedback: 250,

  // Cerrojo antifaroles del botón Siguiente. Tiene que cubrir como mínimo la
  // salida del tablero (BOARD_SLIDE_OUT = 180) más la consulta. Antes: 500.
  nextLock: 350,

  // Pausa tras devolver la pieza a su sitio, antes de empezar a reproducir la
  // solución. Antes: 800.
  solutionPause: 700,

  // Pausa entre jugadas mientras se reproduce la solución. Antes: 1000.
  solutionStep: 850,

  // Cerrojo del repaso post-partida (contrarreloj / supervivencia): tras abrir
  // un puzle desde el grid, el resto de cuadrados y el botón Siguiente quedan
  // bloqueados hasta que el puzle es jugable Y han pasado al menos estos ms.
  // Sin él, varios toques seguidos apilaban cargas y jugadas iniciales de
  // puzles distintos sobre el mismo tablero.
  reviewSwitchLock: 1000,

  // Tope de seguridad del cerrojo anterior: si por lo que sea el puzle nunca
  // llega a estar listo (consulta que falla), se libera igualmente.
  reviewSwitchLockMax: 3000,

  // Pausa entre pasos del rebobinado de Reintentar. Antes: 200.
  rewindStep: 180,

  // Pausa entre jugadas al reproducir una línea del motor en modo análisis.
  sequenceStep: 400,

  // Retraso para precargar el motor tras el resultado del puzle (✅/❌): deja
  // pasar la animación de resultado y el ELO antes de crear la WebView.
  enginePrewarm: 1200,
};
