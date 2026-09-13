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
  move:    require('../../assets/sounds/move.mp3'),
  capture: require('../../assets/sounds/capture.mp3'),
  success: require('../../assets/sounds/success.mp3'),
  error:   require('../../assets/sounds/error.mp3'),
} as const;

type SoundKey = keyof typeof SOUND_ASSETS;

export function useSounds() {
  const { soundEnabled, volume } = useSettings();
  const playersRef = useRef<Partial<Record<SoundKey, AudioPlayer>>>({});

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
        player.volume = volume;
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
    };
    // Deliberadamente vacío: `volume` se aplica en el efecto de abajo. Meterlo
    // aquí recrearía los cuatro players en cada tick del slider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El usuario mueve el slider con los sonidos ya cargados.
  useEffect(() => {
    Object.values(playersRef.current).forEach(p => {
      try { if (p) p.volume = volume; } catch { /* noop */ }
    });
  }, [volume]);

  return useCallback((key: SoundKey) => {
    if (!enabledRef.current) return;
    const player = playersRef.current[key];
    if (!player) return;
    try {
      // seekTo(0) antes de play() es el equivalente a replayAsync: sin él, un
      // sonido que ya llegó al final no vuelve a sonar.
      player.seekTo(0);
      player.play();
    } catch { /* el player pudo liberarse entre medias */ }
  }, []);
}
