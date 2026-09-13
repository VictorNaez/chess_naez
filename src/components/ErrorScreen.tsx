import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DICTIONARIES, FALLBACK_LOCALE, getDeviceLocale, type Dictionary } from '../i18n';
import { PALETTE } from './colors';

// ---------------------------------------------------------------------------
// PANTALLA DE ÚLTIMO RECURSO
//
// Este fichero NO puede depender de nada que pueda haber fallado: ni del
// I18nProvider (vive por encima de él), ni de la base de datos, ni de ningún
// contexto de la app. Por eso resuelve el diccionario a pelo desde
// getDeviceLocale() y envuelve hasta eso en un try/catch: si el arranque se ha
// roto lo bastante como para llegar aquí, lo último que queremos es que la
// pantalla de error reviente también y deje al usuario en blanco.
// ---------------------------------------------------------------------------

const strings = (): Dictionary['fatal'] => {
  try {
    return DICTIONARIES[getDeviceLocale()].fatal;
  } catch {
    return DICTIONARIES[FALLBACK_LOCALE].fatal;
  }
};

interface FatalErrorScreenProps {
  error: Error | null;
  /** Vuelve a intentar el arranque sin tocar los datos. */
  onRetry: () => void;
  /** Borra progress.db y reintenta. Opcional: el ErrorBoundary no lo ofrece. */
  onReset?: () => void;
  /** Cambia el copy: "no arranca" vs "algo ha petado mientras usabas la app". */
  variant?: 'boot' | 'crash';
}

export const FatalErrorScreen = ({
  error,
  onRetry,
  onReset,
  variant = 'boot',
}: FatalErrorScreenProps) => {
  const t = strings();
  const [showDetails, setShowDetails] = React.useState(false);

  const confirmReset = () => {
    if (!onReset) return;
    Alert.alert(t.reset, t.resetConfirm, [
      { text: t.cancel, style: 'cancel' },
      { text: t.reset, style: 'destructive', onPress: onReset },
    ]);
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Ionicons name="alert-circle-outline" size={56} color={PALETTE.error} />

        <Text style={styles.title}>
          {variant === 'boot' ? t.title : t.crashTitle}
        </Text>
        <Text style={styles.body}>
          {variant === 'boot' ? t.body : t.crashBody}
        </Text>

        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel={t.retry}
        >
          <Ionicons name="refresh" size={18} color={PALETTE.accent} />
          <Text style={styles.primaryBtnText}>{t.retry}</Text>
        </Pressable>

        {!!onReset && (
          <View style={styles.resetBlock}>
            <View style={styles.divider} />
            <Text style={styles.resetTitle}>{t.resetTitle}</Text>
            <Text style={styles.resetBody}>{t.resetBody}</Text>
            <Pressable
              style={({ pressed }) => [styles.dangerBtn, pressed && styles.pressed]}
              onPress={confirmReset}
              accessibilityRole="button"
              accessibilityLabel={t.reset}
            >
              <Text style={styles.dangerBtnText}>{t.reset}</Text>
            </Pressable>
          </View>
        )}

        {/* Los detalles van plegados: para el 99% de usuarios son ruido, pero
            si alguien te escribe un correo quieres que pueda copiarlos. */}
        <Pressable
          onPress={() => setShowDetails(v => !v)}
          accessibilityRole="button"
          accessibilityLabel={t.details}
          style={styles.detailsToggle}
        >
          <Text style={styles.detailsToggleText}>{t.details}</Text>
          <Ionicons
            name={showDetails ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={PALETTE.chipText}
          />
        </Pressable>

        {showDetails && (
          <Text selectable style={styles.detailsText}>
            {error?.message ?? 'unknown'}
            {error?.stack ? `\n\n${error.stack}` : ''}
          </Text>
        )}
      </ScrollView>
    </View>
  );
};

// ---------------------------------------------------------------------------
// ERROR BOUNDARY
//
// Solo captura errores lanzados DURANTE EL RENDER de sus hijos. Los fallos
// asíncronos (una promesa rechazada en un useEffect, que es justo lo que pasaba
// con openPuzzleDatabase) NO llegan aquí: esos hay que cazarlos en su propio
// .catch. Los dos mecanismos son complementarios, no alternativos.
//
// Tiene que ser una clase: React no expone componentDidCatch a los hooks.
// ---------------------------------------------------------------------------

interface BoundaryState {
  error: Error | null;
  /** Fuerza el remontaje del subárbol al reintentar, para no repintar el
   *  mismo estado roto que provocó el error. */
  resetKey: number;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  BoundaryState
> {
  state: BoundaryState = { error: null, resetKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<BoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Punto único de enganche si algún día metes Sentry o similar.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState(prev => ({ error: null, resetKey: prev.resetKey + 1 }));
  };

  render() {
    if (this.state.error) {
      return (
        <FatalErrorScreen
          variant="crash"
          error={this.state.error}
          onRetry={this.handleRetry}
        />
      );
    }
    return (
      <React.Fragment key={this.state.resetKey}>
        {this.props.children}
      </React.Fragment>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PALETTE.background },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 48,
  },

  title: {
    color: PALETTE.accent,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 20,
  },
  body: {
    color: PALETTE.primary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 28,
  },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: PALETTE.secondary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 14,
  },
  primaryBtnText: { color: PALETTE.accent, fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  pressed: { opacity: 0.75 },

  resetBlock: { width: '100%', alignItems: 'center', marginTop: 36 },
  divider: {
    height: 1,
    width: '100%',
    backgroundColor: PALETTE.surfaceLight,
    marginBottom: 24,
  },
  resetTitle: {
    color: PALETTE.chipText,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  resetBody: {
    color: PALETTE.chipText,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 16,
  },
  dangerBtn: {
    borderWidth: 1,
    borderColor: PALETTE.error,
    paddingVertical: 11,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  dangerBtnText: { color: PALETTE.error, fontSize: 13, fontWeight: '800', letterSpacing: 0.8 },

  detailsToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 32 },
  detailsToggleText: { color: PALETTE.chipText, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  detailsText: {
    color: PALETTE.chipText,
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 12,
    textAlign: 'left',
  },
});
