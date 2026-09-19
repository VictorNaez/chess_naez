import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useT } from '../../i18n/I18nProvider';
import type { FeedbackCategory, FeedbackContext } from '../../lib/feedback';
import { FEEDBACK_CATEGORIES, FEEDBACK_EMAIL, formatDiagnostics, openFeedbackEmail } from '../../lib/feedback';
import { hapticImpact } from '../../lib/haptics';
import { MODAL_MAX_WIDTH } from '../../theme/responsive';
import { PALETTE } from '../colors';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface FeedbackModalProps {
  visible: boolean;
  onClose: () => void;
  context: FeedbackContext;
}

const CATEGORY_ICONS: Record<FeedbackCategory, IoniconName> = {
  bug: 'bug-outline',
  suggestion: 'bulb-outline',
  puzzle: 'extension-puzzle-outline',
  translation: 'language-outline',
};

// A nivel de módulo: definido dentro del render, React lo trataría como un
// componente nuevo en cada pasada y lo remontaría en cada tap.
const CategoryChip = React.memo(({ icon, label, active, onPress }: {
  icon: IoniconName;
  label: string;
  active: boolean;
  onPress: () => void;
}) => (
  <Pressable
    style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.chipPressed]}
    onPress={onPress}
    accessibilityRole="radio"
    accessibilityState={{ selected: active }}
    accessibilityLabel={label}
  >
    <Ionicons
      name={icon}
      size={15}
      color={active ? PALETTE.secondary : PALETTE.chipText}
    />
    <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
      {label}
    </Text>
  </Pressable>
));

export const FeedbackModal = React.memo(({ visible, onClose, context }: FeedbackModalProps) => {
  const t = useT();
  const [category, setCategory] = useState<FeedbackCategory | null>(null);
  const [noMailApp, setNoMailApp] = useState(false);

  // Cada apertura empieza limpia: si la anterior acabó en "no hay app de
  // correo", ese aviso no debe seguir ahí la próxima vez.
  useEffect(() => {
    if (visible) {
      setCategory(null);
      setNoMailApp(false);
    }
  }, [visible]);

  const handleSend = async () => {
    if (!category) return;
    hapticImpact('light');
    const opened = await openFeedbackEmail(category, context, {
      bodyIntro: t.feedback.bodyIntro,
      diagnosticsTitle: t.feedback.diagnosticsTitle,
    });
    if (opened) onClose();
    else setNoMailApp(true);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.content}>

          <Ionicons name="mail-outline" size={32} color={PALETTE.secondary} style={styles.headerIcon} />
          <Text style={styles.title}>{t.feedback.title}</Text>
          <Text style={styles.subtitle}>{t.feedback.subtitle}</Text>

          <Text style={styles.sectionLabel}>{t.feedback.pickCategory}</Text>
          <View style={styles.chipRow}>
            {FEEDBACK_CATEGORIES.map(id => (
              <CategoryChip
                key={id}
                icon={CATEGORY_ICONS[id]}
                label={t.feedback.categories[id]}
                active={category === id}
                onPress={() => setCategory(id)}
              />
            ))}
          </View>

          {/* El bloque se enseña ANTES de abrir el correo: nada viaja sin que el
              usuario lo haya visto, y va en el cuerpo para poder borrarlo. */}
          <Text style={styles.note}>{t.feedback.diagnosticsNote}</Text>
          <Text style={styles.diagnostics} selectable>{formatDiagnostics(context)}</Text>

          {noMailApp && (
            <View style={styles.fallback}>
              <Text style={styles.fallbackText}>{t.feedback.noMailApp}</Text>
              <Text style={styles.fallbackEmail} selectable>{FEEDBACK_EMAIL}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.sendBtn, !category && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!category}
            accessibilityRole="button"
            accessibilityState={{ disabled: !category }}
          >
            <Text style={[styles.sendText, !category && styles.sendTextDisabled]}>
              {t.feedback.send}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>{t.feedback.close}</Text>
          </TouchableOpacity>

        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  content: {
    width: '88%',
    maxWidth: MODAL_MAX_WIDTH,
    backgroundColor: PALETTE.surfaceDark,
    borderRadius: 30,
    padding: 25,
    borderWidth: 1,
    borderColor: PALETTE.chipBorder,
  },

  headerIcon: { alignSelf: 'center' },
  title: { color: PALETTE.primary, fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginTop: 10, marginBottom: 12, letterSpacing: 1 },
  subtitle: { color: PALETTE.chipText, fontSize: 13, lineHeight: 19, textAlign: 'center', marginBottom: 20 },

  sectionLabel: { color: PALETTE.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 10 },

  // wrap + flex:1 con minWidth: el alemán ('Übersetzung', 'Falsches Puzzle')
  // no cabe en una fila de cuatro y tiene que poder caer a la siguiente.
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.surfaceLight,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  chipActive: { backgroundColor: PALETTE.chipActiveBg, borderColor: PALETTE.secondary },
  chipPressed: { opacity: 0.7 },
  chipText: { color: PALETTE.chipText, fontSize: 12, fontWeight: '700', flexShrink: 1, minWidth: 0 },
  chipTextActive: { color: PALETTE.secondary, fontWeight: '900' },

  note: { color: PALETTE.chipText, fontSize: 11, lineHeight: 16, marginTop: 20 },
  diagnostics: {
    color: PALETTE.primary,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: PALETTE.chipBg,
    borderWidth: 1,
    borderColor: PALETTE.chipBorder,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
  },

  fallback: { marginTop: 16, alignItems: 'center' },
  fallbackText: { color: PALETTE.error, fontSize: 12, textAlign: 'center' },
  fallbackEmail: { color: PALETTE.accent, fontSize: 14, fontWeight: '900', marginTop: 6 },

  sendBtn: {
    height: 48,
    borderRadius: 14,
    backgroundColor: PALETTE.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
  },
  sendBtnDisabled: { backgroundColor: PALETTE.disabled },
  sendText: { color: PALETTE.surfaceDark, fontWeight: '900', fontSize: 13, letterSpacing: 1.2 },
  sendTextDisabled: { color: PALETTE.chipText },

  closeBtn: { height: 42, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  closeText: { color: PALETTE.accent, fontWeight: '900', fontSize: 13, letterSpacing: 1.5 },
});
