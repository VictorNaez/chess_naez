import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import {
  ActivityIndicator, Alert, StyleSheet, Switch, Text, TouchableOpacity, View,
} from 'react-native';
import { useCloudSync } from '../../hooks/useCloudSync';
import { useI18n } from '../../i18n/I18nProvider';
import { PALETTE } from '../colors';

// =========================================================
// COPIA EN LA NUBE — SECCIÓN DE AJUSTES
// =========================================================
// Vive en su propio fichero y no dentro de SettingsModal a propósito: el modal
// ya pasa de 400 líneas y esto es lo único que habla con Drive. Si la build no
// trae client ID configurado, no se pinta nada.

interface CloudSyncSectionProps {
  /** El modal de ajustes está en pantalla: momento de mirar qué hay en Drive. */
  visible: boolean;
  /** Rearranque de la base tras restaurar. Lo provee index.tsx. */
  onRestored: () => void;
}

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

export const CloudSyncSection = React.memo(({ visible, onRestored }: CloudSyncSectionProps) => {
  const { t, locale } = useI18n();
  const cloud = useCloudSync();

  // El modal vive montado desde el arranque (un <Modal visible={...}>), así que
  // el disparador es que SE ABRA, no el montaje: al abrirlo miramos qué hay al
  // otro lado, que el usuario pudo haber jugado en otro móvil desde entonces.
  useEffect(() => {
    if (visible && cloud.email) void cloud.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, cloud.email]);

  if (!cloud.available) return null;

  const busy = cloud.status === 'working';
  const remoteProps = cloud.remote?.appProperties ?? {};
  const remoteSavedAt = Number(remoteProps.savedAt ?? 0);
  const remoteLine = cloud.remote
    ? `${formatWhen(remoteSavedAt, locale)} · ${t.cloud.summary(
        Number(remoteProps.elo ?? 0), Number(remoteProps.puzzles ?? 0))}`
    : t.cloud.noBackup;

  const localLine = t.cloud.summary(cloud.localSummary.globalElo, cloud.localSummary.puzzles);

  const confirmRestore = () => {
    Alert.alert(
      t.cloud.restoreTitle,
      t.cloud.restoreBody(remoteLine, localLine),
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.cloud.restore,
          style: 'destructive',
          onPress: () => {
            void cloud.restoreFromCloud().then(ok => { if (ok) onRestored(); });
          },
        },
      ],
    );
  };

  const confirmDelete = () => {
    Alert.alert(
      t.cloud.deleteTitle,
      t.cloud.deleteBody,
      [
        { text: t.common.cancel, style: 'cancel' },
        { text: t.cloud.deleteRemote, style: 'destructive', onPress: () => { void cloud.deleteRemote(); } },
      ],
    );
  };

  return (
    <>
      <Text style={styles.sectionTitle}>{t.cloud.section}</Text>
      <View style={styles.card}>
        {!cloud.email ? (
          <View style={styles.block}>
            <Text style={styles.rowLabel}>{t.cloud.signedOut}</Text>
            <Text style={styles.rowHint}>{t.cloud.signedOutHint}</Text>
            <TouchableOpacity
              style={[styles.primaryBtn, busy && styles.btnDisabled]}
              onPress={() => { void cloud.signIn(); }}
              disabled={busy || !cloud.isReady}
            >
              {busy
                ? <ActivityIndicator color={PALETTE.accent} size="small" />
                : (
                  <>
                    <Ionicons name="logo-google" size={15} color={PALETTE.accent} />
                    <Text style={styles.primaryBtnText}>{t.cloud.signIn}</Text>
                  </>
                )}
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Ionicons name="cloud-done-outline" size={18} color={PALETTE.secondary} style={styles.rowIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel} numberOfLines={1}>{cloud.email}</Text>
                  <Text style={styles.rowHint} numberOfLines={2}>{remoteLine}</Text>
                </View>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Ionicons name="sync-outline" size={18} color={PALETTE.secondary} style={styles.rowIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>{t.cloud.autoBackup}</Text>
                  <Text style={styles.rowHint}>{t.cloud.autoBackupHint}</Text>
                </View>
              </View>
              <Switch
                value={cloud.autoBackup}
                onValueChange={cloud.setAutoBackup}
                trackColor={{ false: PALETTE.surfaceLight, true: PALETTE.secondary }}
                thumbColor="#ffffff"
                ios_backgroundColor={PALETTE.surfaceLight}
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.actionBtn, busy && styles.btnDisabled]}
                onPress={() => { void cloud.backupNow(); }}
                disabled={busy}
              >
                {busy
                  ? <ActivityIndicator color={PALETTE.secondary} size="small" />
                  : <Text style={styles.actionBtnText}>{t.cloud.backupNow}</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, (busy || !cloud.remote) && styles.btnDisabled]}
                onPress={confirmRestore}
                disabled={busy || !cloud.remote}
              >
                <Text style={styles.actionBtnText}>{t.cloud.restore}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.footerLinks}>
              <TouchableOpacity onPress={() => { void cloud.signOut(); }} disabled={busy}>
                <Text style={styles.linkText}>{t.cloud.signOut}</Text>
              </TouchableOpacity>
              {!!cloud.remote && (
                <TouchableOpacity onPress={confirmDelete} disabled={busy}>
                  <Text style={[styles.linkText, styles.linkDanger]}>{t.cloud.deleteRemote}</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}

        {!!cloud.error && (
          <Text style={styles.errorText}>{t.cloud.errors[cloud.error]}</Text>
        )}
      </View>
    </>
  );
});

// Mismos tokens que SettingsModal: esto es una sección más de ese modal, no una
// pantalla aparte.
const styles = StyleSheet.create({
  sectionTitle: { color: PALETTE.chipText, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)' },

  block: { paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 },
  rowIcon: { width: 24 },
  rowLabel: { color: PALETTE.primary, fontSize: 14, fontWeight: '700' },
  rowHint: { color: PALETTE.chipText, fontSize: 11, marginTop: 2, opacity: 0.8 },

  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: 12, backgroundColor: PALETTE.secondary, marginTop: 14 },
  primaryBtnText: { color: PALETTE.accent, fontWeight: '900', fontSize: 12, letterSpacing: 1 },

  actions: { flexDirection: 'row', gap: 10, paddingVertical: 12 },
  actionBtn: { flex: 1, minWidth: 0, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: PALETTE.chipBg, borderWidth: 1, borderColor: PALETTE.chipBorder },
  actionBtnText: { color: PALETTE.secondary, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  btnDisabled: { opacity: 0.4 },

  footerLinks: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingBottom: 12 },
  linkText: { color: PALETTE.chipText, fontSize: 11, fontWeight: '700', textDecorationLine: 'underline' },
  linkDanger: { color: PALETTE.error },

  errorText: { color: PALETTE.error, fontSize: 11, fontWeight: '700', paddingBottom: 12 },
});
