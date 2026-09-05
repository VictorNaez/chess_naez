import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { DonationStatus } from '../../hooks/useDonations';
import { PALETTE } from '../colors';

interface SupportModalProps {
  visible: boolean;
  onClose: () => void;
  products: any[];
  status: DonationStatus;
  isAvailable: boolean;
  connected: boolean;
  onDonate: (productId: string) => void;
}

export const SupportModal = React.memo(({
  visible, onClose, products, status, isAvailable, connected, onDonate,
}: SupportModalProps) => {

  const busy = status === 'purchasing';

const cleanTitle = (raw: string) =>
  raw.replace(/\s*\(.*?\)\s*$/, '').trim()

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.supportModalContent}>

          <Ionicons name="heart" size={34} color={PALETTE.error} style={{ alignSelf: 'center' }} />
          <Text style={styles.modalTitle}>SUPPORT THE APP</Text>

          {status === 'thanks' ? (
            <Text style={styles.thanksText}>
              ¡Gracias de verdad! Tu apoyo ayuda a seguir mejorando la app.
            </Text>
          ) : (
            <>
              <Text style={styles.subtitle}>
                Esta app es gratuita y sin anuncios. Si te resulta útil, puedes apoyar su
                desarrollo. No desbloquea ninguna función extra: es solo un gesto.
              </Text>

              {!isAvailable || !connected ? (
                <Text style={styles.errorText}>
                  Los pagos no están disponibles ahora mismo. Inténtalo más tarde.
                </Text>
              ) : products.length === 0 ? (
                <ActivityIndicator color={PALETTE.secondary} style={{ marginVertical: 25 }} />
              ) : (
                <View style={styles.tierList}>
                  {products.map((p: any) => (
                    <TouchableOpacity
                      key={p.id ?? p.productId}
                      style={[styles.tierBtn, busy && { opacity: 0.4 }]}
                      disabled={busy}
                      onPress={() => onDonate(p.id ?? p.productId)}
                    >
                      <Text style={styles.tierTitle}>{cleanTitle(p.title)}</Text>
                      {/* displayPrice viene formateado por Play: NUNCA hardcodees el precio */}
                      <Text style={styles.tierPrice}>{p.displayPrice ?? p.localizedPrice}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {status === 'error' && (
                <Text style={styles.errorText}>No se pudo completar la operación.</Text>
              )}
            </>
          )}

          <TouchableOpacity style={styles.closeBtn} onPress={onClose} disabled={busy}>
            <Text style={styles.btnText}>{status === 'thanks' ? 'CERRAR' : 'AHORA NO'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  supportModalContent: { width: '88%', backgroundColor: PALETTE.surfaceDark, borderRadius: 30, padding: 25, borderWidth: 1, borderColor: PALETTE.chipBorder },
  modalTitle: { color: PALETTE.primary, fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginTop: 10, marginBottom: 12, letterSpacing: 1 },
  subtitle: { color: PALETTE.chipText, fontSize: 13, lineHeight: 19, textAlign: 'center', marginBottom: 20 },
  thanksText: { color: PALETTE.success, fontSize: 14, lineHeight: 20, textAlign: 'center', marginVertical: 20 },
  tierList: { gap: 10 },
  tierBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: PALETTE.surface, borderWidth: 1, borderColor: PALETTE.surfaceLight, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18 },
  tierTitle: { color: PALETTE.primary, fontSize: 13, fontWeight: '700', flexShrink: 1, minWidth: 0 },
  tierPrice: { color: PALETTE.secondary, fontSize: 14, fontWeight: '900', marginLeft: 12 },
  errorText: { color: PALETTE.error, fontSize: 12, textAlign: 'center', marginTop: 15 },
  closeBtn: { height: 46, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  btnText: { color: PALETTE.accent, fontWeight: '900', fontSize: 13, letterSpacing: 1.5 },
});