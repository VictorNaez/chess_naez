import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useCallback, useEffect, useRef } from 'react';
import { useSettings } from './useSettings';

// ---------------------------------------------------------------------------
// MIGRADO DE expo-av A expo-audio
//
// Dos motivos, uno técnico y uno de tienda:
//   - expo-av está deprecado desde SDK 53 y desaparece en SDK 55.
//   - el config plugin de expo-av mete android.permission.RECORD_AUDIO en el
//     manifest. Un entrenador de ajedrez pidiendo micrófono es una casilla más
//     que rellenar en Seguridad de los Datos y una bandera roja en la ficha.
//
// Diferencia de API relevante: createAudioPlayer es SÍNCRONO (devuelve el
// player, no una promesa), así que la precarga ya no necesita el baile de
// `cancelled` que tenía la versión con Audio.Sound.createAsync.
// ---------------------------------------------------------------------------

const SOUND_ASSETS = {
  // Jugadas (el que suena lo elige moveSoundFor en src/lib/moveSound.ts)
  move:     require('../../assets/sounds/move.mp3'),
  capture:  require('../../assets/sounds/capture.mp3'),
  check:    require('../../assets/sounds/check.mp3'),
  castle:   require('../../assets/sounds/castle.mp3'),
  promote:  require('../../assets/sounds/promote.mp3'),
  // Resultado del puzle
  success:  require('../../assets/sounds/success.mp3'),
  error:    require('../../assets/sounds/error.mp3'),
  hint:     require('../../assets/sounds/hint.mp3'),
  // Partidas (contrarreloj / supervivencia)
  start:    require('../../assets/sounds/start.mp3'),
  countdown: require('../../assets/sounds/countdown.mp3'), // aviso: se acaba el tiempo
  run_end:  require('../../assets/sounds/run_end.mp3'),
  record:   require('../../assets/sounds/record.mp3'),
} as const;

export type SoundKey = keyof typeof SOUND_ASSETS;

// Todos los archivos están igualados al mismo volumen percibido (ponderación K,
// ventana de 100 ms), así que el reparto entre sonidos lo decide solo el audio.
// Este factor baja el conjunto: el volumen del ajuste (0..1) se multiplica por
// él. 0.3 = 30 % de la amplitud que había antes (unos -10,5 dB).
const MASTER_VOLUME = 0.3;

// ---------------------------------------------------------------------------
// CANAL DEL TABLERO
//
// Los sonidos de jugada comparten un único "canal": el nuevo corta al que esté
// sonando. Al navegar rápido con las flechas (o con respuestas rápidas en
// contrarreloj) las colas de 0,3-0,6 s se amontonaban unas encima de otras.
//
// El resto (éxito, error, pista, avisos de partida) va por libre: un
// movimiento no debe cortar el aviso de tiempo ni el sonido de récord.
// ---------------------------------------------------------------------------
const BOARD_SOUNDS: ReadonlySet<SoundKey> = new Set<SoundKey>(['move', 'capture', 'check', 'castle', 'promote']);

export function useSounds() {
  const { soundEnabled, volume } = useSettings();
  const playersRef = useRef<Partial<Record<SoundKey, AudioPlayer>>>({});
  // Último sonido del canal del tablero: es el único que puede estar sonando,
  // así que basta con pausar ese (sin preguntar a nativo si sigue sonando).
  const lastBoardRef = useRef<SoundKey | null>(null);

  // Ref paralelo: la función que devolvemos debe ser estable (deps vacías),
  // así que no puede leer soundEnabled del closure.
  const enabledRef = useRef(soundEnabled);
  useEffect(() => { enabledRef.current = soundEnabled; }, [soundEnabled]);

  useEffect(() => {
    // No bloquea la creación de los players: si falla, los sonidos suenan
    // igual, solo que sin el modo de audio configurado.
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      // Un efecto de 200 ms no tiene por qué pausar la música del usuario.
      interruptionMode: 'mixWithOthers',
    }).catch(e => console.log('[useSounds] setAudioModeAsync:', e));

    for (const key of Object.keys(SOUND_ASSETS) as SoundKey[]) {
      try {
        const player = createAudioPlayer(SOUND_ASSETS[key]);
        player.volume = volume * MASTER_VOLUME;
        playersRef.current[key] = player;
      } catch (e) {
        console.log('[useSounds] Error precargando', key, e);
      }
    }

    // Capturamos el objeto ahora: en la limpieza, playersRef.current ya podría
    // apuntar a otra cosa si el hook se remontase.
    const players = playersRef.current;
    return () => {
      Object.values(players).forEach(p => {
        try { p?.remove(); } catch { /* ya liberado */ }
      });
      playersRef.current = {};
      lastBoardRef.current = null;
    };
    // Deliberadamente vacío: `volume` se aplica en el efecto de abajo. Meterlo
    // aquí recrearía todos los players en cada tick del slider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El usuario mueve el slider con los sonidos ya cargados.
  useEffect(() => {
    Object.values(playersRef.current).forEach(p => {
      try { if (p) p.volume = volume * MASTER_VOLUME; } catch { /* noop */ }
    });
  }, [volume]);

  return useCallback((key: SoundKey) => {
    if (!enabledRef.current) return;
    const player = playersRef.current[key];
    if (!player) return;
    try {
      if (BOARD_SOUNDS.has(key)) {
        const prev = lastBoardRef.current;
        // El mismo sonido no hace falta pausarlo: el seekTo(0) de abajo ya lo
        // reinicia aunque esté sonando.
        if (prev && prev !== key) playersRef.current[prev]?.pause();
        lastBoardRef.current = key;
      }
      // seekTo(0) antes de play() es el equivalente a replayAsync: sin él, un
      // sonido que ya llegó al final no vuelve a sonar. En Android pause,
      // seekTo y play se encolan en el hilo principal en este mismo orden, así
      // que no hace falta esperar a la promesa del seekTo.
      player.seekTo(0);
      player.play();
    } catch { /* el player pudo liberarse entre medias */ }
  }, []);
}
