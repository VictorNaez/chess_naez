import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useCloudSync } from '../../hooks/useCloudSync';
import { useI18n } from '../../i18n/I18nProvider';
import { PALETTE } from '../colors';

// =========================================================
// CUENTA DE PLAY GAMES — CABECERA DE AJUSTES
// =========================================================
// No es una sección más, y por eso no lleva ni título en mayúsculas ni la
// tarjeta gris del resto: va arriba del todo, como la fila de cuenta de
// cualquier app moderna. Punto verde, avatar, nombre.
//
// Dos estados y nada más. Conectado: quién eres. Sin conectar: un botón. Todo lo
// demás (guardar, restaurar, elegir si la copia es automática) lo hace la app
// sola y no necesita controles.
//
// El avatar puede no llegar: hay jugadores sin foto, y la Uri que da Play Games
// puede fallar al cargar. En ese caso se pinta la inicial sobre el círculo, que
// se parece más a una app terminada que un hueco gris.

interface CloudAccountRowProps {
  /** El modal de ajustes está en pantalla: momento de mirar qué hay en la nube. */
  visible: boolean;
}

export const CloudAccountRow = React.memo(({ visible }: CloudAccountRowProps) => {
  const { t } = useI18n();
  const cloud = useCloudSync();
  const [avatarFailed, setAvatarFailed] = useState(false);

  const identity = cloud.identity;

  // El modal vive montado desde el arranque (un <Modal visible={...}>), así que
  // el disparador es que SE ABRA, no el montaje.
  useEffect(() => {
    if (visible && identity) void cloud.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, identity]);

  // Una foto nueva merece otra oportunidad de cargarse.
  useEffect(() => { setAvatarFailed(false); }, [identity?.avatarUri]);

  if (!cloud.available) return null;

  const busy = cloud.status === 'working';
  const avatarUri = identity?.avatarUri;
  const showAvatar = !!avatarUri && !avatarFailed;
  const initial = (identity?.name ?? '?').trim().charAt(0).toUpperCase() || '?';

  if (!identity) {
    return (
      <View style={styles.wrapper}>
        <TouchableOpacity
          style={[styles.connectRow, busy && styles.disabled]}
          onPress={() => { void cloud.signIn(); }}
          disabled={busy || !cloud.isReady}
          activeOpacity={0.85}
        >
          <View style={[styles.avatar, styles.avatarEmpty]}>
            <Ionicons name="cloud-offline-outline" size={20} color={PALETTE.warning} />
          </View>
          <View style={styles.texts}>
            <Text style={styles.name} numberOfLines={1}>{t.cloud.statusDisconnected}</Text>
            <Text style={styles.subtitle} numberOfLines={2}>{t.cloud.signedOutHint}</Text>
          </View>
          {busy
            ? <ActivityIndicator color={PALETTE.secondary} size="small" />
            : <Ionicons name="chevron-forward" size={18} color={PALETTE.chipText} />}
        </TouchableOpacity>

        <Text style={styles.connectCta}>{t.cloud.connectPlayGames}</Text>
        {!!cloud.error && <Text style={styles.errorText}>{t.cloud.errors[cloud.error]}</Text>}
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        <View>
          {showAvatar ? (
            <Image
              source={{ uri: avatarUri }}
              style={styles.avatar}
              onError={() => setAvatarFailed(true)}
            />
          ) : (
            <View style={[styles.avatar, styles.avatarEmpty]}>
              <Text style={styles.avatarInitial}>{initial}</Text>
            </View>
          )}
          {/* El punto verde monta sobre el borde del avatar, no al lado: es lo
              que hace que se lea como "en línea" y no como un icono suelto. */}
          <View style={styles.dot} />
        </View>

        <View style={styles.texts}>
          <Text style={styles.name} numberOfLines={1}>{identity.name}</Text>
          <Text style={styles.subtitle} numberOfLines={2}>{t.cloud.connectedHint}</Text>
        </View>

        {busy && <ActivityIndicator color={PALETTE.secondary} size="small" />}
      </View>

      <Text style={styles.note}>{t.cloud.playGamesNote}</Text>
      {!!cloud.error && <Text style={styles.errorText}>{t.cloud.errors[cloud.error]}</Text>}
    </View>
  );
});

const AVATAR = 44;

const styles = StyleSheet.create({
  wrapper: { marginBottom: 22 },
  row: { flexDirection: 'row', alignItems: 'center' },
  connectRow: { flexDirection: 'row', alignItems: 'center' },
  disabled: { opacity: 0.5 },

  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: PALETTE.surface },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  avatarInitial: { color: PALETTE.primary, fontSize: 18, fontWeight: '800' },
  dot: {
    position: 'absolute', right: -1, bottom: -1,
    width: 13, height: 13, borderRadius: 7,
    backgroundColor: PALETTE.success,
    // El borde del color del modal recorta el círculo contra el avatar y le da
    // el aire de indicador de presencia.
    borderWidth: 2.5, borderColor: PALETTE.surfaceDark,
  },

  texts: { flex: 1, marginLeft: 14, marginRight: 10 },
  name: { color: PALETTE.primary, fontSize: 15, fontWeight: '800' },
  subtitle: { color: PALETTE.chipText, fontSize: 11, marginTop: 3, opacity: 0.8, lineHeight: 15 },

  connectCta: { color: PALETTE.secondary, fontSize: 11, fontWeight: '900', letterSpacing: 1, marginTop: 12, marginLeft: AVATAR + 14 },
  note: { color: PALETTE.chipText, fontSize: 10, lineHeight: 14, opacity: 0.5, marginTop: 10 },
  errorText: { color: PALETTE.error, fontSize: 11, fontWeight: '700', marginTop: 8 },
});
