import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View,
} from 'react-native';
import { useCloudSync } from '../../hooks/useCloudSync';
import { useI18n } from '../../i18n/I18nProvider';
import { hapticImpact } from '../../lib/haptics';
import { modalWidthFor } from '../../theme/responsive';
import { PALETTE } from '../colors';

// =========================================================
// AVISO DE COPIA EN LA NUBE
// =========================================================
// Enterrada en Ajustes, esta función no la encuentra nadie. Este aviso sale solo
// al abrir la app, y solo cuando tiene algo que decir:
//
//   signIn  -> el jugador ya lleva puzles suficientes como para que perderlos
//              duela, y nunca ha iniciado sesión
//   restore -> hay una copia en su cuenta MÁS avanzada que este dispositivo,
//              señal de que ha jugado en otro móvil
//
// Quién decide cuál (y si toca o no) es el provider; aquí solo se pinta. Cerrar
// siempre es una opción visible: esto propone, no exige.

const formatWhen = (epochMs: number, locale: string): string => {
  if (!epochMs) return '';
  try {
    return new Date(epochMs).toLocaleString(locale, {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return new Date(epochMs).toISOString().slice(0, 16).replace('T', ' ');
  }
};

export const CloudPromptModal = React.memo(() => {
  const { t, locale } = useI18n();
  const cloud = useCloudSync();
  const { width: windowWidth } = useWindowDimensions();

  const kind = cloud.prompt;
  if (!kind) return null;

  const busy = cloud.status === 'working';
  const props = cloud.remote?.appProperties ?? {};
  const remoteLine = `${formatWhen(Number(props.savedAt ?? 0), locale)} · ${
    t.cloud.summary(Number(props.elo ?? 0), Number(props.puzzles ?? 0))}`;

  const isSignIn = kind === 'signIn';

  const confirm = () => {
    hapticImpact('light');
    if (isSignIn) void cloud.signIn();
    else void cloud.restoreFromCloud().then(ok => { if (ok) cloud.dismissPrompt(); });
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={cloud.dismissPrompt}>
      <View style={styles.overlay}>
        <View style={[styles.card, { width: modalWidthFor(windowWidth) }]}>
          <View style={styles.iconWrap}>
            <Ionicons
              name={isSignIn ? 'cloud-upload-outline' : 'cloud-download-outline'}
              size={30}
              color={PALETTE.secondary}
            />
          </View>

          <Text style={styles.title}>
            {isSignIn ? t.cloud.promptSignInTitle : t.cloud.promptRestoreTitle}
          </Text>
          <Text style={styles.body}>
            {!isSignIn
              ? t.cloud.promptRestoreBody(remoteLine)
              // Dispositivo sin progreso: o es un jugador nuevo, o acaba de
              // reinstalar. En los dos casos hablar de "tus 0 puzles" sobra.
              : cloud.localSummary.puzzles === 0
                ? t.cloud.promptSignInBodyFresh
                : t.cloud.promptSignInBody(cloud.localSummary.puzzles)}
          </Text>

          <Pressable
            style={({ pressed }) => [styles.primaryBtn, (pressed || busy) && styles.btnPressed]}
            onPress={confirm}
            disabled={busy}
          >
            {busy
              ? <ActivityIndicator color={PALETTE.accent} size="small" />
              : (
                <>
                  {isSignIn && <Ionicons name="logo-google" size={15} color={PALETTE.accent} />}
                  <Text style={styles.primaryBtnText}>
                    {isSignIn ? t.cloud.signIn : t.cloud.restore}
                  </Text>
                </>
              )}
          </Pressable>

          <Pressable style={styles.secondaryBtn} onPress={cloud.dismissPrompt} disabled={busy}>
            <Text style={styles.secondaryBtnText}>{t.cloud.promptLater}</Text>
          </Pressable>

          {!!cloud.error && <Text style={styles.errorText}>{t.cloud.errors[cloud.error]}</Text>}
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: PALETTE.surface, borderRadius: 20, padding: 22, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  iconWrap: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: PALETTE.chipBg, marginBottom: 14 },
  title: { color: PALETTE.primary, fontSize: 17, fontWeight: '900', textAlign: 'center' },
  body: { color: PALETTE.chipText, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 10, marginBottom: 20 },

  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'stretch', height: 46, borderRadius: 12, backgroundColor: PALETTE.secondary },
  primaryBtnText: { color: PALETTE.accent, fontWeight: '900', fontSize: 12, letterSpacing: 1 },
  btnPressed: { opacity: 0.75 },

  secondaryBtn: { alignSelf: 'stretch', height: 42, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  secondaryBtnText: { color: PALETTE.chipText, fontSize: 12, fontWeight: '700' },

  errorText: { color: PALETTE.error, fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 8 },
});
