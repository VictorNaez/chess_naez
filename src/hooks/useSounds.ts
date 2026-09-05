import { Audio } from 'expo-av';
import { useCallback, useEffect, useRef } from 'react';
import { useSettings } from './useSettings';

const SOUND_ASSETS = {
  move:    require('../../assets/sounds/move.mp3'),
  capture: require('../../assets/sounds/capture.mp3'),
  success: require('../../assets/sounds/success.mp3'),
  error:   require('../../assets/sounds/error.mp3'),
} as const;

type SoundKey = keyof typeof SOUND_ASSETS;

export function useSounds() {
  const { soundEnabled, volume } = useSettings();
  const soundsRef = useRef<Partial<Record<SoundKey, Audio.Sound>>>({});

  // Refs paralelos: la función que devolvemos debe ser estable (deps vacías),
  // así que no puede leer soundEnabled/volume del closure.
  const enabledRef = useRef(soundEnabled);
  const volumeRef = useRef(volume);

  useEffect(() => { enabledRef.current = soundEnabled; }, [soundEnabled]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
        });

        for (const key of Object.keys(SOUND_ASSETS) as SoundKey[]) {
          // volumeRef.current, no volume: los sonidos se cargan después de que
          // los ajustes lleguen de AsyncStorage, y el closure tendría el default.
          const { sound } = await Audio.Sound.createAsync(SOUND_ASSETS[key], {
            shouldPlay: false,
            volume: volumeRef.current,
          });
          if (cancelled) {
            sound.unloadAsync();
            return;
          }
          soundsRef.current[key] = sound;
        }
      } catch (e) {
        console.log('[useSounds] Error precargando sonidos:', e);
      }
    })();

    return () => {
      cancelled = true;
      Object.values(soundsRef.current).forEach(s => s?.unloadAsync());
      soundsRef.current = {};
    };
  }, []);

  // Si el usuario mueve el slider con los sonidos ya cargados, los reajustamos.
  useEffect(() => {
    Object.values(soundsRef.current).forEach(s => s?.setVolumeAsync(volume).catch(() => {}));
  }, [volume]);

  return useCallback((key: SoundKey) => {
    if (!enabledRef.current) return;
    soundsRef.current[key]?.replayAsync().catch(() => {});
  }, []);
}