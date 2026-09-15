import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { PALETTE } from '../colors';
import { useT } from '../../i18n/I18nProvider';
import { useResponsive } from '../../theme/responsive';

interface BoardControlsProps {
  viewIndex: number;
  fenHistoryLength: number;
  onNavigate: (direction: 'prev' | 'next') => void;
  message: string;
  isAnalysisMode: boolean;
  solutionRevealed: boolean;
  onShowSolution: () => void;
  onStartAnalysis: () => void;
  // Salir del análisis sin tener que cambiar de puzle. Descarta la variante
  // explorada y devuelve el tablero a la posición desde la que se entró.
  onExitAnalysis: () => void;
  onRetry: () => void;
  onNextPuzzle: () => void;
  onHint: () => void;
  isNextDisabled: boolean;
  /** Ancho de la columna de UI (el del tablero en tablet, la ventana en móvil). */
  width: number;
}

export const BoardControls = React.memo(({
  viewIndex,
  fenHistoryLength,
  onNavigate,
  message,
  isAnalysisMode,
  solutionRevealed,
  onShowSolution,
  onStartAnalysis,
  onExitAnalysis,
  onRetry,
  onNextPuzzle,
  onHint,
  isNextDisabled,
  width,
}: BoardControlsProps) => {
  const t = useT();
  const { s, uiScale } = useResponsive();

  // Tamaños escalados. Los valores base son los de diseño en móvil, así que en
  // un teléfono (uiScale = 1) todo queda exactamente igual que antes.
  const sc = useMemo(() => ({
    footer: { width },
    row: { paddingVertical: s(10), paddingHorizontal: s(16) },
    navGroup: { gap: s(10) },
    navBtn: { borderRadius: s(10), paddingVertical: s(10), paddingHorizontal: s(10) },
    actionRow: { gap: s(8) },
    btn: { maxWidth: s(140), paddingVertical: s(8), borderRadius: s(12) },
    btnText: { fontSize: s(8) },
    fixedBtn: { flex: 0, minWidth: s(90) },
    navIcon: s(24),
    icon: s(20),
    nextMaxWide: s(200),
    nextMaxSolo: s(260),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [uiScale, width]);

  const isError = message.includes('❌') && !isAnalysisMode;
  const isSuccess = message.includes('✅') || isAnalysisMode;
  const isPlaying = !message.includes('❌') && !message.includes('✅') && !isAnalysisMode;
  const isAtLastMove = viewIndex === fenHistoryLength - 1;
  // En el bloque de la derecha siempre hay un botón acompañando a "Next":
  // "Analyze" cuando el puzle está resuelto, "Exit" mientras se analiza.
  const hasSecondaryAction = isAnalysisMode || message.includes('✅');

  return (
    <View style={[styles.footerSection, sc.footer]}>
      <View style={[styles.modernControlsRow, sc.row]}>

        {/* IZQUIERDA: Flechas de navegación */}
        <View style={[styles.navigationGroup, sc.navGroup]}>
          <TouchableOpacity
            style={[styles.modernNavBtn, sc.navBtn, viewIndex === 0 && styles.navBtnDisabled]}
            onPress={() => onNavigate('prev')}
            disabled={viewIndex === 0}
          >
            <Ionicons name="arrow-back" size={sc.navIcon} color={PALETTE.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modernNavBtn, sc.navBtn, viewIndex === fenHistoryLength - 1 && styles.navBtnDisabled]}
            onPress={() => onNavigate('next')}
            disabled={viewIndex === fenHistoryLength - 1}
          >
            <Ionicons name="arrow-forward" size={sc.navIcon} color={PALETTE.primary} />
          </TouchableOpacity>
        </View>

        {/* DERECHA: Botones de acción */}
        <View style={styles.actionGroup}>

          {/* CASO 1: ERROR */}
          {isError && (
            <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={[styles.modernActionButtonRow, sc.actionRow]}>
              {solutionRevealed ? (
                <TouchableOpacity style={[styles.iconTextBtn, sc.btn, styles.btnSkip]} />
              ) : (
                <TouchableOpacity style={[styles.iconTextBtn, sc.btn, styles.btnSolution]} onPress={onShowSolution}>
                  <View style={styles.iconContainer}>
                    <Ionicons name="eye-outline" size={sc.icon} color={PALETTE.primary} />
                  </View>
                  <Text style={[styles.iconTextBtnText, sc.btnText, styles.btnSolutionText]} numberOfLines={1} adjustsFontSizeToFit>{t.puzzle.solution}</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={[styles.iconTextBtn, sc.btn, styles.btnHint]} onPress={onStartAnalysis}>
                <View style={styles.iconContainer}>
                  <Ionicons name="analytics" size={sc.icon} color={PALETTE.primary} />
                </View>
                <Text style={[styles.iconTextBtnText, sc.btnText, styles.btnHintText]} numberOfLines={1} adjustsFontSizeToFit>{t.puzzle.analysis}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.iconTextBtn, sc.btn, styles.btnErrorFilled]} onPress={onRetry}>
                <View style={styles.iconContainer}>
                  <Ionicons name="refresh-circle" size={sc.icon} color={PALETTE.accent} />
                </View>
                <Text style={[styles.iconTextBtnText, sc.btnText, styles.btnErrorFilledText]} numberOfLines={1} adjustsFontSizeToFit>{t.common.retry}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.iconTextBtn, sc.btn, styles.btnSuccessFilled]} onPress={onNextPuzzle}>
                <View style={styles.iconContainer}>
                  <Ionicons name="arrow-forward-circle" size={sc.icon} color={PALETTE.accent} />
                </View>
                <Text style={[styles.iconTextBtnText, sc.btnText, styles.btnSuccessFilledText]} numberOfLines={1} adjustsFontSizeToFit>{t.common.next}</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* CASO 2: ÉXITO o MODO ANÁLISIS */}
          {isSuccess && (
            <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={[styles.modernActionButtonRow, sc.actionRow]}>
              {isAnalysisMode ? (
                <TouchableOpacity style={[styles.iconTextBtn, sc.btn, styles.btnHint]} onPress={onExitAnalysis}>
                  <View style={styles.iconContainer}>
                    <Ionicons name="close-circle-outline" size={sc.icon} color={PALETTE.primary} />
                  </View>
                  <Text style={[styles.iconTextBtnText, sc.btnText, styles.btnHintText]} numberOfLines={1} adjustsFontSizeToFit>{t.puzzle.exitAnalysis}</Text>
                </TouchableOpacity>
              ) : message.includes('✅') && (
                <TouchableOpacity style={[styles.iconTextBtn, sc.btn, styles.btnHint]} onPress={onStartAnalysis}>
                  <View style={styles.iconContainer}>
                    <Ionicons name="analytics" size={sc.icon} color={PALETTE.primary} />
                  </View>
                  <Text style={[styles.iconTextBtnText, sc.btnText, styles.btnHintText]}>{t.puzzle.analyze}</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[
                  styles.iconTextBtn, sc.btn,
                  styles.btnSuccessFilled,
                  { flex: hasSecondaryAction ? 2 : 1, maxWidth: hasSecondaryAction ? sc.nextMaxWide : sc.nextMaxSolo }
                ]}
                onPress={onNextPuzzle}
              >
                <View style={styles.iconContainer}>
                  <Ionicons name="arrow-forward-circle" size={sc.icon} color={PALETTE.accent} />
                </View>
                <Text style={[styles.iconTextBtnText, sc.btnText, styles.btnSuccessFilledText]} numberOfLines={1} adjustsFontSizeToFit>{t.puzzle.nextPuzzle}</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* CASO 3: JUGANDO */}
          {isPlaying && (
            <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={[styles.modernActionButtonRowEnd, sc.actionRow]}>
              {/* Sin animación propia: un entering/exiting anidado bloquea el
                  exiting del padre y las filas se solapan al cambiar de estado. */}
              {isAtLastMove && (
                <TouchableOpacity
                  style={[styles.iconTextBtn, sc.btn, styles.btnHint, sc.fixedBtn]}
                  onPress={onHint}
                >
                  <View style={styles.iconContainer}>
                    <Ionicons name="bulb-outline" size={sc.icon} color={PALETTE.primary} />
                  </View>
                  <Text style={[styles.iconTextBtnText, sc.btnText, styles.btnHintText]} numberOfLines={1} adjustsFontSizeToFit>{t.puzzle.hint}</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[
                  styles.iconTextBtn, sc.btn,
                  styles.btnSkip,
                  sc.fixedBtn,
                  isNextDisabled && styles.btnDisabled
                ]}
                onPress={onNextPuzzle}
                disabled={isNextDisabled}
              >
                <View style={styles.iconContainer}>
                  <Ionicons
                    name="play-skip-forward-outline"
                    size={sc.icon}
                    color={isNextDisabled ? PALETTE.disabled : PALETTE.primary}
                  />
                </View>
                <Text style={[
                  styles.iconTextBtnText, sc.btnText,
                  styles.btnSkipText,
                  isNextDisabled && styles.btnDisabledText
                ]} numberOfLines={1} adjustsFontSizeToFit>{t.puzzle.skip}</Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
    // marginBottom: debe coincidir con FOOTER_MARGIN_BOTTOM de app/index.tsx (cálculo de insets).
    footerSection: { marginTop: 'auto', alignItems: 'center', marginBottom: 20, },
    modernControlsRow: { flexDirection: 'row', width: '100%', justifyContent: 'space-between', alignItems: 'flex-end', paddingVertical: 10, paddingHorizontal: 16 },
    navigationGroup: { flexDirection: 'row', gap: 10, },
    modernNavBtn: { backgroundColor: PALETTE.glass, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 10, alignItems: 'flex-start' },
    navBtnDisabled: { opacity: 0.35, backgroundColor: PALETTE.glass },
    actionGroup: { alignItems: 'center', flex: 1, marginLeft: 12 },
    modernActionButtonRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', width: '100%', paddingHorizontal: 4 },
    modernActionButtonRowEnd: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', width: '100%', paddingHorizontal: 4 },
    iconTextBtn: { flex: 1, minWidth: 0, maxWidth: 140, paddingVertical: 8, paddingHorizontal: 4, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: 'transparent' },
    iconContainer: { marginBottom: 3 },
    iconTextBtnText: { fontWeight: '700', fontSize: 8, letterSpacing: 0.5, textTransform: 'uppercase', textAlign: 'center' },
    btnSolution: {},
    btnSolutionText: { color: PALETTE.primary },
    btnHint: {},
    btnHintText: { color: PALETTE.primary },
    btnErrorFilled: { backgroundColor: PALETTE.error, borderColor: PALETTE.error },
    btnErrorFilledText: { color: '#ffffff' },
    btnSuccessFilled: { backgroundColor: PALETTE.success, borderColor: PALETTE.success },
    btnSuccessFilledText: { color: '#ffffff' },
    btnSkip: {},
    btnSkipText: { color: PALETTE.primary },
    btnDisabled: { opacity: 0.5, backgroundColor: PALETTE.surfaceLight, borderColor: PALETTE.disabled },
    btnDisabledText: { color: PALETTE.disabled },
});