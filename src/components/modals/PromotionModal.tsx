import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SCREEN_WIDTH } from '../../theme/layout';
import { PALETTE } from '../colors';

interface PromotionModalProps {
  visible: boolean;
  playerColor: 'w' | 'b';
  getPieceImage: (piece: string) => any;
  onSelect: (piece: string) => void;
  onCancel: () => void;
}

const PROMOTION_PIECES = ['q', 'r', 'b', 'n'];

export const PromotionModal = React.memo(({
  visible,
  playerColor,
  getPieceImage,
  onSelect,
  onCancel,
}: PromotionModalProps) => {
  if (!visible) return null;

  return (
    <View style={styles.promotionOverlay}>
      <View style={styles.promotionGlassCard}>
        <Text style={styles.promotionTitle}>CORONACIÓN</Text>

        <View style={styles.promotionRow}>
          {PROMOTION_PIECES.map((p) => (
            <TouchableOpacity
              key={p}
              style={styles.promotionPieceContainer}
              onPress={() => onSelect(p)}
            >
              <View style={[
                styles.pieceCircle,
                { backgroundColor: playerColor === 'w' ? PALETTE.boardDark : PALETTE.boardLight }
              ]}>
                <Image
                  source={getPieceImage(p)}
                  style={styles.promotionImage}
                  resizeMode="contain"
                />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.cancelPromotion} onPress={onCancel}>
          <Text style={styles.cancelText}>CANCELAR</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({  
promotionOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', zIndex: 1000, elevation: 25 },
promotionGlassCard: { width: '85%', backgroundColor: PALETTE.surfaceDark, borderRadius: 28, padding: 25, alignItems: 'center', borderWidth: 1, borderColor: PALETTE.primary },
promotionTitle: { color: PALETTE.secondary, fontSize: 16, fontWeight: '800', letterSpacing: 2, marginBottom: 5 },
promotionRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', gap: 10 },
promotionPieceContainer: { flex: 1, alignItems: 'center' },
pieceCircle: { width: SCREEN_WIDTH * 0.15, height: SCREEN_WIDTH * 0.15, borderRadius: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: PALETTE.surface, borderWidth: 1, borderColor: PALETTE.surfaceLight },
promotionImage: { width: '80%', height: '80%' },
cancelPromotion: { marginTop: 30, paddingVertical: 10, paddingHorizontal: 20 },
cancelText: { color: PALETTE.error, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
});