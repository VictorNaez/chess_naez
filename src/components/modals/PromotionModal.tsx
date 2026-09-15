import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { PALETTE } from '../colors';
import { useT } from '../../i18n/I18nProvider';

interface PromotionModalProps {
  visible: boolean;
  playerColor: 'w' | 'b';
  getPieceImage: (piece: string) => any;
  onSelect: (piece: string) => void;
  onCancel: () => void;
}

const PROMOTION_PIECES = ['q', 'r', 'b', 'n'];

const PROMOTION_CARD_MAX_WIDTH = 480;

export const PromotionModal = React.memo(({
  visible,
  playerColor,
  getPieceImage,
  onSelect,
  onCancel,
}: PromotionModalProps) => {
  const t = useT();
  // El hook va antes del return temprano. En móvil, 15% de la ventana como
  // siempre; en tablet, proporcional al card con tope.
  const { width: windowWidth } = useWindowDimensions();
  const pieceSize = Math.min(windowWidth * 0.85, PROMOTION_CARD_MAX_WIDTH) * (0.15 / 0.85);
  if (!visible) return null;

  return (
    <View style={styles.promotionOverlay}>
      <View style={styles.promotionGlassCard}>
        <Text style={styles.promotionTitle}>{t.puzzle.promotion}</Text>

        <View style={styles.promotionRow}>
          {PROMOTION_PIECES.map((p) => (
            <TouchableOpacity
              key={p}
              style={styles.promotionPieceContainer}
              onPress={() => onSelect(p)}
            >
              <View style={[
                styles.pieceCircle,
                { width: pieceSize, height: pieceSize },
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
          <Text style={styles.cancelText}>{t.common.cancel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({  
promotionOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', zIndex: 1000, elevation: 25 },
promotionGlassCard: { width: '85%', maxWidth: PROMOTION_CARD_MAX_WIDTH, backgroundColor: PALETTE.surfaceDark, borderRadius: 28, padding: 25, alignItems: 'center', borderWidth: 1, borderColor: PALETTE.primary },
promotionTitle: { color: PALETTE.secondary, fontSize: 16, fontWeight: '800', letterSpacing: 2, marginBottom: 5 },
promotionRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', gap: 10 },
promotionPieceContainer: { flex: 1, alignItems: 'center' },
pieceCircle: { borderRadius: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: PALETTE.surface, borderWidth: 1, borderColor: PALETTE.surfaceLight },
promotionImage: { width: '80%', height: '80%' },
cancelPromotion: { marginTop: 30, paddingVertical: 10, paddingHorizontal: 20 },
cancelText: { color: PALETTE.error, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
});