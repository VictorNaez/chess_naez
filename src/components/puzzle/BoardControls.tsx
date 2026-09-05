import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { PALETTE } from '../colors';

interface BoardControlsProps {
  viewIndex: number;
  fenHistoryLength: number;
  onNavigate: (direction: 'prev' | 'next') => void;
  message: string;
  isAnalysisMode: boolean;
  solutionRevealed: boolean;
  onShowSolution: () => void;
  onStartAnalysis: () => void;
  onRetry: () => void;
  onNextPuzzle: () => void;
  onHint: () => void;
  isNextDisabled: boolean;
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
  onRetry,
  onNextPuzzle,
  onHint,
  isNextDisabled,
}: BoardControlsProps) => {
  const isError = message.includes('❌') && !isAnalysisMode;
  const isSuccess = message.includes('✅') || isAnalysisMode;
  const isPlaying = !message.includes('❌') && !message.includes('✅') && !isAnalysisMode;
  const isAtLastMove = viewIndex === fenHistoryLength - 1;

  return (
    <View style={styles.footerSection}>
      <View style={styles.modernControlsRow}>

        {/* IZQUIERDA: Flechas de navegación */}
        <View style={styles.navigationGroup}>
          <TouchableOpacity
            style={[styles.modernNavBtn, viewIndex === 0 && styles.navBtnDisabled]}
            onPress={() => onNavigate('prev')}
            disabled={viewIndex === 0}
          >
            <Ionicons name="arrow-back" size={24} color={PALETTE.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modernNavBtn, viewIndex === fenHistoryLength - 1 && styles.navBtnDisabled]}
            onPress={() => onNavigate('next')}
            disabled={viewIndex === fenHistoryLength - 1}
          >
            <Ionicons name="arrow-forward" size={24} color={PALETTE.primary} />
          </TouchableOpacity>
        </View>

        {/* DERECHA: Botones de acción */}
        <View style={styles.actionGroup}>

          {/* CASO 1: ERROR */}
          {isError && (
            <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={styles.modernActionButtonRow}>
              {solutionRevealed ? (
                <TouchableOpacity style={[styles.iconTextBtn, styles.btnSkip]} />
              ) : (
                <TouchableOpacity style={[styles.iconTextBtn, styles.btnSolution]} onPress={onShowSolution}>
                  <View style={styles.iconContainer}>
                    <Ionicons name="eye-outline" size={20} color={PALETTE.primary} />
                  </View>
                  <Text style={[styles.iconTextBtnText, styles.btnSolutionText]} numberOfLines={1} adjustsFontSizeToFit>Solution</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={[styles.iconTextBtn, styles.btnHint]} onPress={onStartAnalysis}>
                <View style={styles.iconContainer}>
                  <Ionicons name="analytics" size={20} color={PALETTE.primary} />
                </View>
                <Text style={[styles.iconTextBtnText, styles.btnHintText]} numberOfLines={1} adjustsFontSizeToFit>Analysis</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.iconTextBtn, styles.btnErrorFilled]} onPress={onRetry}>
                <View style={styles.iconContainer}>
                  <Ionicons name="refresh-circle" size={20} color={PALETTE.accent} />
                </View>
                <Text style={[styles.iconTextBtnText, styles.btnErrorFilledText]} numberOfLines={1} adjustsFontSizeToFit>Retry</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.iconTextBtn, styles.btnSuccessFilled]} onPress={onNextPuzzle}>
                <View style={styles.iconContainer}>
                  <Ionicons name="arrow-forward-circle" size={20} color={PALETTE.accent} />
                </View>
                <Text style={[styles.iconTextBtnText, styles.btnSuccessFilledText]} numberOfLines={1} adjustsFontSizeToFit>Next</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* CASO 2: ÉXITO o MODO ANÁLISIS */}
          {isSuccess && (
            <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={styles.modernActionButtonRow}>
              {message.includes('✅') && (
                <TouchableOpacity style={[styles.iconTextBtn, styles.btnHint]} onPress={onStartAnalysis}>
                  <View style={styles.iconContainer}>
                    <Ionicons name="analytics" size={20} color={PALETTE.primary} />
                  </View>
                  <Text style={[styles.iconTextBtnText, styles.btnHintText]}>Analyze</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[
                  styles.iconTextBtn,
                  styles.btnSuccessFilled,
                  { flex: message.includes('✅') ? 2 : 1, maxWidth: message.includes('✅') ? 200 : 260 }
                ]}
                onPress={onNextPuzzle}
              >
                <View style={styles.iconContainer}>
                  <Ionicons name="arrow-forward-circle" size={20} color={PALETTE.accent} />
                </View>
                <Text style={[styles.iconTextBtnText, styles.btnSuccessFilledText]} numberOfLines={1} adjustsFontSizeToFit>Next Puzzle</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* CASO 3: JUGANDO */}
          {isPlaying && (
            <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={styles.modernActionButtonRowEnd}>
              {/* Sin animación propia: un entering/exiting anidado bloquea el
                  exiting del padre y las filas se solapan al cambiar de estado. */}
              {isAtLastMove && (
                <TouchableOpacity
                  style={[styles.iconTextBtn, styles.btnHint, { flex: 0, minWidth: 90 }]}
                  onPress={onHint}
                >
                  <View style={styles.iconContainer}>
                    <Ionicons name="bulb-outline" size={20} color={PALETTE.primary} />
                  </View>
                  <Text style={[styles.iconTextBtnText, styles.btnHintText]} numberOfLines={1} adjustsFontSizeToFit>Hint</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[
                  styles.iconTextBtn,
                  styles.btnSkip,
                  { flex: 0, minWidth: 90 },
                  isNextDisabled && styles.btnDisabled
                ]}
                onPress={onNextPuzzle}
                disabled={isNextDisabled}
              >
                <View style={styles.iconContainer}>
                  <Ionicons
                    name="play-skip-forward-outline"
                    size={20}
                    color={isNextDisabled ? PALETTE.disabled : PALETTE.primary}
                  />
                </View>
                <Text style={[
                  styles.iconTextBtnText,
                  styles.btnSkipText,
                  isNextDisabled && styles.btnDisabledText
                ]} numberOfLines={1} adjustsFontSizeToFit>Skip</Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
    footerSection: { marginTop: 'auto', width: '100%', alignItems: 'center', marginBottom: 20, },
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