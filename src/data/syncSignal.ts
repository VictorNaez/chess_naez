// =========================================================
// SEÑAL DE "HAY PROGRESO NUEVO"
// =========================================================
// Un emisor mínimo de módulo, sin React, para que la capa de datos pueda avisar
// a la copia en la nube sin saber que existe. La alternativa era pasar un
// callback desde el provider hasta useUserProgress y hasta saveRun, lo que
// obligaría a que media app conociese la sincronización.
//
// Nadie espera a esto: marcar es síncrono y no bloquea el guardado del puzle.

type Listener = () => void;

const listeners = new Set<Listener>();

/** La llaman los puntos que escriben progreso: puzle puntuado y partida guardada. */
export const markProgressDirty = (): void => {
  listeners.forEach(listener => {
    try { listener(); } catch { /* un oyente roto no puede tumbar el guardado */ }
  });
};

export const subscribeProgressDirty = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
