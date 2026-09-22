import { PALETTE } from '@/src/components/colors';
import { StreakBadge } from '@/src/components/header/StreakBadge';
import { PromotionModal } from '@/src/components/modals/PromotionModal';
import { StatsModal } from '@/src/components/modals/StatsModal';
import { useStats } from '@/src/hooks/useStats';
import { CLOCK_DURATIONS, CLOCK_TIMING, DEFAULT_CLOCK_DURATION_MS, getLadderRange } from '@/src/lib/clock';
import { DEFAULT_SURVIVAL_MS, SURVIVAL_SPEEDS, survivalDangerMs, survivalWarnMs } from '@/src/lib/survival';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Chess, Move, Square } from "chess.js";
import * as SplashScreen from 'expo-splash-screen';
import * as SQLite from 'expo-sqlite';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { AnalysisLines } from '../src/components/analysis/AnalysisLines';
import { themeKeysFromRow } from '../src/components/chess_themes';
import ChessBoard, { EVAL_BAR_BLOCK_HEIGHT, PieceItem, pieceImages } from "../src/components/ChessBoard";
import { ClockProgressGrid } from '../src/components/clock/ClockProgressGrid';
import { ClockScoreBar } from '../src/components/clock/ClockScoreBar';
import { CountdownTimer } from '../src/components/clock/CountdownTimer';
import { FatalErrorScreen } from '../src/components/ErrorScreen';
import { EloBadge } from '../src/components/header/EloBadge';
import { PuzzleTimer } from '../src/components/header/PuzzleTimer';
import { SessionEloSparkline } from '../src/components/header/SessionEloSparkline';
import { FeedbackModal } from '../src/components/modals/FeedbackModal';
import { FilterModal } from '../src/components/modals/FilterModal';
import { HistoryModal } from '../src/components/modals/HistoryModal';
import { MainMenuModal } from '../src/components/modals/MainMenuModal';
import { RepasoResultModal } from '../src/components/modals/RepasoResultModal';
import { RepasoStartModal } from '../src/components/modals/RepasoStartModal';
import { RunResultModal } from '../src/components/modals/RunResultModal';
import { RunStartModal } from '../src/components/modals/RunStartModal';
import { SettingsModal } from '../src/components/modals/SettingsModal';
import { SupportModal } from '../src/components/modals/SupportModal';
import { BoardControls } from '../src/components/puzzle/BoardControls';
import { MoveList } from '../src/components/puzzle/MoveList';
import { RepasoProgressPill } from '../src/components/repaso/RepasoProgressPill';
import { Skeleton } from '../src/components/ui/Skeleton';
import { checkpointProgress, getMaxRowid, getPuzzleById, openPuzzleDatabase, resetProgressDatabase, } from '../src/data/puzzleDatabase';
import { useAnalysisEngine } from '../src/hooks/useAnalysisEngine';
import { useAppUsageTime } from '../src/hooks/useAppUsageTime';
import { useClockMode } from '../src/hooks/useClockMode';
import { useDonations } from '../src/hooks/useDonations';
import { useEloHistory } from '../src/hooks/useEloHistory';
import { useRepasoMode } from '../src/hooks/useRepasoMode';
import { SettingsProvider, useSettings } from '../src/hooks/useSettings';
import { useSounds } from '../src/hooks/useSounds';
import { useSurvivalMode } from '../src/hooks/useSurvivalMode';
import { useUserProgress } from "../src/hooks/useUserProgress";
import { I18nProvider, useI18n, useT } from '../src/i18n/I18nProvider';
import { DEFAULT_ELO } from '../src/lib/elo';
import { hapticError, hapticImpact, hapticSuccess } from '../src/lib/haptics';
import { getLegalDestinations } from '../src/lib/legalMoves';
import { applyMoveIdentity, buildPieceItems, getIdentityAt, getMoveBetweenFens, moveIdentity, seedIdentityMap, stepIdentityBetweenFens } from '../src/lib/pieceIdentity';
import { getRecommendedRange, hasPuzzleBeenScored, readGlobalElo, themeFilter } from '../src/lib/puzzleQueries';
import { ALREADY_SOLVED_COLUMN, recordPuzzleResult, UNSOLVED_FILTER } from '../src/data/puzzleStats';
import { REPASO_FIRST_MOVE_MS, feedsRepaso } from '../src/lib/repaso';
import { REVIEW_MIN_STREAK, maybeAskForReview } from '../src/lib/storeReview';
import { PUZZLE_TIMING } from '../src/lib/timing';
import { useResponsive } from '../src/theme/responsive';
import { useBoardFit } from '../src/theme/useBoardFit';
import type { AppMode } from '../src/types/mode';
import { isRunModeId } from '../src/types/mode';
import type { Puzzle } from '../src/types/puzzle';
import type { RepasoOrder } from '../src/types/repaso';

SplashScreen.preventAutoHideAsync().catch(() => {});

// --- FEEDBACK FUERA DEL CAMINO CRÍTICO DE LA JUGADA ---
// hapticImpact y el par seekTo(0)/play() de expo-audio son llamadas nativas
// SÍNCRONAS: ejecutadas donde estaban, bloqueaban el hilo JS dentro del mismo
// bloque que los setState de la jugada, o sea ANTES de que React hiciera flush
// del lote. Ese tiempo se lo comía entero el primer frame de la pieza.
// setTimeout(0) es un macrotask y el flush de React es un microtask: cuando
// corre esto, el render ya está hecho. El desfase con la animación es de un
// tick, imperceptible; el que se quita de delante no lo era.
const deferFeedback = (fn: () => void) => { setTimeout(fn, 0); };

// --- ALTURAS DE LAS ZONAS QUE CAMBIAN SEGÚN EL ESTADO ---
// Viven aquí y no dentro de App porque las leen tanto los estilos animados como
// el cálculo del tamaño del tablero (useBoardFit): tienen que ser las mismas.
const MOVE_LIST_HEIGHT = 40;   // altura en modo puzzle (historial SAN)
const ELO_ROW_HEIGHT = 76; // altura fija de la fila (badge + sparkline); ajusta si no encaja
const STREAK_SLOT_HEIGHT = 42; // 8 margin + 12 padding + ~18 texto + 2 borde
const CLOCK_ROW_HEIGHT = 136;// 3 filas de 34 + 2 gaps de 6 + 16 de padding + 2 de borde = 132; 136 deja holgura
const ELO_ROW_MARGIN_BOTTOM = 12;
const CLOCK_ROW_MARGIN_BOTTOM = 6;
const MAIN_CONTENT_MARGIN_TOP = 60;
// En contrarreloj/supervivencia el recuadro de puzles resueltos mide 136px
// frente a los 118 de la fila de ELO. Con los mismos 60px de margen el tablero
// bajaba y el footer se quedaba sin sitio: aquí se recorta ese hueco.
const MAIN_CONTENT_MARGIN_TOP_RUN = 20;
const MAIN_CONTENT_MARGIN_BOTTOM = 30;
// Aire que ya dejaba el diseño alrededor de las barras del sistema: el header
// tiene su propio marginTop y el footer (BoardControls / clockFooterSpacer) su
// marginBottom de 20. Los insets solo añaden padding cuando superan ese aire.
const HEADER_MARGIN_TOP = Platform.OS === 'ios' ? 10 : 20;
const FOOTER_MARGIN_BOTTOM = 20;

// --- PUZLE PRECARGADO ---
// fresh: false = ya resuelto antes (solo se precarga así con "Permitir puzles
// repetidos" activo, y se descarta si el ajuste se apaga antes de usarlo).
type PrefetchedPuzzle = { themesKey: string; puzzle: Puzzle; fresh: boolean };

const themesKeyOf = (themes: string[]) => themes.join(',');

// El precargado sirve si se pidió con los mismos temas y su rating cae dentro
// del rango que se va a usar ahora. Antes la clave era el rango exacto: en modo
// recomendado cada puzle puntuado mueve la ventana unos puntos y el precargado
// se volvía a pedir (o se tiraba) aunque siguiera cumpliendo el filtro.
const pickPrefetched = (
  cached: PrefetchedPuzzle | null, range: number[], themes: string[],
): PrefetchedPuzzle | null => {
  if (!cached || cached.themesKey !== themesKeyOf(themes)) return null;
  const { rating } = cached.puzzle;
  return rating >= range[0] && rating <= range[1] ? cached : null;
};

// El provider tiene que envolver a App desde fuera: los hooks que consumen los
// ajustes (useSounds, useAnalysisEngine, la propia App) viven dentro de App.
export default function AppRoot() {
  return (
    <I18nProvider>
      <SettingsProvider>
        <App />
      </SettingsProvider>
    </I18nProvider>
  );
}

function App() {
  const t = useT();
  // El idioma efectivo viaja en el correo de contacto: sin él no se sabe en
  // qué idioma responder ni qué traducción está mal.
  const { locale } = useI18n();
  const [db, setDb] = useState<SQLite.SQLiteDatabase | null>(null);
  const [bootError, setBootError] = useState<Error | null>(null);
  const [bootAttempt, setBootAttempt] = useState(0);
  const [currentPuzzle, setCurrentPuzzle] = useState<Puzzle | null>(null);
  const [loading, setLoading] = useState(true);
  const [eloRange, setEloRange] = useState<[number, number]>([1400, 1800]);
  const { userRatings, updateElo, resetLock, currentStreak } = useUserProgress(db);
  const getUsageMs = useAppUsageTime();
  const [eloFeedback, setEloFeedback] = useState<{ value: number } | null>(null);
  const settings = useSettings();
  const [isSettingsModalVisible, setIsSettingsModalVisible] = useState(false);
  const playSound = useSounds();
  // Inicializador perezoso: `useState(new Chess())` construía un Chess (parseo
  // de FEN) en CADA render de App y lo tiraba.
  const [game, setGame] = useState(() => new Chess());
  const boardStatus = useMemo(() => ({ inCheck: game.inCheck(), isMate: game.isCheckmate(), turn: game.turn(),  fen: game.fen(), }), [game]);
  const analysisEngine = useAnalysisEngine(boardStatus.fen);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalMoves, setLegalMoves] = useState<string[]>([]);
  const [lastMoveFrom, setLastMoveFrom] = useState<string | null>(null);
  const [lastMoveTo, setLastMoveTo] = useState<string | null>(null);
  const [hintSquare, setHintSquare] = useState<string | null>(null);
  const [hintMove, setHintMove] = useState<string | null>(null);
  // Clics de pista gastados en el puzle actual, para recortar el ELO al
  // puntuar. Ref y no estado: solo se lee en el momento de puntuar, y como
  // estado obligaría a un render por cada pista sin pintar nada distinto.
  const hintClicksRef = useRef(0);
  const [successSquare, setSuccessSquare] = useState<string | null>(null);
  const [errorSquare, setErrorSquare] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [puzzleSolved, setPuzzleSolved] = useState(false);
  const [firstMoveDone, setFirstMoveDone] = useState(false);
  // Sube uno cada vez que un puzle queda listo para jugar. A diferencia del id
  // del puzle, es único por presentación: es lo que usa supervivencia para no
  // rearmar el reloj de un puzle que ya has contestado.
  const [runPuzzleToken, setRunPuzzleToken] = useState(0);
  const [solutionStep, setSolutionStep] = useState(0);
  const [fenHistory, setFenHistory] = useState<string[]>([]);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>('w');
  const [isShowingSolution, setIsShowingSolution] = useState(false);
  const [solutionRevealed, setSolutionRevealed] = useState(false);
  // El puzle ya ha dado veredicto (acierto, fallo o solución revelada) y por
  // tanto ya ha tocado el ELO. Desde ese momento deja de ser "reanudable": si la
  // app se cierra sin pulsar Siguiente, al reabrir hay que traer otro, no este.
  const [isPuzzleConsumed, setIsPuzzleConsumed] = useState(false);
  const [promotionModalVisible, setPromotionModalVisible] = useState(false);
  const [pendingMove, setPendingMove] = useState<{ from: string, to: string } | null>(null);
  // Se incrementa al cancelar la coronación: el tablero devuelve a su casilla el
  // peón que el arrastre ya había dejado pintado en la última fila.
  const [snapBackToken, setSnapBackToken] = useState(0);
  const [isBoardLocked, setIsBoardLocked] = useState(false);
  // Reproducción de una línea del multi-PV. El ref guarda el id de la que está
  // en curso (null = ninguna) y es lo que consultan los guardas: un toque puede
  // llegar antes del re-render. El estado es su espejo para ChessBoard, que
  // bloquea los gestos en el hilo de UI (si no, la pieza se levanta y vuelve).
  const activeSequenceRef = useRef<number | null>(null);
  const sequenceCounterRef = useRef(0);
  const playbackRunRef = useRef(0);
  const [isSequencePlaying, setIsSequencePlaying] = useState(false);
  const [viewIndex, setViewIndex] = useState(0); // Qué movimiento del historial estamos viendo
  const [isReviewMode, setIsReviewMode] = useState(false); // Si estamos viendo el pasado o el presente
  const [isRetryMode, setIsRetryMode] = useState(false);
  const [pieces, setPieces] = useState<PieceItem[]>([]);
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);
  const [isSupportModalVisible, setIsSupportModalVisible] = useState(false);
  const [isFeedbackModalVisible, setIsFeedbackModalVisible] = useState(false);
  const [appMode, setAppMode] = useState<AppMode>('puzzles');
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const donations = useDonations();
  const clock = useClockMode(db);

  // El temporizador por puzle vive dentro de useSurvivalMode, pero quien sabe
  // reaccionar (feedback + cargar el siguiente puzle) es esta pantalla. La ref
  // se rellena más abajo, cuando swapRunPuzzle ya existe.
  const survivalTimeoutRef = useRef<(o: { nextRange: [number, number]; gameOver: boolean }) => void>(() => {});
  const survival = useSurvivalMode(db, survivalTimeoutRef);
  const repaso = useRepasoMode(db);

  const isClockMode = appMode === 'clock';
  const isSurvivalMode = appMode === 'survival';
  const isRepasoMode = appMode === 'repaso';
  // Todo lo que comparten contrarreloj y supervivencia: sin filtros, sin
  // historial, sin ELO, tablero que se sustituye solo, animaciones rápidas.
  const isRunMode = isRunModeId(appMode);
  const runPhaseRef = isSurvivalMode ? survival.phaseRef : clock.phaseRef;
  const runPhase = isSurvivalMode ? survival.phase : clock.phase;

  // --- REPASO POST-PARTIDA (contrarreloj / supervivencia) ---
  // Al terminar la partida el marcador de arriba se vuelve clicable: cada
  // cuadradito abre su puzle en el tablero para analizarlo con calma.
  // `reviewAttemptIndex` es el índice dentro de attempts del puzle abierto, o
  // null si solo estamos viendo el resultado.
  // Los intentos contestados + el puzle en pantalla sin contestar (gris), si lo
  // hay. Si la partida acaba con él a medias se queda al final de la lista y se
  // puede abrir en el repaso como cualquier otro.
  const runBaseAttempts = isSurvivalMode ? survival.attempts : clock.attempts;
  const runPendingAttempt = isSurvivalMode ? survival.pendingAttempt : clock.pendingAttempt;
  const runAttempts = useMemo(
    () => (runPendingAttempt ? [...runBaseAttempts, runPendingAttempt] : runBaseAttempts),
    [runBaseAttempts, runPendingAttempt],
  );
  const [reviewAttemptIndex, setReviewAttemptIndex] = useState<number | null>(null);
  // Cerrojo al cambiar de puzle en el repaso (ver PUZZLE_TIMING.reviewSwitchLock).
  // El ref es la fuente de verdad (se comprueba síncrono al pulsar); el estado
  // solo existe para atenuar el grid y el botón Siguiente.
  const [isReviewSwitchLocked, setIsReviewSwitchLocked] = useState(false);
  const reviewLockRef = useRef<{ token: number; minUntil: number } | null>(null);
  const reviewUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const releaseReviewLock = useCallback(() => {
    if (reviewUnlockTimerRef.current) {
      clearTimeout(reviewUnlockTimerRef.current);
      reviewUnlockTimerRef.current = null;
    }
    reviewLockRef.current = null;
    setIsReviewSwitchLocked(false);
  }, []);
  const isRunFinished = isRunMode && runPhase === 'finished';
  const isRunReview = isRunFinished && reviewAttemptIndex !== null;
  // Partida EN CURSO: es lo que activa los recortes de tiempo, el tablero que
  // se sustituye solo y el footer sin controles. Durante el repaso el puzle
  // tiene que comportarse exactamente igual que en modo normal.
  const isRunPlaying = isRunMode && !isRunReview;
  // Arranca ACTIVADO. Con el ELO inicial en 400 y el K alto de la calibración,
  // un usuario nuevo con el modo apagado se comería el rango manual por defecto
  // (1400-1800) desde 400 puntos: cuatro fallos y al suelo. Quien ya tenga la
  // preferencia guardada en @is_recommended_mode la conserva, porque el arranque
  // la restaura después de este valor inicial.
  const [isRecommendedMode, setIsRecommendedMode] = useState(true);
  const [isHistoryMode, setIsHistoryMode] = useState<boolean>(false);
  // Sólo alimentan la cola de repaso los intentos "de verdad": modo puzles, no
  // un puzle del historial ni un reintento (ya lo contaste la primera vez).
  const canFeedRepaso = feedsRepaso(appMode) && !isHistoryMode && !isRetryMode;
  const [sessionEloHistory, setSessionEloHistory] = useState<number[]>([]);
  const hasSeededSessionElo = useRef(false);
  const MULTI_PV_HEIGHT = settings.engineMultiPV * 32 + (settings.engineMultiPV - 1) + 20;   // 32px por fila (styles.analysisLineRow) + 1px de gap + 20px de paddingVertical del multiPvWrapper. Antes era 118 fijo, válido solo para 3 líneas.
  const moveListHeight = useSharedValue(MOVE_LIST_HEIGHT);
  const clearSelection = () => {setSelectedSquare(null); setLegalMoves([]); setHintMove(null);};
  const [isNextDisabled, setIsNextDisabled] = useState(false);
  const isAtLastMove = viewIndex === fenHistory.length - 1;
  // Puzle precargado para el siguiente "Next" (ver pickPrefetched).
  const nextPuzzleRef = useRef<PrefetchedPuzzle | null>(null);
  const clockPrefetchRef = useRef<{ range: number[]; puzzle: Puzzle } | null>(null);
  const prefetchingRef = useRef(false);
  // Id del puzle que hay en el tablero, legible desde closures viejas:
  // loadSinglePuzzle llega a slidePuzzle capturada en un render anterior, así
  // que `currentPuzzle` ahí dentro puede ir por detrás.
  const currentPuzzleIdRef = useRef<string | null>(null);
  useEffect(() => { currentPuzzleIdRef.current = currentPuzzle?.id ?? null; }, [currentPuzzle?.id]);

  // Aviso que ocupa el hueco del tablero cuando no hay puzle que poner:
  //   'exhausted' -> hay puzles con estos filtros, pero ya los has resuelto todos
  //   'empty'     -> ningún puzle del catálogo cumple estos filtros
  // Se apaga solo en cuanto entra cualquier puzle, venga del modo que venga
  // (ver el efecto de entrada del tablero).
  const [boardNotice, setBoardNotice] = useState<'exhausted' | 'empty' | null>(null);

  // Modo "PUZLE REPETIDO" (ajuste allowRepeats). Espejo en ref porque loadSinglePuzzle
  // llega a slidePuzzle desde closures viejas y leería el ajuste de entonces.
  const allowRepeatsRef = useRef(settings.allowRepeats);
  useEffect(() => { allowRepeatsRef.current = settings.allowRepeats; }, [settings.allowRepeats]);

  // Id del puzle cargado como repetición. Un puzle repetido no da ni quita ELO,
  // no escribe en elo_history (estadísticas y racha intactas) ni va a Repaso;
  // solo suma a su contador en puzzle_stats. Se guarda el id y no un booleano
  // para que caduque solo en cuanto el tablero muestra cualquier otro puzle,
  // venga del modo que venga.
  const [replayPuzzleId, setReplayPuzzleId] = useState<string | null>(null);
  // Repaso, historial y partidas pueden mostrar ese mismo id por su cuenta:
  // ahí mandan sus propias reglas, no las de la repetición.
  const isReplay =
    !!currentPuzzle && currentPuzzle.id === replayPuzzleId &&
    !isRunMode && !isRepasoMode && !isHistoryMode;

  // La pastilla "Puzle repetido" también sale en los puzles abiertos desde el
  // historial: por definición ya los jugaste y ahí tampoco se puntúa. Es solo
  // visual; la lógica de puntuación del historial no cambia (ya no daba ELO).
  const showReplayTag = isReplay || (isHistoryMode && !!currentPuzzle && !isRunMode);

  // Modo "PUZLE REPETIDO" recién activado con el aviso de "todos resueltos" en el
  // tablero (botón del aviso o interruptor de Ajustes): se carga ya un
  // repetido. Va después del efecto que sincroniza allowRepeatsRef, así que
  // cuando corre la ref ya vale true. Solo depende del ajuste: boardNotice y
  // la función se leen en el momento, no deben re-dispararlo.
  useEffect(() => {
    if (settings.allowRepeats && boardNotice === 'exhausted' && db) loadSinglePuzzle(db);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.allowRepeats]);

  // --- ARRANQUE: true una sola vez, cuando ya hay datos reales que pintar ---
  const [hasBooted, setHasBooted] = useState(false);
  const hasBootedRef = useRef(false);

  useEffect(() => {
    if (hasBootedRef.current) return;
    const eloReady = userRatings['global'] !== undefined;
    const boardReady = (currentPuzzle !== null && firstMoveDone) || (!loading && currentPuzzle === null);
    if (eloReady && boardReady) {
      hasBootedRef.current = true;
      setHasBooted(true);
    }
  }, [userRatings, currentPuzzle, firstMoveDone, loading]);

  const splashHiddenRef = useRef(false);
  const onRootLayout = useCallback(() => {
    if (splashHiddenRef.current) return;
    splashHiddenRef.current = true;
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  // --- CRONÓMETRO DEL PUZZLE ---
  // El crono se mide POR TRAMOS, no como (now - startedAt): cada vez que la app
  // sale de primer plano se cierra el tramo en curso y sus ms se acumulan en
  // `timerBaseMs`. Al volver se abre un tramo nuevo. Así el tiempo que la app
  // pasa en segundo plano no cuenta (antes, volver a las dos horas mostraba 2h).
  const [timerRunningSince, setTimerRunningSince] = useState<number | null>(null);
  const [timerBaseMs, setTimerBaseMs] = useState(0);
  const [solveElapsedMs, setSolveElapsedMs] = useState<number | null>(null);
  const [timerResult, setTimerResult] = useState<boolean | null>(null);
  // Refs paralelos al estado: necesitamos leer el tiempo dentro de executeMove y
  // del listener de AppState sin esperar a React.
  // timerAccumRef === null  -> crono inactivo (aún sin arrancar, o ya parado)
  // timerSegmentRef === null -> crono activo pero PAUSADO (app en segundo plano)
  const timerAccumRef = useRef<number | null>(null);
  const timerSegmentRef = useRef<number | null>(null);

  const resetTimer = useCallback(() => {
    timerAccumRef.current = null;
    timerSegmentRef.current = null;
    setTimerRunningSince(null);
    setTimerBaseMs(0);
    setSolveElapsedMs(null);
    setTimerResult(null);
  }, []);

  const startTimer = useCallback(() => {
    const now = Date.now();
    timerAccumRef.current = 0;
    timerSegmentRef.current = now;
    setTimerRunningSince(now);
    setTimerBaseMs(0);
    setSolveElapsedMs(null);
    setTimerResult(null);
  }, []);

  // Congela el crono y devuelve los ms empleados (0 si nunca llegó a arrancar).
  // El tramo abierto, si lo hay, se cierra aquí; si estaba pausado en segundo
  // plano, el acumulado ya es el valor bueno.
  const stopTimer = useCallback((wasSuccess: boolean | null = null) => {
    const accum = timerAccumRef.current;
    if (accum === null) return 0;
    const segment = timerSegmentRef.current;
    const elapsed = accum + (segment !== null ? Date.now() - segment : 0);
    timerAccumRef.current = null;
    timerSegmentRef.current = null;
    setTimerRunningSince(null);
    setTimerBaseMs(elapsed);
    setSolveElapsedMs(elapsed);
    setTimerResult(wasSuccess);
    return elapsed;
  }, []);

  // Pausa/reanuda el crono con el ciclo de vida de la app. 'inactive' (iOS:
  // centro de control, multitarea) también cuenta como fuera de primer plano.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      const accum = timerAccumRef.current;
      if (accum === null) return;                 // crono parado: nada que pausar
      if (state === 'active') {
        if (timerSegmentRef.current !== null) return;   // ya estaba corriendo
        const now = Date.now();
        timerSegmentRef.current = now;
        setTimerRunningSince(now);
      } else {
        const segment = timerSegmentRef.current;
        if (segment === null) return;                   // ya estaba pausado
        const next = accum + (Date.now() - segment);
        timerAccumRef.current = next;
        timerSegmentRef.current = null;
        setTimerBaseMs(next);
        setTimerRunningSince(null);
      }
    });
    return () => sub.remove();
  }, []);

  // Pedir reseña tras una racha buena. El ref es imprescindible: al arrancar,
// userProgress restaura la racha desde elo_history, así que sin él un usuario
// que cerró la app con 8 aciertos seguidos vería el diálogo nada más abrir,
// sin haber hecho nada.
const prevStreakRef = useRef<number | null>(null);

useEffect(() => {
  const prev = prevStreakRef.current;
  prevStreakRef.current = currentStreak;

  if (prev === null) return;            // primera lectura, viene de la BD
  if (currentStreak <= prev) return;    // no ha subido: fallo o reinicio
  if (currentStreak < REVIEW_MIN_STREAK) return;
  if (appMode !== 'puzzles') return;    // ni contrarreloj ni supervivencia ni repaso

  // Margen para que la animación de acierto termine y el siguiente puzle esté
  // en pantalla. Pedir la reseña encima del confeti queda fatal.
  const timer = setTimeout(() => {
    maybeAskForReview({ streak: currentStreak, usageMs: getUsageMs() });
  }, 2000);

  return () => clearTimeout(timer);
}, [currentStreak, appMode, getUsageMs]);


const mapRow = (r: any): Puzzle => ({
  id: String(r.id),
  fen: r.fen,
  solution: String(r.solution).split(' ').filter(Boolean),
  rating: Number(r.rating),
  themes: themeKeysFromRow(r),
});

// `fresh` = el jugador no lo ha resuelto nunca. Se lee de la propia fila
// (ALREADY_SOLVED_COLUMN), no de la pasada que la encontró: así es exacto
// también en la pasada de "el único que queda es el de pantalla".
type PuzzlePick = { puzzle: Puzzle; fresh: boolean };

const queryPuzzle = useCallback(async (
  database: SQLite.SQLiteDatabase, range: number[], themes: string[],
  // El puzle del tablero. Sin excluirlo, con un filtro de pocos puzles la
  // precarga elegía el MISMO que estás resolviendo (aún no está resuelto, así
  // que pasa el filtro de no resueltos) y "Siguiente" lo volvía a poner.
  excludeId: string | null = null,
  // "Permitir puzles repetidos": sorteo sobre TODO el filtro, resueltos
  // incluidos, en vez de agotar primero los nuevos. Cada puzle tiene la misma
  // probabilidad de salir, así que con el 80% del filtro resuelto, 4 de cada 5
  // serán repetidos.
  mixRepeats = false,
): Promise<PuzzlePick | null> => {
  const filtro = themeFilter(themes);
  const maxRowid = await getMaxRowid(database);

  // Arrancamos en un rowid aleatorio y buscamos la primera fila que cumpla
  // el filtro a partir de ahí. El coste depende de lo cerca que esté la
  // coincidencia más próxima, no del total de filas que cumplan el filtro.
  //
  // El '+' de '+rating' NO es un error tipográfico: desactiva el uso del índice
  // para esa columna. Sin él, SQLite prefiere idx_puzzles_rating y luego tiene
  // que construir un B-tree temporal para el ORDER BY rowid, que es justo lo
  // que este diseño quería evitar. Medido sobre 100k filas:
  //   sin '+': SEARCH USING INDEX idx_puzzles_rating + USE TEMP B-TREE -> 3 ms
  //            (25 ms si además hay filtro de temas)
  //   con '+': SEARCH USING INTEGER PRIMARY KEY (rowid>?)              -> 0,02 ms
  //
  // El coste depende de la selectividad del filtro, no del tamaño de la tabla:
  // medido igual (0,01-0,02 ms) con 100k, 500k, 1M y 3M filas.
  //
  // Dos pasadas: primero solo puzles que el jugador no ha resuelto nunca
  // (ver UNSOLVED_FILTER en puzzleStats.ts). Si la banda + temas está agotada,
  // la segunda repite sin exclusión: mejor un puzle repetido que "No puzzles".
  // La primera pasada vacía cuesta un escaneo de la banda (~20 ms con 500k),
  // pero solo le pasa a quien ya se ha resuelto la banda entera.
  //
  // Tercera pasada solo si hay excludeId: un filtro que casa con UN puzle, y es
  // el que está en pantalla. Mejor repetirlo que decir que no hay ninguno.
  const notCurrent = excludeId ? 'AND id <> ?' : '';
  const notCurrentParams = excludeId ? [excludeId] : [];
  //
  // Con mixRepeats no hay primera pasada: se sortea entre todos.
  const passes = [
    ...(mixRepeats ? [] : [{ sql: `${UNSOLVED_FILTER} ${notCurrent}`, params: notCurrentParams }]),
    { sql: notCurrent, params: notCurrentParams },
    ...(excludeId ? [{ sql: '', params: [] as string[] }] : []),
  ];
  const toPick = (r: any): PuzzlePick => ({ puzzle: mapRow(r), fresh: !r.already_solved });

  for (const pass of passes) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const startRowid = Math.floor(Math.random() * maxRowid) + 1;
      const r = await database.getFirstAsync<any>(
        `SELECT *, ${ALREADY_SOLVED_COLUMN} FROM puzzles WHERE rowid >= ? AND +rating BETWEEN ? AND ? ${filtro.sql} ${pass.sql} ORDER BY rowid LIMIT 1`,
        [startRowid, range[0], range[1], ...filtro.params, ...pass.params]
      );
      if (r) return toPick(r);
    }

    // Red de seguridad: si 4 intentos no encontraron nada hacia adelante
    // (filtro muy raro, mala suerte con el punto de arranque), buscamos sin
    // restricción de rowid. Esto sí puede tardar más, pero solo en el peor caso.
    const r = await database.getFirstAsync<any>(
      `SELECT *, ${ALREADY_SOLVED_COLUMN} FROM puzzles WHERE rating BETWEEN ? AND ? ${filtro.sql} ${pass.sql} LIMIT 1`,
      [range[0], range[1], ...filtro.params, ...pass.params]
    );
    if (r) return toPick(r);
  }
  return null;
}, []);

const prefetchNext = useCallback(async (
  range: number[],
  themes: string[],
  // Igual que en loadSinglePuzzle: en el primer arranque la conexión existe
  // pero `db` todavía es null, porque setDb aún no ha provocado el re-render.
  // Sin este parámetro, el `db!` de abajo era null y getMaxRowid petaba.
  databaseToUse?: SQLite.SQLiteDatabase,
  excludeId: string | null = null,
) => {
  const database = databaseToUse ?? db;
  if (!database) return;

  if (prefetchingRef.current) return;
  const existing = pickPrefetched(nextPuzzleRef.current, range, themes);
  if (existing && (existing.fresh || allowRepeatsRef.current)) return;   // ya hay uno válido para este rango
  prefetchingRef.current = true;
  try {
    // Sin repetidos permitidos solo se guardan puzles nuevos: una repetición
    // precargada se colaría por pickPrefetched y el aviso de "todos resueltos"
    // no saltaría nunca. Con ellos permitidos se guarda lo que salga, marcado.
    const mix = allowRepeatsRef.current;
    const pick = await queryPuzzle(database, range, themes, excludeId, mix);
    if (pick && (pick.fresh || mix)) {
      nextPuzzleRef.current = { themesKey: themesKeyOf(themes), puzzle: pick.puzzle, fresh: pick.fresh };
    }
  } finally {
    prefetchingRef.current = false;
  }
}, [db, queryPuzzle]);

// Función para sincronizar las piezas con el tablero de chess.js
const syncPiecesFromGame = (chessGame: Chess) => {
  setPieces(buildPieceItems(chessGame));
};


// Corta la línea del motor que se esté reproduciendo y libera el tablero. El
// bucle de handleEngineSequencePress comprueba su id tras cada espera y se
// retira solo. Lo llama todo lo que saca del análisis o cambia de posición.
const cancelEngineSequence = () => {
  if (activeSequenceRef.current === null) return;
  activeSequenceRef.current = null;
  analysisEngine.isSequencePlayingRef.current = false;
  setIsSequencePlaying(false);
};

// Invalida la reproducción animada que hubiera en marcha (solución o
// rebobinado) y libera el tablero. La llama todo lo que pone otro puzle
// delante: sin esto, pulsar Saltar/Siguiente mientras corre la solución dejaba
// el bucle viejo escribiendo sobre el puzle recién cargado.
const cancelPuzzlePlayback = () => {
  playbackRunRef.current++;
  setIsShowingSolution(false);
};

// Función para reiniciar el estado del puzzle, usada tanto al cargar un nuevo puzzle como al hacer Retry después de resolverlo
// isRetry: true SOLO cuando se reinicia un puzzle que el usuario ya intentó.
// Determina si el puzzle otorga ELO o no. Es explícito a propósito:
const resetPuzzleState = (puzzle: Puzzle, isInitialLoad = false, isRetry = false, isHistory = false, firstMoveDelayMs = PUZZLE_TIMING.firstMove) => {
  if (!puzzle) return;

  // Antes de tocar nada: si venía corriendo la solución o el rebobinado del
  // puzle anterior, queda invalidado aquí mismo.
  cancelPuzzlePlayback();

  setIsRetryMode(isRetry);
  setIsHistoryMode(isHistory);
  // Un puzle recién puesto en el tablero vuelve a estar pendiente, salvo en un
  // reintento: ese ya puntuó la primera vez y no debe reanudarse al reabrir.
  setIsPuzzleConsumed(isRetry);

  const newGame = new Chess(puzzle.fen);

  const localSolution = [...puzzle.solution];
  const initialFen = puzzle.fen;

  // --- LIMPIEZA DE UI ---
  setLegalMoves([]);      
  setSelectedSquare(null); 
  setMessage("");         
  cancelEngineSequence();
  analysisEngine.exitAnalysisMode();
  setSuccessSquare(null);
  setErrorSquare(null);
  setLastMoveFrom(null);
  setLastMoveTo(null);
  setHintSquare(null);
  setHintMove(null); 
  hintClicksRef.current = 0;
  resetTimer();  

  seedIdentityMap(newGame);
  setGame(newGame);
  syncPiecesFromGame(newGame);
  // Aquí había un setTimeout(() => syncPiecesFromGame(newGame), 10) heredado del
  // primer prototipo. Reconstruía `pieces` con los mismos IDs 10 ms después:
  // ChessBoard lo tomaba como otra actualización y montaba la posición nueva a
  // mitad de la transición, con un render extra del tablero en cada carga.
  setFenHistory([newGame.fen()]);
  setViewIndex(0);
  setIsReviewMode(false);
  setMessage("");
  setPuzzleSolved(false);
  setFirstMoveDone(false);
  setSolutionStep(0);

  const turnInFen = newGame.turn(); 
  const pColor = turnInFen === 'w' ? 'b' : 'w'; 
  setPlayerColor(pColor); 

  // SI ES CARGA INICIAL AL ABRIR LA APP, DETENEMOS AQUÍ EL FLUJO Y NO MOVEMOS LA MÁQUINA
  if (isInitialLoad) {
    // 1. En lugar de dar por hecho los movimientos guardados, reiniciamos el juego
    // al estado inicial del puzle (antes de que la máquina mueva en esta sesión)
    const initialChess = new Chess(puzzle.fen);
    setGame(initialChess);
    
    // 2. Reseteamos los historiales para que empiecen desde cero
    setFenHistory([puzzle.fen]);
    setMoveHistory([]);
    setViewIndex(0);
    
    // 3. Forzamos a que el tablero empiece bloqueado y que falte el primer movimiento
    setFirstMoveDone(false);
    setIsBoardLocked(true);
    setLoading(false);

  }

  // Movimiento normal retrasado de la máquina para puzles nuevos o del historial
  setTimeout(() => {
    if (!localSolution || localSolution.length === 0) return;
    
    const firstMove = localSolution[0];
    const from = firstMove.slice(0, 2) as Square;
    const to = firstMove.slice(2, 4) as Square;

    setLastMoveFrom(from);
    setLastMoveTo(to);

    const m0 = newGame.move({ from, to, promotion: 'q' });

    if (m0) {
      applyMoveIdentity(m0);
      setMoveHistory([m0.san]);
    }

    const nextFen = newGame.fen();
    setGame(new Chess(nextFen));
    syncPiecesFromGame(newGame);

    // El historial queda exactamente en [inicio, jugada de la máquina]. (Había
    // un setFenHistory(prev => ...) justo antes que esta línea sobrescribía.)
    setFenHistory([initialFen, nextFen]);
    setViewIndex(1);
    setIsReviewMode(false);

    setSolutionStep(1);
    setFirstMoveDone(true);
    setRunPuzzleToken(t => t + 1);
    setLoading(false); 
    startTimer(); // el usuario ya puede mover, empieza a contar
  }, firstMoveDelayMs);
};

// Función para cargar un nuevo puzzle aleatorio desde la DB, con opciones de rango de ELO y temas, y reseteo completo del estado del tablero y UI
// options.fast: modo contrarreloj. Recorta los tiempos muertos (bloqueo del
// botón y retardo del primer movimiento), que en 3 minutos son ~20 segundos.
const loadSinglePuzzle = async (
  activeDb?: SQLite.SQLiteDatabase | null,
  overrideRange?: number[],
  overrideThemes?: string[],
  options?: { fast?: boolean; recommended?: boolean }
) => {
  const isFast = options?.fast === true;
  const previousId = currentPuzzleIdRef.current;
  if (isNextDisabled && !isFast) return;
  setIsNextDisabled(true);

  // También aquí, y no solo en resetPuzzleState: si la consulta no devuelve
  // puzle, nunca se llega a resetPuzzleState y el bucle seguiría vivo.
  cancelPuzzlePlayback();

  setSolutionRevealed(false);
  setIsRetryMode(false);
  resetLock();
  setHintSquare(null);
  setIsBoardLocked(false);
  setIsReviewMode(false);
  cancelEngineSequence();
  analysisEngine.exitAnalysisMode();
  setEloFeedback(null);
  resetTimer(); 

  setMoveHistory([]);

  const databaseToUse = activeDb || db;
  if (!databaseToUse) return;

  setLoading(true);
  setMessage("");

  let currentRange = overrideRange || eloRange;
  const useRecommended = options?.recommended ?? isRecommendedMode;
  // En contrarreloj manda la escalera: ni filtros ni modo recomendado.
  if (!isFast && useRecommended) {
    // El estado de React es la fuente rápida, pero en el arranque todavía está
    // vacío: esta función se llama desde el efecto de boot, que cerró sobre el
    // `userRatings` del primer render. Sin la lectura de respaldo, la ventana
    // salía calculada sobre DEFAULT_ELO y el primer puzle tras abrir la app era
    // de 400 puntos aunque el jugador llevara meses en 1800.
    const globalElo =
      userRatings['global'] ??
      (await readGlobalElo(databaseToUse)) ??
      DEFAULT_ELO;
    currentRange = getRecommendedRange(globalElo);
  }

  const themesToUse = isFast ? [] : (overrideThemes || selectedThemes);

  // Intenta usar el puzzle precargado; si no encaja en el rango/temas, va a la BD
  let p: Puzzle | null = null;
  let exhausted = false;
  let replayId: string | null = null;
  const allowRepeats = !isFast && allowRepeatsRef.current;
  let cached = isFast ? null : pickPrefetched(nextPuzzleRef.current, currentRange, themesToUse);
  // Repetido precargado con el ajuste ya apagado: no vale, y se tira para que
  // prefetchNext no lo dé por bueno y pida uno nuevo.
  if (cached && !cached.fresh && !allowRepeats) { cached = null; nextPuzzleRef.current = null; }

  if (cached) {
    p = cached.puzzle;
    if (!cached.fresh) replayId = p.id;
    nextPuzzleRef.current = null;
  } else {
    let pick = await queryPuzzle(databaseToUse, currentRange, themesToUse, previousId, allowRepeats);
    // En contrarreloj, si la ventana está vacía la ensanchamos
    if (!pick && isFast) {
      console.warn('[RUN] ventana vacía', currentRange, '→ ampliando');
      pick = await queryPuzzle(databaseToUse, [Math.max(0, currentRange[0] - 400), currentRange[1] + 400], themesToUse, previousId);
    }
    // Las partidas rápidas repiten sin más; en modo normal no se repite nunca:
    // el hueco del tablero pasa a ser el aviso (boardNotice).
    exhausted = !!pick && !pick.fresh && !isFast && !allowRepeats;
    p = exhausted ? null : pick?.puzzle ?? null;
    // Repetición aceptada (el jugador lo permitió): se marca como tal.
    // En partidas rápidas no: ahí el ELO global no se toca de todas formas.
    if (p && pick && !pick.fresh && !isFast) replayId = p.id;
  }
  setReplayPuzzleId(replayId);

  // Filtro de un solo puzle en contrarreloj/supervivencia: vuelve el MISMO id,
  // el efecto de entrada (keyed por currentPuzzle?.id) no corre y el tablero
  // se quedaría fuera de pantalla. Se trae de vuelta a mano.
  if (p && p.id === previousId) restoreBoardPosition();

  if (!p) {
    // Sin puzle: el tablero se queda fuera (o se saca, si estaba a la vista,
    // como en el arranque) y su hueco lo ocupa el aviso. currentPuzzle a null
    // para que el siguiente puzle, sea cual sea, cambie de id y dispare la
    // entrada normal por la derecha.
    boardSlideX.value = -responsive.width;
    setBoardNotice(exhausted ? 'exhausted' : 'empty');
    setMessage("");
    setLoading(false);
    setCurrentPuzzle(null);
  } else {
    setCurrentPuzzle(p);
    resetPuzzleState(p, false, false, false, isFast ? CLOCK_TIMING.firstMove : PUZZLE_TIMING.firstMove);
   // Precarga el siguiente mientras el usuario resuelve este
    if (!isFast) prefetchNext(currentRange, themesToUse, databaseToUse, p.id);
  }

  setTimeout(() => {
    setIsNextDisabled(false);
  }, isFast ? 150 : PUZZLE_TIMING.nextLock);
}

// Aplica un puzzle del historial al tablero principal, sin otorgar/quitar ELO.
const openHistoryPuzzleOnBoard = useCallback((puzzle: Puzzle) => {
  resetPuzzleState(puzzle, false, false, true); // isHistory = true
  setCurrentPuzzle(puzzle);
}, [resetPuzzleState]);

const {
  isHistoryModalVisible,
  eloHistoryData,
  isHistoryListReady,
  isChartReady,    
  recentPuzzles,
  selectedHistoryItem,
  openHistory,
  closeHistory,
  selectHistoryPuzzle,
} = useEloHistory(db, openHistoryPuzzleOnBoard);

const {
  isStatsVisible, stats, isStatsLoading, statsRange,
  setStatsRange, openStats, closeStats,
} = useStats(db);

// Función para rebobinar el puzzle paso a paso (usada en el botón Retry)
const handleRetry = async () => {
  // Si estamos mostrando la solución o no hay historia para deshacer, cancelamos
  if (fenHistory.length < 2 || isShowingSolution) return;

  setIsRetryMode(true);
// Si el puzzle ya fue resuelto (por Show Solution), se hace un reseteo directo
  if (puzzleSolved && currentPuzzle) {
    setMessage("");
    setIsBoardLocked(false);
    setHintSquare(null);
    setPuzzleSolved(false);
    setErrorSquare(null);
    setSuccessSquare(null);
    setLastMoveFrom(null);
    setLastMoveTo(null);
    
    // Cargamos el FEN original directamente
    resetPuzzleState(currentPuzzle, false, true);   // isRetry = true: no otorga ELO
    
    setMoveHistory([]);
    clearSelection();
    return; // Salimos de la función sin ejecutar el bucle while de rebobinado
  }

  setHintSquare(null);
  setHintMove(null);
  setIsBoardLocked(false);
  // Mismo problema que la solución: el rebobinado también espera entre pasos y
  // puede quedar obsoleto si se cambia de puzle a mitad.
  const runId = ++playbackRunRef.current;
  const isStale = () => playbackRunRef.current !== runId;
  setIsShowingSolution(true); // Bloqueamos interacciones durante el rebobinado
  setErrorSquare(null);
  setSuccessSquare(null);
  setLastMoveFrom(null);
  setLastMoveTo(null);
  //setMessage("⏪ REBOBINANDO...");

  // Copiamos el historial para manipularlo
  const history = fenHistory.slice(0, viewIndex + 1);
  
  // Queremos volver hasta el índice 1 (la posición después del primer movimiento de la máquina)
  // Mientras el historial sea más largo que 2 (Inicio, PrimerMovMaquina)...
  while (history.length > 2) {
    const currentFen = history.pop(); // Sacamos el FEN actual (donde estamos)
    const targetFen = history[history.length - 1]; // El FEN al que queremos volver
    
    if (!currentFen || !targetFen) break;

    const gameCurrent = new Chess(currentFen);
    const gameTarget = new Chess(targetFen);

    // Identificamos qué pieza se movió comparando los dos estados
    let fromSq = ""; // Donde terminó la pieza (en el error)
    let toSq = "";   // De donde vino originalmente (el origen real)

    gameTarget.board().forEach((row, r) => {
      row.forEach((cell, c) => {
        const sq = String.fromCharCode(97 + c) + (8 - r);
        const pTarget = gameTarget.get(sq as any);
        const pCurrent = gameCurrent.get(sq as any);

        // Si en el destino (Target) había una pieza que ahora no está en Current
        // significa que esa casilla es el origen del movimiento que estamos deshaciendo
        if (pTarget && !pCurrent) toSq = sq;
        
        // Si en Current hay una pieza que no estaba en Target (o era distinta)
        // esa es la casilla desde la que rebobinamos
        if (pCurrent && JSON.stringify(pCurrent) !== JSON.stringify(pTarget)) {
          fromSq = sq;
        }
      });
    });

    if (fromSq && toSq) {
      const pieceId = getIdentityAt(fromSq);
      if (pieceId) {
        // 1. Mover la identidad visual hacia ATRÁS (misma lógica que un movimiento normal)
        moveIdentity(fromSq, toSq);

        // Actualizamos las piezas para disparar la animación de Reanimated
        setPieces(current => 
          current.map(p => p.id === pieceId ? { ...p, square: toSq } : p)
        );
      }
    }
    // 2. Actualizamos el motor de ajedrez al estado anterior
    setGame(new Chess(targetFen));
    syncPiecesFromGame(gameTarget);

    await new Promise(resolve => setTimeout(resolve, PUZZLE_TIMING.rewindStep));
    if (isStale()) return;
  }

  // Finalización del estado
  setFenHistory([fenHistory[0], fenHistory[1]]);
  setViewIndex(1);
  setIsReviewMode(false);
  setSolutionStep(1);
  setPuzzleSolved(false);
  setMessage("");
  setIsShowingSolution(false); 
  clearSelection();
  setMoveHistory(prev => prev.slice(0, 1));
  startTimer(); 
};

// Función para mostrar la solución paso a paso, con animaciones, desde el punto donde el jugador se quedó
const showSolution = async () => {
  if (!currentPuzzle || isShowingSolution) return;

  // Esta reproducción es la única válida mientras nadie cambie de puzle.
  const runId = ++playbackRunRef.current;
  const isStale = () => playbackRunRef.current !== runId;

  setIsShowingSolution(true);
  setSolutionRevealed(true);
  setIsPuzzleConsumed(true);
  stopTimer(false);

  // Ver la solución cuenta como "no lo sabía": entra en la cola de repaso.
  // En repaso, además, deja el puzle dentro de la cola aunque luego lo
  // resuelvas con Retry.
  if (isRepasoMode) repaso.registerResult(false, currentPuzzle.id);
  else if (canFeedRepaso) repaso.capture('solution', currentPuzzle);

  clearSelection();
  setHintSquare(null);
  setHintMove(null);
  setSuccessSquare(null);
  setLastMoveFrom(null);
  setLastMoveTo(null);
  setErrorSquare(null);
  // 1. DESHACER EL ERROR DEL JUGADOR
  // El historial tiene: [Inicio, Máquina, Jugador(Error)]
  // Queremos volver al índice 1 (después del primer movimiento de la máquina)
  const historyClean = [...fenHistory];
  if (message.includes('❌') && historyClean.length > 2) {
    historyClean.pop(); // Quitamos el error
  }
  
  const lastValidFen = historyClean[historyClean.length - 1];
  const playbackGame = new Chess(lastValidFen);

  // Actualizamos el tablero para que la pieza "vuelva" a su sitio
  setGame(new Chess(lastValidFen));
  syncPiecesFromGame(playbackGame);
  setFenHistory(historyClean);
  setViewIndex(historyClean.length - 1);

  // 2. PAUSA DE ESPERA (800ms)
  await new Promise(resolve => setTimeout(resolve, PUZZLE_TIMING.solutionPause));
  if (isStale()) return;

  // 3. COMPLETAR LA SOLUCIÓN DESDE DONDE ESTABA
  // Usamos 'solutionStep' para saber por qué movimiento iba el puzzle
  for (let i = solutionStep; i < currentPuzzle.solution.length; i++) {
    const moveStr = currentPuzzle.solution[i];
    
    // Antes de mover, movemos la identidad para la animación
    const solutionMove = playbackGame.move({
      from: moveStr.slice(0, 2) as Square,
      to: moveStr.slice(2, 4) as Square,
      promotion: 'q'
    });
    if (solutionMove) applyMoveIdentity(solutionMove);

    // Actualizamos el estado visual
    setGame(new Chess(playbackGame.fen()));
    syncPiecesFromGame(playbackGame);

    setLastMoveFrom(moveStr.slice(0, 2))
    setLastMoveTo(moveStr.slice(2, 4));
    
    // Guardamos en el historial para que el modo análisis funcione después
    setFenHistory(prev => [...prev, playbackGame.fen()]);

    // Pausa entre movimientos de la solución
    await new Promise(resolve => setTimeout(resolve, PUZZLE_TIMING.solutionStep));
    // Si a mitad de la línea el usuario ha saltado de puzle, el resto de la
    // solución NO se aplica: el tablero ya es otro.
    if (isStale()) return;
  }

  setPuzzleSolved(true);
  setIsShowingSolution(false);
  //setMessage("✅ SOLUCIÓN COMPLETADA");
};

// Función central para manejar la interacción del usuario con el tablero
function onSquarePress(square: string | null, isDraggingInteraction: boolean = false) {
  if (activeSequenceRef.current !== null) return;
  if (!square) {
    clearSelection();
    return;
  }

  if (!firstMoveDone || !currentPuzzle || (isBoardLocked && !analysisEngine.isAnalysisMode)) return;
  if (isReviewMode && !analysisEngine.isAnalysisMode) return;

  const targetPiece = game.get(square as any);
  
  const turnColor = game.turn();
  const isPlayerTurn = analysisEngine.isAnalysisMode 
    ? targetPiece?.color === turnColor 
    : targetPiece?.color === playerColor;

  // 1. Si el jugador interactúa con una pieza de su propio color
  if (isPlayerTurn) {
    if (selectedSquare === square) {
      // 🌟 CAMBIO CLAVE: Si ya está seleccionada pero la estamos ARRASTRANDO, NO la deseleccionamos.
      // Solo la deseleccionamos si es un click normal (tap) sobre ella misma.
      if (!isDraggingInteraction) {
        clearSelection();
      }
    } else {
      // Si toca otra pieza de su color, cambia la selección normalmente.
      // getLegalDestinations: mismas casillas que moves({ verbose: true }) sin
      // pagar SAN + FEN por jugada (ver src/lib/legalMoves.ts).
      setSelectedSquare(square);
      setLegalMoves(getLegalDestinations(game, square));
    }
    return;
  }

  // 2. Si el jugador hace click o interactúa con una casilla vacía o del rival
  if (selectedSquare) {
    const movingPiece = game.get(selectedSquare as any);
    if (!movingPiece) {
      clearSelection();
      return;
    }

    // Validamos si el movimiento es legal en el motor. Es la misma consulta que
    // hizo la selección sobre la misma posición: sale de la caché.
    const isLegalTarget = getLegalDestinations(game, selectedSquare).includes(square);

    if (isLegalTarget) {
      const fromSquare = selectedSquare; // Guardamos la casilla de origen temporalmente
      
      // Borramos instantáneamente los estados de selección y movimientos legales 
      // ANTES de ejecutar el movimiento o abrir modales, quitando el retraso visual en clicks.
      clearSelection(); 

      // Verificamos si es una coronación de peón
      const isPawn = movingPiece.type === 'p';
      const isPromotionRow = (movingPiece.color === 'w' && square[1] === '8') || 
                             (movingPiece.color === 'b' && square[1] === '1');

      if (isPawn && isPromotionRow) {
        setPendingMove({ from: fromSquare, to: square }); // Usamos la variable guardada
        setPromotionModalVisible(true);
      } else {
        executeMove(fromSquare, square, 'q'); // Usamos la variable guardada
      }
    } else {
      // Si el click fue en una casilla ilegal/vacía, limpiamos selección de inmediato
      clearSelection();
    }
  } else {
    clearSelection();
  }
}

// Función central para ejecutar un movimiento, tanto en modo puzzle como análisis
const executeMove = async (from: string, to: string, promotion: string = 'q') => {
  if (activeSequenceRef.current !== null) return;
  if (!currentPuzzle || (isBoardLocked && !analysisEngine.isAnalysisMode)) return;

  // 1. Bloqueo de seguridad para evitar doble toque
  if (!analysisEngine.isAnalysisMode) {
    setIsBoardLocked(true);
    setHintSquare(null);
    setHintMove(null);
  }

  const moveStr = `${from}${to}`;
  const playerMoveWithPromotion = moveStr + promotion;
  
  try {
    const gameCopy = new Chess(game.fen());
    const move = gameCopy.move({ 
      from: from as Square, 
      to: to as Square, 
      promotion: promotion 
    });

    if (move) {
      // Identificamos si el movimiento es una captura (chess.js incluye 'captured' si lo es)
      const isCapture = 'captured' in move;

      // --- A. LÓGICA PARA MODO ANÁLISIS ---
      if (analysisEngine.isAnalysisMode) {
        // Feedback táctil para modo análisis
        deferFeedback(() => {
          if (isCapture) {
            hapticImpact('heavy');
            playSound('capture');
          } else {
            hapticImpact('medium');
            playSound('move');
          }
        });

        applyMoveIdentity(move);
        const nextFen = gameCopy.fen();

        // El motor arranca la búsqueda nueva a los pocos ms de este commit y
        // las primeras profundidades salen de golpe. Retenemos el repintado del
        // panel mientras la pieza se anima.
        analysisEngine.holdOutput(PUZZLE_TIMING.engineOutputHold);

        setLastMoveFrom(move.from);
        setLastMoveTo(move.to);

        setGame(gameCopy);
        syncPiecesFromGame(gameCopy);
        
        setMoveHistory(prev => {
          const truncatedMoves = prev.slice(0, viewIndex);
          return [...truncatedMoves, move.san];
        });

        // Sin setViewIndex dentro del updater: un setState ahí se ejecuta
        // durante el render y obliga a React a repetir la función App entera.
        const analysisHistory = [...fenHistory.slice(0, viewIndex + 1), nextFen];
        setFenHistory(analysisHistory);
        setViewIndex(analysisHistory.length - 1);
        clearSelection();
        setPromotionModalVisible(false);
        setPendingMove(null);
        return; 
      }

      // --- B. LÓGICA PARA MODO PUZZLE ---
      const expectedMove = currentPuzzle.solution[solutionStep];
      const matchesSolution = playerMoveWithPromotion === expectedMove || moveStr === expectedMove;

      // La BD solo admite una línea por puzzle, pero hay posiciones con más de
      // un mate posible. Si el movimiento da mate, la partida ha terminado y no
      // hay nada que "fallar": lo damos por bueno.
      const isMateNow = gameCopy.isCheckmate();
      const isCorrect = matchesSolution || isMateNow;

      const playerSAN = move.san;
      setMoveHistory(prev => [...prev, playerSAN]);
      applyMoveIdentity(move);
      
      const nextFen = gameCopy.fen();
      setGame(gameCopy);
      syncPiecesFromGame(gameCopy);

      setLastMoveFrom(move.from);
      setLastMoveTo(move.to);

      if (isCorrect) {
        const nextStep = solutionStep + 1;

        // Con mate el puzzle acaba aquí aunque a la solución de la BD le queden
        // movimientos: la máquina no puede responder a un mate.
        const isPuzzleFinished = isMateNow || nextStep === currentPuzzle.solution.length;

        if (isPuzzleFinished) {
          // PUZZLE FINALIZADO CON ÉXITO: Vibración de victoria
          const solveMs = stopTimer(true);
          // Veredicto dado: el puzle ya no se guarda para reanudarlo.
          setIsPuzzleConsumed(true);
          deferFeedback(() => { hapticSuccess(); playSound('success'); });
          
          const solvedHistory = [...fenHistory, nextFen];
          setFenHistory(solvedHistory);
          setViewIndex(solvedHistory.length - 1);
          setSuccessSquare(to);

          if (currentPuzzle) {
            if (isRunReview) {
              // Repaso post-partida: el puzle es solo para analizar. Ni ELO ni
              // escalera ni carga automática del siguiente.
            } else if (isClockMode) {
              // Contrarreloj: no toca el ELO global, alimenta la escalera de la partida
              const { nextRange, timeUp } = clock.registerResult(true, currentPuzzle.id, currentPuzzle.rating, solveMs);
              if (!timeUp) swapRunPuzzle(nextRange, CLOCK_TIMING.afterSolve);

            } else if (isSurvivalMode) {
              // Supervivencia: acierto -> sube escalón, las vidas no se tocan
              const { nextRange, gameOver, ignored } = survival.registerResult(true, currentPuzzle.id, currentPuzzle.rating, solveMs);
              if (!ignored && !gameOver) swapRunPuzzle(nextRange, CLOCK_TIMING.afterSolve);

            } else if (isRepasoMode) {
              // Acertar lo saca de la cola. NO toca el ELO: ya lo pagaste
              // cuando lo fallaste y aquí puedes acordarte de la solución, así
              // que sumaría ELO que no has ganado. Tampoco escribe en
              // elo_history, para no descuadrar el panel de estadísticas.
              repaso.registerResult(true, currentPuzzle.id);

            } else if (isReplay && !isRetryMode) {
              // Repetido: ya lo resolviste antes, no hay premio. Solo el contador.
              // (Un reintento tras fallarlo cae abajo y no cuenta nada, como
              // cualquier reintento.)
              if (db) recordPuzzleResult(db, currentPuzzle.id, true).catch(() => {});

            } else if (!isHistoryMode && !isRetryMode) {
              const temasArray = currentPuzzle.themes;
              const puntosGanados = await updateElo(currentPuzzle.id, temasArray, true,  currentPuzzle.rating, solveMs, isRecommendedMode, hintClicksRef.current);
              if (puntosGanados !== 0) {
                setEloFeedback({ value: puntosGanados });
              }
            }
          }

          setTimeout(() => { 
            setMessage("✅"); 
            setPuzzleSolved(true); 
            setIsBoardLocked(false);
          }, isRunPlaying ? 80 : PUZZLE_TIMING.solvedFeedback);
        } else {
          // MOVIMIENTO CORRECTO (pero el puzzle sigue): Vibración de movimiento
          deferFeedback(() => {
            if (isCapture) {
              hapticImpact('heavy');
              playSound('capture');
            } else {
              hapticImpact('medium');
              playSound('move');
            }
          });

          // TURNO DE LA MÁQUINA (Respuesta automática)
          setSolutionStep(nextStep + 1);
          const resp = currentPuzzle.solution[nextStep];
          
          setTimeout(() => {
            const gameAfterResp = new Chess(gameCopy.fen());
            const mResp = gameAfterResp.move({ 
              from: resp.slice(0, 2) as Square, 
              to: resp.slice(2, 4) as Square, 
              promotion: promotion
            });
            
            if (mResp) {
              // Vibración ligera cuando la máquina te responde (opcional, pero da un gran feedback)
              const machineCaptured = 'captured' in mResp;
              deferFeedback(() => hapticImpact(machineCaptured ? 'medium' : 'light'));

              setMoveHistory(prev => [...prev, mResp.san]);
              applyMoveIdentity(mResp);
            }
            
            const finalFen = gameAfterResp.fen();
            setGame(gameAfterResp);
            syncPiecesFromGame(gameAfterResp);

            // fenHistory es el del render en que jugó el usuario: mientras llega
            // la respuesta el tablero está bloqueado y el historial no se toca.
            const replyHistory = [...fenHistory, nextFen, finalFen];
            setFenHistory(replyHistory);
            setViewIndex(replyHistory.length - 1);
            setIsReviewMode(false);

            setIsBoardLocked(false); 
          }, isRunPlaying ? CLOCK_TIMING.machineReply : PUZZLE_TIMING.machineReply);
        }
      } else {
        // MOVIMIENTO INCORRECTO: Vibración de error
        const solveMs = stopTimer(false);
        // Fallar también consume el puzle: el ELO ya se ha descontado.
        setIsPuzzleConsumed(true);
        deferFeedback(() => { hapticError(); playSound('error'); });

        const failedHistory = [...fenHistory, nextFen];
        setFenHistory(failedHistory);
        setViewIndex(failedHistory.length - 1);
        setErrorSquare(to);
        // En contrarreloj no hay footer ni retry: el puzzle se sustituye solo,
        // así que el tablero debe seguir bloqueado hasta que cargue el siguiente.
        if (!isRunPlaying) {
          setTimeout(() => {
            setMessage("❌");
            setIsBoardLocked(false);
          }, PUZZLE_TIMING.failFeedback);
        }

        if (currentPuzzle) {
          if (isRunReview) {
            // Repaso post-partida: fallar aquí no cuesta nada, solo se analiza.
          } else if (isClockMode) {
            // Fallo: NO baja de nivel, pero cambia de puzle al mismo rango
            const { nextRange, timeUp } = clock.registerResult(false, currentPuzzle.id, currentPuzzle.rating, solveMs);
            if (!timeUp) swapRunPuzzle(nextRange, CLOCK_TIMING.afterFail);

          } else if (isSurvivalMode) {
            // Fallo: NO baja de nivel, pero cuesta una vida. A cero, se acabó y
            // no cargamos nada: el modal de resultado lo abre el propio hook.
            const { nextRange, gameOver, ignored } = survival.registerResult(false, currentPuzzle.id, currentPuzzle.rating, solveMs);
            if (!ignored && !gameOver) swapRunPuzzle(nextRange, CLOCK_TIMING.afterFail);

          } else if (isRepasoMode) {
            // Sigue en la cola: sube fail_count y due_at lo manda al final,
            // así que la próxima sesión no te lo pone el primero.
            repaso.registerResult(false, currentPuzzle.id);

          } else if (isReplay && !isRetryMode) {
            // Repetido: tampoco castiga ni va a Repaso. Solo el contador.
            if (db) recordPuzzleResult(db, currentPuzzle.id, false).catch(() => {});

          } else if (!isHistoryMode && !isRetryMode) {
            const temasArray = currentPuzzle.themes;
            const puntosPerdidos = await updateElo(currentPuzzle.id, temasArray, false, currentPuzzle.rating, solveMs, isRecommendedMode, hintClicksRef.current);
            if (puntosPerdidos !== 0) {
              setEloFeedback({ value: puntosPerdidos });
            }
            // Lo que motiva todo esto: el puzle fallado se guarda solo.
            if (canFeedRepaso) repaso.capture('fail', currentPuzzle);
          }
        }
      }
    }
  } catch {
    setIsBoardLocked(false);
  }
  clearSelection();
  setPromotionModalVisible(false);
  setPendingMove(null);
};

const handleDragMove = (from: string, to: string) => {
  if (activeSequenceRef.current !== null) return;
  // 1. Buscamos qué pieza se está moviendo
  const movingPiece = game.get(from as any);
  if (!movingPiece) return;

  // 2. Comprobamos si es un peón a punto de coronar
  const isPawn = movingPiece.type === 'p';
  const isPromotionRow = (movingPiece.color === 'w' && to[1] === '8') || 
                         (movingPiece.color === 'b' && to[1] === '1');

  // 3. DECISIÓN CLAVE:
  if (isPawn && isPromotionRow) {
    // Si es coronación, abrimos TU MODAL (que ya funciona perfecto)
    setPendingMove({ from, to });
    setPromotionModalVisible(true);
    clearSelection();
  } else {
    // Si es un movimiento normal, que se ejecute del tirón
    executeMove(from, to, 'q');
  }
};

// Refs para callbacks estables: ChessBoard nunca ve identidades nuevas
const handlersRef = useRef<{
  onSquarePress: typeof onSquarePress;
  handleDragMove: typeof handleDragMove;
  clearSelection: typeof clearSelection;
}>({ onSquarePress, handleDragMove, clearSelection });

// useLayoutEffect y no useEffect: el ref queda al día en el mismo commit, antes
// de que pueda llegar otro toque con el closure del render anterior.
useLayoutEffect(() => {
  handlersRef.current = { onSquarePress, handleDragMove, clearSelection };
});

const stableSquarePress = useCallback(
  (sq: string | null, dragging?: boolean) =>
    handlersRef.current.onSquarePress(sq, dragging),
  []
);
const stableDragMove = useCallback(
  (from: string, to: string) =>
    handlersRef.current.handleDragMove(from, to),
  []
);
const stableClearSelection = useCallback(
  () => handlersRef.current.clearSelection(),
  []
);

useEffect(() => {
  if (!db) return;
  const sub = AppState.addEventListener('change', state => {
    if (state === 'background') void checkpointProgress(db);
  });
  return () => sub.remove();
}, [db]);

// Navegación única del historial: la usan tanto las flechas como la lista de
// jugadas, para que ambas dejen exactamente el mismo estado.
// (Antes handleMovePress no tocaba isReviewMode: si venías de pulsar la flecha
// atrás, el tablero se quedaba en modo revisión para siempre.)
const goToViewIndex = (targetIndex: number) => {
  // Flechas y lista de jugadas: saltar a mitad de una línea desincroniza el
  // índice local del bucle con el historial.
  if (activeSequenceRef.current !== null) return;
  if (targetIndex === viewIndex) return;
  if (targetIndex < 0 || targetIndex > fenHistory.length - 1) return;

  setSuccessSquare(null);
  setErrorSquare(null);
  setSelectedSquare(null);
  setLegalMoves([]);
  analysisEngine.clearBestMove();
  analysisEngine.holdOutput(PUZZLE_TIMING.engineOutputHold);

  // Recorremos el historial de una posición a la CONTIGUA, nunca de un salto:
  // así cada paso se resuelve como un movimiento exacto y solo se anima la
  // pieza que de verdad se movió.
  const step = targetIndex > viewIndex ? 1 : -1;
  let targetGame = game;
  for (let i = viewIndex; i !== targetIndex; i += step) {
    targetGame = stepIdentityBetweenFens(fenHistory[i], fenHistory[i + step]);
  }

  // Resaltado de "última jugada" de la posición a la que llegamos
  const lastMove = targetIndex > 0
    ? getMoveBetweenFens(fenHistory[targetIndex - 1], fenHistory[targetIndex])
    : null;
  setLastMoveFrom(lastMove?.from ?? null);
  setLastMoveTo(lastMove?.to ?? null);

  setViewIndex(targetIndex);
  setIsReviewMode(targetIndex !== fenHistory.length - 1);
  setGame(targetGame);
  syncPiecesFromGame(targetGame);
};

const navigateHistory = (direction: 'prev' | 'next') => {
  goToViewIndex(direction === 'prev' ? viewIndex - 1 : viewIndex + 1);
};

const handleMovePress = (targetIndex: number) => {
  goToViewIndex(targetIndex);
};

// Función para obtener la imagen de la pieza en la promoción, basada en el color del jugador
const getPromotionPieceImage = (type: string) => {
  // Si el jugador es blanco ('w'), usamos mayúsculas para el diccionario ('Q', 'N'...)
  // Si es negro ('b'), usamos minúsculas ('q', 'n'...)
  const pieceKey = playerColor === 'w' ? type.toUpperCase() : type.toLowerCase();
  return pieceImages[pieceKey];
};

// Función para mostrar pistas, actualmente solo ilumina la pieza a mover
const handleHint = () => {
  if (!currentPuzzle || puzzleSolved || isBoardLocked) return;

  // Pedir pista también mete el puzle en la cola. Es el motivo más flojo de
  // los tres (REPASO_REASON.hint), así que si además lo fallas el UPSERT lo
  // sube a 'fail' y no al revés.
  if (isRepasoMode) repaso.registerResult(false, currentPuzzle.id);
  else if (canFeedRepaso) repaso.capture('hint', currentPuzzle);

  const moveStr = currentPuzzle.solution[solutionStep];
  if (moveStr) {
    const fromSquare = moveStr.slice(0, 2);
    
    // Si la casilla ya estaba iluminada, es el SEGUNDO click
    if (hintSquare === fromSquare) {
      // Insistir con la flecha ya pintada no enseña nada nuevo: no cuenta.
      if (!hintMove) hintClicksRef.current += 1;
      setHintMove(moveStr); // Guardamos el movimiento completo ('e2e4') para la flecha
    } 
    // Si no estaba iluminada, es el PRIMER click
    else {
      hintClicksRef.current += 1;
      setLegalMoves([]);
      setSelectedSquare(null);
      setHintSquare(fromSquare);
      setHintMove(null); // Nos aseguramos de ocultar la flecha si reiniciamos la pista
    }
  }
};

// Foto del puzle en el momento de entrar en análisis. Al salir hay que
// descartar la variante explorada: si no, las jugadas de análisis se quedan
// mezcladas con la solución en el historial SAN y Retry/Next se vuelven locos.
const analysisBaseRef = useRef<{ fens: string[]; moves: string[]; index: number } | null>(null);

// Función para activar el modo análisis
const startAnalysis = () => { 
  analysisEngine.enterAnalysisMode();
  setIsBoardLocked(false);
  setIsReviewMode(false);
  setErrorSquare(null);
  setSuccessSquare(null);

  const targetIndex = fenHistory.length - 1;
  analysisBaseRef.current = { fens: [...fenHistory], moves: [...moveHistory], index: targetIndex };
  setViewIndex(targetIndex);
};

// Salir del análisis sin cambiar de puzle: apaga el motor y devuelve el tablero
// exactamente a como estaba al entrar.
const exitAnalysis = () => {
  cancelEngineSequence();
  analysisEngine.exitAnalysisMode();
  analysisEngine.clearBestMove();
  clearSelection();
  setHintSquare(null);
  setHintMove(null);

  const base = analysisBaseRef.current;
  analysisBaseRef.current = null;
  if (!base || base.fens.length === 0) return;

  // Durante el análisis se puede retroceder y jugar otra cosa, lo que RECORTA
  // fenHistory: el índice guardado puede haberse quedado fuera de rango.
  const index = Math.min(base.index, base.fens.length - 1);
  const restored = new Chess(base.fens[index]);

  seedIdentityMap(restored);
  setGame(restored);
  syncPiecesFromGame(restored);

  setFenHistory(base.fens);
  setMoveHistory(base.moves);
  setViewIndex(index);
  setIsReviewMode(false);
  setErrorSquare(null);
  setSuccessSquare(null);

  const lastMove = index > 0 ? getMoveBetweenFens(base.fens[index - 1], base.fens[index]) : null;
  setLastMoveFrom(lastMove?.from ?? null);
  setLastMoveTo(lastMove?.to ?? null);

  // startAnalysis desbloqueó el tablero. Si sales sin haber movido nada, ni
  // viewIndex ni fenHistory.length cambian y el efecto del candado no se
  // vuelve a disparar: en un puzle resuelto podrías seguir moviendo y el
  // movimiento contaría como fallo (con su pérdida de ELO).
  setIsBoardLocked(puzzleSolved);
};

// Persistencia entre sesiones. Antes esto era un único efecto que reescribía
// las CUATRO claves cada vez que cambiaba `currentPuzzle`, es decir cuatro
// escrituras en AsyncStorage (SQLite por debajo en Android) justo en el momento
// de la transición entre puzles. Ahora cada cosa se guarda cuando cambia.
//
// El cerrojo es un ref y no `!loading || db`: hasta que setup() no ha leído lo
// guardado, el estado son los defaults y escribirlos pisaría la sesión anterior.
const hasRestoredPrefsRef = useRef(false);
// id del puzle que ahora mismo está escrito en AsyncStorage, o null si no hay
// ninguno. Espejo en memoria del almacén para no escribir/borrar de más.
const storedPuzzleIdRef = useRef<string | null>(null);
// Último valor escrito de cada clave de filtros (tal cual queda en el almacén),
// para no reescribir lo que no ha cambiado. Se siembra al restaurar.
const persistedPrefsRef = useRef<Record<string, string>>({});

// Filtros. Temas y modo solo cambian desde el modal, pero en modo recomendado
// `eloRange` se recalcula desde el ELO en CADA puzle puntuado, y esto escribía
// las tres claves en AsyncStorage justo en la transición al siguiente puzle.
// Ese rango no hace falta guardarlo: con el modo activo se vuelve a calcular
// desde el ELO al arrancar y al pedir cada puzle. El rango que hay que conservar
// es el manual, y ese solo cambia con el modo desactivado.
useEffect(() => {
  if (!hasRestoredPrefsRef.current) return;
  const entries: [string, string][] = [
    ['@selected_themes', JSON.stringify(selectedThemes)],
    ['@is_recommended_mode', JSON.stringify(isRecommendedMode)],
  ];
  if (!isRecommendedMode) entries.push(['@elo_range', JSON.stringify(eloRange)]);

  const changed = entries.filter(([key, value]) => persistedPrefsRef.current[key] !== value);
  if (changed.length === 0) return;
  changed.forEach(([key, value]) => { persistedPrefsRef.current[key] = value; });
  AsyncStorage.multiSet(changed)
    .catch(error => console.error("Error al guardar los filtros en AsyncStorage:", error));
}, [eloRange, selectedThemes, isRecommendedMode]);

// Puzle activo: se guarda SOLO mientras sigue pendiente de respuesta.
// En cuanto da veredicto (acierto, fallo o solución vista) se borra, porque
// restaurarlo al reabrir la app devolvía al usuario un puzle ya resuelto y, al
// volver a resolverlo, lo hacía puntuar una segunda vez en el ELO.
// Tampoco se guarda en repaso, en contrarreloj/supervivencia ni con un puzle del
// historial abierto: al reabrir siempre se arranca en modo puzles y ahí esos
// puzles sí darían ELO.
// La ref evita tocar AsyncStorage cuando no hay nada que cambiar: sin ella, cada
// puzle de una partida de contrarreloj lanzaba un removeItem inútil.
useEffect(() => {
  if (!hasRestoredPrefsRef.current) return;

  const isResumable =
    !!currentPuzzle &&
    !isPuzzleConsumed &&
    !isReplay &&
    !isRepasoMode &&
    !isRunMode &&
    !isHistoryMode &&
    !isRetryMode;

  if (isResumable) {
    if (storedPuzzleIdRef.current === currentPuzzle!.id) return;
    storedPuzzleIdRef.current = currentPuzzle!.id;
    AsyncStorage.setItem('@current_puzzle', JSON.stringify(currentPuzzle))
      .catch(error => console.error("Error al guardar el puzle activo en AsyncStorage:", error));
  } else {
    if (storedPuzzleIdRef.current === null) return;
    storedPuzzleIdRef.current = null;
    AsyncStorage.removeItem('@current_puzzle')
      .catch(error => console.error("Error al borrar el puzle activo de AsyncStorage:", error));
  }
}, [currentPuzzle, isPuzzleConsumed, isReplay, isRepasoMode, isRunMode, isHistoryMode, isRetryMode]);

// Efecto para bloquear el tablero si estamos viendo un movimiento anterior o si el puzzle ya fue resuelto
useEffect(() => {
  // Partida terminada (contrarreloj o supervivencia) sin ningún puzle abierto
  // para repasar: el tablero queda muerto. Si el usuario ha abierto uno desde
  // el marcador, manda la lógica normal.
  if (isRunFinished && !isRunReview) {
    setIsBoardLocked(true);
    return;
  }
  if (isAtLastMove) {
    setIsBoardLocked(puzzleSolved ? true : false);
  } else {
    setIsBoardLocked(true);
  }
}, [viewIndex, fenHistory.length, puzzleSolved, isRunFinished, isRunReview]);

// Efecto para ajustar el rango de ELO recomendado cuando se active el modo recomendado o cambie el ELO global del usuario
useEffect(() => {
  // `userRatings` empieza vacío y se llena cuando useUserProgress termina de
  // leer la base. Sin esta guarda, el efecto corría en el montaje con el
  // diccionario a {}, pintaba el rango de DEFAULT_ELO en el slider y el efecto
  // de persistencia lo escribía en @elo_range, pisando el rango que el usuario
  // tuviera guardado.
  if (isRecommendedMode && userRatings['global'] !== undefined) {
    setEloRange(getRecommendedRange(userRatings['global']));
  }
}, [isRecommendedMode, userRatings['global']]);

useEffect(() => {
  // Misma duración que la eval bar (350ms) para que ambas transiciones se sientan sincronizadas
  moveListHeight.value = withTiming(
    analysisEngine.isAnalysisMode ? MULTI_PV_HEIGHT : MOVE_LIST_HEIGHT,
    { duration: 350 }
  );
}, [analysisEngine.isAnalysisMode, MULTI_PV_HEIGHT]);
const moveListWrapperAnimatedStyle = useAnimatedStyle(() => ({ height: moveListHeight.value, }));

// Sirve para el grafico de sesion actual (al lado del ELO)
useEffect(() => {
  const currentGlobalElo = userRatings['global'];
  if (currentGlobalElo === undefined) return; // Aún no cargó desde SQLite

  if (!hasSeededSessionElo.current) {
    // Primera carga real: sembramos el punto de partida de la sesión, no lo tratamos como "cambio"
    setSessionEloHistory([currentGlobalElo]);
    hasSeededSessionElo.current = true;
    return;
  }
  // El ELO global cambió (puzzle resuelto/fallado): añadimos el nuevo punto a la sesión
  setSessionEloHistory(prev => [...prev, currentGlobalElo]);
}, [userRatings['global']]);

const eloRowProgress = useSharedValue(1);

useEffect(() => {
  eloRowProgress.value = withTiming(analysisEngine.isAnalysisMode ? 0 : 1, { duration: 350 });
}, [analysisEngine.isAnalysisMode]);


const eloRowAnimatedStyle = useAnimatedStyle(() => ({
  height: (isRunMode ? CLOCK_ROW_HEIGHT : ELO_ROW_HEIGHT + STREAK_SLOT_HEIGHT) * eloRowProgress.value,
  opacity: eloRowProgress.value,
  // El recuadro de la partida ya es más alto que la fila de ELO: el aire de
  // debajo se recorta para no empujar el tablero (y con él el footer).
  marginBottom: (isRunMode ? CLOCK_ROW_MARGIN_BOTTOM : ELO_ROW_MARGIN_BOTTOM) * eloRowProgress.value,
}), [isRunMode]);

// --- TAMAÑO DEL TABLERO Y ESCALA DE LA UI ---
// Alto que suman las zonas variables en un estado dado (ya terminadas sus
// animaciones). Tiene que reflejar exactamente eloRowAnimatedStyle, el margen
// de containerMainContent, la eval bar de ChessBoard y moveListWrapperAnimatedStyle.
const variableHeightFor = (run: boolean, analysis: boolean) => {
  const eloBlock = analysis
    ? 0
    : run
      ? CLOCK_ROW_HEIGHT + CLOCK_ROW_MARGIN_BOTTOM
      : ELO_ROW_HEIGHT + STREAK_SLOT_HEIGHT + ELO_ROW_MARGIN_BOTTOM;
  const mainMarginTop = run ? MAIN_CONTENT_MARGIN_TOP_RUN : MAIN_CONTENT_MARGIN_TOP;
  const evalBar = analysis ? EVAL_BAR_BLOCK_HEIGHT : 0;
  const moveZone = analysis ? MULTI_PV_HEIGHT : MOVE_LIST_HEIGHT;
  return eloBlock + mainMarginTop + evalBar + moveZone;
};

// Lo que el contenido central puede desbordar sin pisar la fila de ELO ni el
// footer. Va centrado, así que reparte el exceso a partes iguales entre el
// margen de arriba y el de abajo: manda el menor de los dos.
const overflowAllowanceFor = (run: boolean) =>
  2 * Math.min(run ? MAIN_CONTENT_MARGIN_TOP_RUN : MAIN_CONTENT_MARGIN_TOP, MAIN_CONTENT_MARGIN_BOTTOM);

const effectiveHeightFor = (run: boolean, analysis: boolean) =>
  variableHeightFor(run, analysis) - overflowAllowanceFor(run);

const responsive = useResponsive();
const { s, uiScale } = responsive;

const boardFit = useBoardFit({
  windowWidth: responsive.width,
  windowHeight: responsive.height,
  currentVariableHeight: variableHeightFor(isRunMode, analysisEngine.isAnalysisMode),
  worstEffectiveHeight: Math.max(
    effectiveHeightFor(false, false),
    effectiveHeightFor(false, true),
    effectiveHeightFor(true, false),
    effectiveHeightFor(true, true),
  ),
});
const { contentWidth } = boardFit;

// Tamaños escalados de la pantalla principal. Valores base = diseño en móvil:
// con uiScale = 1 todo queda igual que antes.
const sc = useMemo(() => ({
  menuBtn: { width: s(48), height: s(48) },
  menuIcon: s(34),
  pillBtn: { paddingVertical: s(10), paddingHorizontal: s(15), borderRadius: s(12) },
  pillIcon: s(16),
  noticeIcon: s(48),
  replayTag: { marginLeft: s(10), paddingVertical: s(3), paddingHorizontal: s(8), borderRadius: s(6), gap: s(4) },
  replayIcon: s(12),
  replayText: { fontSize: s(11) },
  noticeTitle: { fontSize: s(18) },
  noticeBody: { fontSize: s(14), lineHeight: s(20) },
  pillText: { fontSize: s(12) },
  badge: { minWidth: s(18), height: s(18), borderRadius: s(9) },
  badgeText: { fontSize: s(10) },
  turnFrame: { paddingVertical: s(6), paddingHorizontal: s(20), borderRadius: s(25) },
  turnDot: { width: s(14), height: s(14), borderRadius: s(7), marginRight: s(12) },
  turnText: { fontSize: s(13) },
  metaRow: { height: s(40) },
  metaText: { fontSize: s(13) },
  metaBullet: { fontSize: s(34) },
// eslint-disable-next-line react-hooks/exhaustive-deps
}), [uiScale]);

// --- TRANSICIÓN DE TABLERO EN CONTRARRELOJ ---
const BOARD_SLIDE_OUT = 180;
const BOARD_SLIDE_IN = 220;
const BOARD_GAP = 0; 
const boardSlideX = useSharedValue(0);
const boardSlideStyle = useAnimatedStyle(() => ({ transform: [{ translateX: boardSlideX.value }] }));

// Solo true mientras el tablero entra o sale de pantalla. Alimenta
// renderToHardwareTextureAndroid: esa bandera crea una capa hardware del
// tablero entero, y Android la invalida cada vez que cambia algo dentro. Como
// las piezas animan constantemente, dejarla fija significaba reconstruir esa
// textura en cada frame de cada jugada. Solo compensa durante el desplazamiento,
// que es cuando el contenido está quieto y lo único que se mueve es el transform.
const [isBoardSliding, setIsBoardSliding] = useState(false);

const hasSlidOnceRef = useRef(false);
const pendingEntryRef = useRef(false);
const entryFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

useEffect(() => {
  if (!currentPuzzle) return;

  // Entra un puzle: el aviso de "sin puzles" deja de tener sentido.
  setBoardNotice(null);

  // El primer puzle de la sesión no viene de ningún sitio: aparece sin deslizar
  if (!hasSlidOnceRef.current) {
    hasSlidOnceRef.current = true;
    boardSlideX.value = 0;
    return;
  }

  boardSlideX.value = responsive.width;
  setIsBoardSliding(true);

  // Dos frames: el primero cierra el commit de React (pieces ya están en el
  // estado), el segundo asegura que las vistas nativas de las piezas ya
  // existen antes de empezar a mover nada.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    boardSlideX.value = withDelay(
      BOARD_GAP,
      withTiming(0, { duration: BOARD_SLIDE_IN, easing: Easing.out(Easing.cubic) })
    );
  }));

  // +80ms de holgura sobre los dos requestAnimationFrame y el withDelay.
  const layerOff = setTimeout(
    () => setIsBoardSliding(false),
    BOARD_GAP + BOARD_SLIDE_IN + 80
  );
  return () => clearTimeout(layerOff);
}, [currentPuzzle?.id]);

useEffect(() => () => { if (entryFallbackRef.current) clearTimeout(entryFallbackRef.current); }, []);

// Devuelve el tablero a su sitio cuando slidePuzzle lo sacó pero no va a
// entrar un puzle nuevo (ver loadSinglePuzzle). Si ya estaba en 0 es un no-op.
const restoreBoardPosition = useCallback(() => {
  boardSlideX.value = withTiming(0, { duration: BOARD_SLIDE_IN, easing: Easing.out(Easing.cubic) });
  setTimeout(() => setIsBoardSliding(false), BOARD_SLIDE_IN + 80);
}, [boardSlideX]);

// Evita que un doble toque encadene dos salidas: durante los BOARD_SLIDE_OUT ms
// isNextDisabled todavía es false, porque loadSinglePuzzle aún no ha corrido.
const isSwappingRef = useRef(false);

// Salida por la izquierda -> carga -> la entrada la dispara el efecto de currentPuzzle.id
const slidePuzzle = useCallback((load: () => void, delayMs = 0) => {
  if (isSwappingRef.current) return;
  isSwappingRef.current = true;

  setTimeout(() => {
    // La partida pudo terminar durante la pausa: reloj agotado en contrarreloj,
    // última vida perdida en supervivencia.
    if (isRunMode && runPhaseRef.current !== 'running') {
      isSwappingRef.current = false;
      return;
    }
    setIsBoardSliding(true);
    boardSlideX.value = withTiming(-responsive.width, { duration: BOARD_SLIDE_OUT, easing: Easing.in(Easing.cubic) });

    setTimeout(() => {
      isSwappingRef.current = false;
      // La partida terminó a mitad de la salida: el efecto de entrada no se va
      // a disparar, así que la capa hay que apagarla aquí o se queda encendida.
      if (isRunMode && runPhaseRef.current !== 'running') {
        setIsBoardSliding(false);
        return;
      }
      load();
    }, BOARD_SLIDE_OUT);
  }, delayMs);
}, [isRunMode, runPhaseRef, responsive.width]);

const swapRunPuzzle = useCallback((nextRange: number[], delayMs: number) => {
  slidePuzzle(() => loadSinglePuzzle(db, nextRange, [], { fast: true }), delayMs);
}, [db, slidePuzzle]);

// =========================================================
// MODO REPASO
// =========================================================
// No pasa por loadSinglePuzzle: aquí no hay consulta aleatoria ni filtros, el
// puzle ya viene elegido por el hook. Función normal (no useCallback) porque
// depende de resetPuzzleState, que se recrea en cada render; mismo criterio que
// loadSinglePuzzle.
const loadRepasoPuzzle = (puzzle: Puzzle | null) => {
  if (!puzzle) return;
  setSolutionRevealed(false);
  resetLock();
  setIsBoardLocked(false);
  setEloFeedback(null);
  setMoveHistory([]);
  setCurrentPuzzle(puzzle);
  resetPuzzleState(puzzle, false, false, false, REPASO_FIRST_MOVE_MS);
};

const startRepasoSession = useCallback(async (order: RepasoOrder) => {
  repaso.closeStart();
  const first = await repaso.startSession(order);

  // La cola se vació entre abrir el modal y pulsar EMPEZAR (o el JOIN no
  // devolvió nada). Volvemos a puzles en vez de dejar el tablero muerto.
  if (!first) {
    setAppMode('puzzles');
    loadSinglePuzzle(db);
    return;
  }
  slidePuzzle(() => loadRepasoPuzzle(first));
}, [db, slidePuzzle]);

// Avanza al siguiente de la cola. Si no queda ninguno, el hook cierra la sesión
// y abre el modal de resultado; el tablero se queda con el último puzle detrás.
const handleNextRepasoPuzzle = useCallback(() => {
  const next = repaso.nextPuzzle();
  if (next) slidePuzzle(() => loadRepasoPuzzle(next));
}, [slidePuzzle]);

const handleExitRepaso = useCallback(() => {
  repaso.abortSession();
  setAppMode('puzzles');
  loadSinglePuzzle(db);
}, [db]);

// --- SE ACABÓ EL TIEMPO DE UN PUZLE (solo supervivencia) ---
// El hook ya ha descontado la vida y anotado el intento. Aquí solo queda el
// feedback y, si la partida sigue viva, traer el siguiente puzle.
const handleSurvivalTimeout = useCallback(({ nextRange, gameOver }: { nextRange: [number, number]; gameOver: boolean }) => {
  stopTimer(false);
  hapticError();
  playSound('error');
  setIsBoardLocked(true);
  clearSelection();
  setHintSquare(null);
  setHintMove(null);
  if (!gameOver) swapRunPuzzle(nextRange, CLOCK_TIMING.afterFail);
}, [swapRunPuzzle, stopTimer, playSound]);

useEffect(() => { survivalTimeoutRef.current = handleSurvivalTimeout; }, [handleSurvivalTimeout]);

// --- REPASO POST-PARTIDA ---
// Abre en el tablero el puzle de un intento de la partida ya terminada. Se
// trata como un puzle del historial (isHistory = true): pistas, solución,
// reintentar y análisis funcionan igual que en modo normal, pero no toca el ELO
// ni la cola de repaso.
const openRunAttempt = async (index: number) => {
  // Ya hay un puzle cargándose: el toque se ignora. Sin esto, cada toque lanza
  // su consulta y su jugada inicial retrasada, y acaban pisándose en el tablero.
  if (reviewLockRef.current) return;
  const attempt = runAttempts[index];
  if (!db || !attempt) return;

  // Se libera cuando runPuzzleToken supera este valor (el puzle ya es jugable)
  // y además ha pasado el mínimo. El temporizador es solo la red de seguridad.
  reviewLockRef.current = { token: runPuzzleToken, minUntil: Date.now() + PUZZLE_TIMING.reviewSwitchLock };
  setIsReviewSwitchLocked(true);
  reviewUnlockTimerRef.current = setTimeout(releaseReviewLock, PUZZLE_TIMING.reviewSwitchLockMax);

  const puzzle = await getPuzzleById(db, attempt.puzzleId);
  if (!puzzle) {
    console.warn('[REPASO PARTIDA] no se encontró el puzle', attempt.puzzleId);
    releaseReviewLock();
    return;
  }

  // resetPuzzleState no toca solutionRevealed: sin esto, revelar la solución de
  // un puzle escondería el botón en todos los siguientes del repaso.
  setSolutionRevealed(false);
  setReviewAttemptIndex(index);
  setCurrentPuzzle(puzzle);
  resetPuzzleState(puzzle, false, false, true);
};

// El puzle del repaso ya es jugable (su jugada inicial sube el token): se
// libera el cerrojo en cuanto se cumpla el tiempo mínimo.
useEffect(() => {
  const lock = reviewLockRef.current;
  if (!lock || runPuzzleToken <= lock.token) return;
  if (reviewUnlockTimerRef.current) clearTimeout(reviewUnlockTimerRef.current);
  reviewUnlockTimerRef.current = setTimeout(releaseReviewLock, Math.max(0, lock.minUntil - Date.now()));
}, [runPuzzleToken, releaseReviewLock]);

// Ref + callback estable: ClockProgressGrid es React.memo y un handler nuevo en
// cada render lo re-renderizaría entero durante la partida.
const openRunAttemptRef = useRef(openRunAttempt);
useEffect(() => { openRunAttemptRef.current = openRunAttempt; });
const stableOpenRunAttempt = useCallback((index: number) => {
  openRunAttemptRef.current(index);
}, []);

// Modo puzles: Next y Skip. En repaso el "siguiente" no es aleatorio: sale de
// la cola, así que se desvía a handleNextRepasoPuzzle. En el repaso
// post-partida recorre los puzles de la partida, de forma cíclica.
const handleNextPuzzle = useCallback(() => {
  if (isRunReview) {
    if (runAttempts.length === 0) return;
    stableOpenRunAttempt(((reviewAttemptIndex ?? 0) + 1) % runAttempts.length);
    return;
  }
  if (isNextDisabled) return;
  if (isRepasoMode) {
    handleNextRepasoPuzzle();
    return;
  }
  slidePuzzle(() => loadSinglePuzzle(db));
}, [db, isNextDisabled, isRepasoMode, handleNextRepasoPuzzle, slidePuzzle,
    isRunReview, reviewAttemptIndex, runAttempts.length, stableOpenRunAttempt]);

const streakSlotAnimatedStyle = useAnimatedStyle(() => ({
  height: STREAK_SLOT_HEIGHT * eloRowProgress.value,
  opacity: eloRowProgress.value,
}));

const handleEngineSequencePress = async (moves: string[]) => {
  if (!moves || moves.length === 0) return;

  // Si ya hay una secuencia en curso, ignoramos el nuevo clic en vez de
  // dejar que compita con la llamada anterior.
  if (activeSequenceRef.current !== null) return;

  // Tablero bloqueado desde YA (ref, síncrono) hasta que la última pieza llegue
  // a su casilla. Si alguien la cancela (salir del análisis, otro puzle), el id
  // deja de coincidir y el bucle se retira sin tocar nada más.
  const runId = ++sequenceCounterRef.current;
  activeSequenceRef.current = runId;
  const isCancelled = () => activeSequenceRef.current !== runId;
  setIsSequencePlaying(true);

  clearSelection(); // limpia casilla seleccionada y movimientos legales al instante, sin esperar a que termine la animación.
  setPromotionModalVisible(false);
  setPendingMove(null);

  // 0. Pausamos el motor mientras se reproduce la secuencia animada,
  // para que no reposicione ni busque en cada posición intermedia.
  analysisEngine.isSequencePlayingRef.current = true;
  await analysisEngine.pauseSearch();
  if (isCancelled()) return;

  // 1. Creamos copias locales del tablero y el índice actual.
  // Estas copias se irán actualizando en cada iteración del bucle,
  // esquivando el problema de que el estado de React no se actualice a tiempo.
  let localGame = new Chess(game.fen());
  let localViewIndex = viewIndex;

  for (let i = 0; i < moves.length; i++) {
    const uciMove = moves[i];
    if (!uciMove || uciMove.length < 4) continue;
    
    const from = uciMove.slice(0, 2) as Square;
    const to = uciMove.slice(2, 4) as Square;
    const promotion = uciMove.length === 5 ? uciMove[4] : 'q'; 
    
    // 2. Aplicamos el movimiento en nuestro motor local. chess.js 1.x LANZA
    // con una jugada ilegal (no devuelve null): sin el catch, la excepción
    // dejaría el tablero bloqueado para siempre. Tras una ilegal el resto de
    // la línea tampoco vale, así que se corta ahí.
    let move: Move | null = null;
    try {
      move = localGame.move({ from, to, promotion });
    } catch {
      move = null;
    }
    if (!move) break;
    
    const nextFen = localGame.fen();
    const isCapture = 'captured' in move;

    // 3. Feedback visual y sonoro (igual que en modo análisis)
    if (isCapture) {
      hapticImpact('heavy');
      playSound('capture');
    } else {
      hapticImpact('medium');
      playSound('move');
    }

    // 4. Movemos la identidad de la pieza para la animación (esto es síncrono)
    applyMoveIdentity(move);

    // 5. Actualizamos todos los estados de React basándonos en nuestras variables locales
    setLastMoveFrom(from);
    setLastMoveTo(to);
    
    setGame(new Chess(nextFen));
    syncPiecesFromGame(localGame);

    setMoveHistory(prev => {
      const truncated = prev.slice(0, localViewIndex);
      return [...truncated, move.san];
    });

    // Mantiene fenHistory en sincronía con viewIndex. Cortar en localViewIndex + 1
    // descarta cualquier rama "futura": si vuelves a "c" y juegas otra cosa,
    // "d" y "e" dejan de existir.
    setFenHistory(prev => {
      const truncated = prev.slice(0, localViewIndex + 1);
      return [...truncated, nextFen];
    });

    // 6. Incrementamos el índice local para el siguiente ciclo del bucle
    localViewIndex++;
    setViewIndex(localViewIndex);

    // 7. Pausa para dar tiempo a la animación de la pieza antes del siguiente movimiento
    if (i < moves.length - 1) {
      await new Promise(resolve => setTimeout(resolve, PUZZLE_TIMING.sequenceStep));
      if (isCancelled()) return;
    }
  }
  
  clearSelection();
  setIsReviewMode(false);

  // Reanudamos el análisis en la posición final (pausado en el paso 0), una sola vez
  analysisEngine.isSequencePlayingRef.current = false;
  
  if (analysisEngine.isAnalysisMode) {
    analysisEngine.holdOutput(PUZZLE_TIMING.engineOutputHold);
    analysisEngine.restartSearch(localGame.fen());
  }

  // El motor no espera (corre en la WebView), pero el tablero sí: la última
  // pieza sigue animándose `pieceMove` ms tras el setState.
  await new Promise(resolve => setTimeout(resolve, PUZZLE_TIMING.pieceMove));
  if (isCancelled()) return;
  activeSequenceRef.current = null;
  setIsSequencePlaying(false);
};

// Abrir un modal justo cuando otro se está cerrando parpadea en Android.
// Cerramos el menú y encolamos la apertura tras la animación de salida.
const openFromMenu = useCallback((open: () => void) => {
  setIsMenuVisible(false);
  setTimeout(open, 220);
}, []);

// El reloj no arranca al pulsar EMPEZAR, sino cuando el primer puzle ya es
// jugable: entre medias hay una consulta SQL y el movimiento de la máquina.
//
// Además, cada puzle que queda jugable se marca como pendiente (cuadrado gris)
// hasta que se conteste. presentPuzzle es idempotente por token.
useEffect(() => {
  if (!firstMoveDone || loading) return;
  if (clock.phase === 'arming') {
    clock.beginCountdown();
  }
  if (isClockMode && currentPuzzle && clock.phaseRef.current === 'running') {
    clock.presentPuzzle(runPuzzleToken, currentPuzzle.id, currentPuzzle.rating);
  }
}, [clock.phase, firstMoveDone, loading, isClockMode, runPuzzleToken]);

// Supervivencia: aquí no hay un reloj de partida sino uno POR PUZLE, así que
// este efecto se dispara en cada puzle nuevo, no solo en el primero. El tiempo
// muerto entre puzles (deslizamiento + SQL + jugada de la máquina) queda fuera
// de la cuenta a propósito. startPuzzleClock es idempotente por id: si el
// efecto se repite sin cambiar de puzle, no rearma nada.
useEffect(() => {
  if (!isSurvivalMode || !currentPuzzle) return;
  if (!firstMoveDone || loading) return;

  if (survival.phase === 'arming') {
    survival.beginRun(runPuzzleToken, currentPuzzle.id, currentPuzzle.rating);
  } else if (survival.phase === 'running') {
    survival.startPuzzleClock(runPuzzleToken, currentPuzzle.id, currentPuzzle.rating);
  }
}, [isSurvivalMode, survival.phase, firstMoveDone, loading, runPuzzleToken]);

useEffect(() => {
  if (firstMoveDone && db && !isRunMode) {
    prefetchNext(eloRange, selectedThemes);
  }
}, [firstMoveDone]);

// Precarga el primer puzle del escalón 0 mientras el usuario está en la
// pantalla de "Empezar" (eligiendo duración, mirando récords). Ese rato
// muerto es la ventana perfecta para tener el puzle listo antes de tocar
// EMPEZAR.
useEffect(() => {
  const isAnyStartVisible = clock.isStartVisible || survival.isStartVisible;
  if (!isAnyStartVisible || !db) return;
  // Ambos modos arrancan en el escalón 0, así que el puzle precargado sirve
  // para los dos.
  const range = getLadderRange(0);
  clockPrefetchRef.current = null; // por si quedó algo de una sesión anterior
  (async () => {
    const pick = await queryPuzzle(db, range, []);
    if (pick) clockPrefetchRef.current = { range, puzzle: pick.puzzle };
  })();
}, [clock.isStartVisible, survival.isStartVisible, db]);

// Carga el primer puzle de una partida, usando el precargado si el rango coincide.
const startRunWithRange = useCallback((range: [number, number]) => {
  setReviewAttemptIndex(null);   // partida nueva: se acabó el repaso de la anterior
  releaseReviewLock();
  const cached = clockPrefetchRef.current;

  if (cached && cached.range[0] === range[0] && cached.range[1] === range[1]) {
    clockPrefetchRef.current = null;
    setCurrentPuzzle(cached.puzzle);
    resetPuzzleState(cached.puzzle, false, false, false, CLOCK_TIMING.firstMove);
  } else {
    loadSinglePuzzle(db, range, [], { fast: true });
  }
}, [db]);

const handleStartClockRun = useCallback((ms: number) => {
  startRunWithRange(clock.armRun(ms));
}, [startRunWithRange]);

const handleStartSurvivalRun = useCallback((ms: number) => {
  startRunWithRange(survival.armRun(ms));
}, [startRunWithRange]);

const handleExitRun = useCallback(() => {
  setReviewAttemptIndex(null);
  releaseReviewLock();
  clock.abortRun();
  survival.abortRun();
  setAppMode('puzzles');
  loadSinglePuzzle(db);
}, [db]);

const handleSelectMode = useCallback((mode: AppMode) => {
  setIsMenuVisible(false);

  if (mode === appMode) {
    // Con una partida terminada, volver a elegir el mismo modo es "jugar otra
    // vez". Sin esto el menú no hace nada y parece roto.
    if (mode === 'clock' && clock.phase === 'finished') setTimeout(() => clock.openStart(), 220);
    if (mode === 'survival' && survival.phase === 'finished') setTimeout(() => survival.openStart(), 220);
    return;
  }

  setReviewAttemptIndex(null);
  setAppMode(mode);

  // 220ms: abrir un modal mientras el drawer se cierra parpadea en Android
  if (mode === 'clock') {
    survival.abortRun();
    repaso.abortSession();
    setTimeout(() => clock.openStart(), 220);
  } else if (mode === 'survival') {
    clock.abortRun();
    repaso.abortSession();
    setTimeout(() => survival.openStart(), 220);
  } else if (mode === 'repaso') {
    clock.abortRun();
    survival.abortRun();
    setTimeout(() => repaso.openStart(), 220);
  } else {
    clock.abortRun();
    survival.abortRun();
    repaso.abortSession();
    loadSinglePuzzle(db);
  }
}, [appMode, db, clock.phase, survival.phase]);

// Carga inicial de la base de datos y primer puzzle
useEffect(() => {
  let cancelled = false;
  async function setup() {
    const database = await openPuzzleDatabase();
    if (cancelled) return;
    setDb(database);

    let savedRange = eloRange;
    let savedThemes = selectedThemes;
    let restoredPuzzle: Puzzle | null = null;

    try {
      // multiGet, no cuatro getItem encadenados: cada getItem es un salto al
      // módulo nativo y estos cuatro estaban en serie dentro del arranque, antes
      // del primer frame útil.
      const [
        [, localRange],
        [, localThemes],
        [, localRecommended],
        [, localPuzzle],
      ] = await AsyncStorage.multiGet([
        '@elo_range',
        '@selected_themes',
        '@is_recommended_mode',
        '@current_puzzle',
      ]);

      // Lo que ya está en el almacén no se vuelve a escribir.
      if (localRange !== null) persistedPrefsRef.current['@elo_range'] = localRange;
      if (localThemes !== null) persistedPrefsRef.current['@selected_themes'] = localThemes;
      if (localRecommended !== null) persistedPrefsRef.current['@is_recommended_mode'] = localRecommended;

      if (localRange) {
        const parsedRange = JSON.parse(localRange);
        setEloRange(parsedRange);
        savedRange = parsedRange;
      }
      if (localThemes) {
        const parsedThemes = JSON.parse(localThemes);
        setSelectedThemes(parsedThemes);
        savedThemes = parsedThemes;
      }
      if (localRecommended) {
        setIsRecommendedMode(JSON.parse(localRecommended));
      }
      if (localPuzzle) {
        const parsed = JSON.parse(localPuzzle);
        // Un objeto a medias (escritura interrumpida, formato antiguo) reventaría
        // el tablero en el arranque: si no tiene la forma esperada, se ignora.
        if (parsed?.id && parsed?.fen && Array.isArray(parsed?.solution)) {
          restoredPuzzle = parsed as Puzzle;
        }
      }
    } catch (error) {
      console.error('Error al cargar los datos desde AsyncStorage:', error);
    }

    // A partir de aquí lo que haya en el estado ES lo guardado (o los defaults
    // si la lectura falló), así que los efectos de persistencia ya pueden
    // escribir sin riesgo de pisar la sesión anterior.
    hasRestoredPrefsRef.current = true;

    // Red de seguridad: versiones anteriores guardaban el puzle aunque ya
    // estuviera resuelto, así que al actualizar puede quedar uno viejo en el
    // almacén. Si ya aparece en elo_history es que ya puntuó y no se restaura:
    // hacerlo lo pondría a puntuar por segunda vez.
    if (restoredPuzzle) {
      const alreadyScored = await hasPuzzleBeenScored(database, restoredPuzzle.id)
        .catch(() => false);
      if (alreadyScored) {
        restoredPuzzle = null;
        await AsyncStorage.removeItem('@current_puzzle').catch(() => {});
      }
    }

    if (cancelled) return;

    // EVALUAMOS: ¿Tenía un puzle guardado?
    if (restoredPuzzle) {
      storedPuzzleIdRef.current = restoredPuzzle.id;
      // Inicializamos el estado visual sin forzar el movimiento automático corrupto
      resetPuzzleState(restoredPuzzle, true);
      setCurrentPuzzle(restoredPuzzle);
      setSolutionRevealed(false);
    } else {
      // Si no tenía ningún puzle guardado de antes, traemos uno nuevo de forma normal
      loadSinglePuzzle(database, savedRange, savedThemes);
    }
  }

  // Sin este .catch, cualquier excepción de openPuzzleDatabase deja una promesa
  // rechazada sin dueño: setDb no se llama nunca, hasBooted no se activa y el
  // usuario se queda mirando el splash para siempre.
  setup().catch((err: unknown) => {
    console.error('[BOOT] fallo en el arranque', err);
    // El splash lo esconde onRootLayout, que ya no se va a ejecutar: hay que
    // quitarlo a mano o la pantalla de error queda tapada.
    SplashScreen.hideAsync().catch(() => {});
    setBootError(err instanceof Error ? err : new Error(String(err)));
  });

  return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [bootAttempt]);

// --- CALLBACKS ESTABLES PARA EL PIE Y LA LISTA DE JUGADAS ---
// BoardControls y MoveList son React.memo, pero recibían funciones nuevas en
// cada render de App (que el React Compiler se salta por los eslint-disable),
// así que se re-renderizaban con cualquier cambio de estado de la pantalla.
// Mismo patrón que stableSquarePress: ref al día en cada commit y envoltorio de
// identidad fija. Se llama siempre a la versión del último render, igual que
// cuando se pasaban directamente.
const controlsRef = useRef({
  navigateHistory, handleMovePress, showSolution, startAnalysis,
  exitAnalysis, handleRetry, handleNextPuzzle, handleHint, handleEngineSequencePress,
});
useLayoutEffect(() => {
  controlsRef.current = {
    navigateHistory, handleMovePress, showSolution, startAnalysis,
    exitAnalysis, handleRetry, handleNextPuzzle, handleHint, handleEngineSequencePress,
  };
});
const stableNavigateHistory = useCallback((direction: 'prev' | 'next') => controlsRef.current.navigateHistory(direction), []);
const stableMovePress = useCallback((targetIndex: number) => controlsRef.current.handleMovePress(targetIndex), []);
const stableShowSolution = useCallback(() => { void controlsRef.current.showSolution(); }, []);
const stableStartAnalysis = useCallback(() => controlsRef.current.startAnalysis(), []);
const stableExitAnalysis = useCallback(() => controlsRef.current.exitAnalysis(), []);
const stableRetry = useCallback(() => { void controlsRef.current.handleRetry(); }, []);
const stableNextPuzzle = useCallback(() => controlsRef.current.handleNextPuzzle(), []);
const stableHint = useCallback(() => controlsRef.current.handleHint(), []);
const stableEngineSequencePress = useCallback((moves: string[]) => { void controlsRef.current.handleEngineSequencePress(moves); }, []);

// --- PRECARGA DEL MOTOR ---
// Cuando el puzle termina (✅ o ❌) aparece el botón de análisis: se arranca el
// motor en segundo plano para que, al pulsarlo, la evaluación salga al momento
// en vez de esperar a crear la WebView, compilar el wasm y hacer el handshake.
// Con un pequeño retraso para no coincidir con la animación de resultado (crear
// la WebView toca el hilo de UI). Solo ocurre una vez por sesión: luego el motor
// sigue vivo.
const canOfferAnalysis = !isRunPlaying && (message.includes('✅') || message.includes('❌'));
useEffect(() => {
  if (!canOfferAnalysis) return;
  const timer = setTimeout(analysisEngine.prewarm, PUZZLE_TIMING.enginePrewarm);
  return () => clearTimeout(timer);
}, [canOfferAnalysis, analysisEngine.prewarm]);

if (bootError) {
  return (
    <FatalErrorScreen
      error={bootError}
      onRetry={() => {
        setBootError(null);
        setBootAttempt(n => n + 1);
      }}
      onReset={async () => {
        await resetProgressDatabase(db);
        setDb(null);
        setBootError(null);
        setBootAttempt(n => n + 1);
      }}
    />
  );
}

return (
  <GestureHandlerRootView style={{ flex: 1 }}>
    <View style={styles.container} onLayout={onRootLayout}>
      <StatusBar barStyle="light-content" />

      {/* Fondo para deseleccionar piezas al tocar fuera */}
      <Pressable style={StyleSheet.absoluteFill} onPress={stableClearSelection} />

      <View style={[
        styles.mainWrapper,
        // Nunca menos que los paddings de siempre; más solo si la barra de estado
        // o la de navegación (3 botones, habitual en tablets) no caben en el aire
        // que ya dejan el header y el footer.
        {
          paddingTop: Math.max(40, responsive.insets.top - HEADER_MARGIN_TOP),
          paddingBottom: Math.max(10, responsive.insets.bottom - FOOTER_MARGIN_BOTTOM),
        },
      ]}>
          
      <View style={[styles.headerRow, { width: contentWidth * 0.95 }]}>
        {/* BOTÓN MENÚ (modos + análisis + ajustes) */}
        <TouchableOpacity style={[styles.menuBtn, sc.menuBtn]} 
          onPress={() => setIsMenuVisible(true)}
          accessibilityRole="button"
          accessibilityLabel={t.menu.title}
          >
          <Ionicons name="menu" size={sc.menuIcon} color={PALETTE.primary} />
        </TouchableOpacity>

        <View style={styles.headerSpacer} />

        {/* BOTÓN FILTROS */}
        {!isRunMode && !isRepasoMode && (
          <TouchableOpacity style={[styles.openFiltersBtn, sc.pillBtn]} 
            onPress={() => setIsFilterModalVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={t.puzzle.filters}
            accessibilityHint={ selectedThemes.length > 0 ? String(selectedThemes.length) : undefined
            }
            >
            <View style={styles.filterLeftGroup}>
              <Ionicons name="options-outline" size={sc.pillIcon} color={PALETTE.primary} />
              <Text style={[styles.openFiltersText, sc.pillText]}>{t.puzzle.filters}</Text>
            </View>

            {selectedThemes.length > 0 && (
              <View style={[styles.filterBadgeCount, sc.badge]}>
                <Text style={[styles.filterBadgeText, sc.badgeText]}>{selectedThemes.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* BOTÓN HISTORIAL */}
        {!isRunMode && !isRepasoMode && (
          <TouchableOpacity style={[styles.openFiltersBtn, sc.pillBtn]} onPress={() => openHistory()}>
            <View style={styles.filterLeftGroup}>
              <Ionicons name="stats-chart-outline" size={sc.pillIcon} color={PALETTE.primary} />
              <Text style={[styles.openFiltersText, sc.pillText]}>{t.puzzle.history}</Text>
            </View>
          </TouchableOpacity>              
        )}

        {/* PARTIDA TERMINADA: volver a abrir el resumen que se cerró */}
        {isRunFinished && (
          <TouchableOpacity
            style={[styles.openFiltersBtn, sc.pillBtn]}
            onPress={isSurvivalMode ? survival.openResult : clock.openResult}
          >
            <View style={styles.filterLeftGroup}>
              <Ionicons name="podium-outline" size={sc.pillIcon} color={PALETTE.primary} />
              <Text style={[styles.openFiltersText, sc.pillText]}>{t.puzzle.result}</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* PROGRESO DEL REPASO: ocupa el hueco de filtros + historial, que aquí
            no pintan nada porque la cola decide qué puzles ves */}
        {isRepasoMode && (
          <RepasoProgressPill
            current={repaso.position.current}
            total={repaso.position.total}
            onExit={handleExitRepaso}
          />
        )}
      </View>


      {/* ELO Global + evolución de la sesión (se colapsa en modo análisis) */}
      <Animated.View style={[styles.eloSessionRowOuter, { width: contentWidth * 0.95 }, eloRowAnimatedStyle]}>
        {isRunMode ? (
          <ClockProgressGrid
            attempts={runAttempts}
            interactive={isRunFinished}
            selectedIndex={reviewAttemptIndex}
            onSelectAttempt={stableOpenRunAttempt}
            disabled={isReviewSwitchLocked}
          />
        ) : (
          <>
            <View style={styles.eloSessionRow}>
              {hasBooted ? (
                <>
                  <EloBadge target={userRatings['global']} feedback={eloFeedback} />
                  <SessionEloSparkline data={sessionEloHistory} globalElo={userRatings['global'] || DEFAULT_ELO} />
                </>
              ) : (
                <>
                  <Skeleton width={90} height={50} radius={14} />
                  <Skeleton height={70} radius={14} style={{ flex: 1 }} />
                </>
              )}
            </View>

            <Animated.View style={[styles.streakSlot, streakSlotAnimatedStyle]}>
              {currentStreak >= 2 && <StreakBadge streak={currentStreak} />}
            </Animated.View>
          </>
        )}
      </Animated.View>

      <View
        ref={boardFit.outerRef}
        onLayout={boardFit.onFitLayout}
        collapsable={false}
        style={[styles.containerMainContent, isRunMode && styles.containerMainContentRun]}
      >
        {/* Envoltorio medible: su alto es lo que el contenido ocupa de verdad,
            frente al hueco disponible (el View de arriba). useBoardFit usa la
            diferencia para dimensionar el tablero. */}
        <View
          ref={boardFit.innerRef}
          onLayout={boardFit.onFitLayout}
          collapsable={false}
          style={styles.mainContentInner}
        >

        {/* 2. CRONÓMETRO + INDICADOR DE TURNO */}
        <View style={[styles.turnRow, { width: contentWidth * 0.98 }]}>
          <View style={styles.turnRowSide}>
            {/* Repasando una partida terminada no hay nada que cronometrar:
                ni la cuenta atrás (ya expiró) ni el crono del puzle. */}
            {isRunReview ? null : isClockMode ? (
              <CountdownTimer
                endsAt={clock.endsAt}
                durationMs={clock.durationMs}
                isFinished={clock.phase === 'finished'}
              />
            ) : isSurvivalMode ? (
              // Mismo componente, pero el deadline se rearma en cada puzle y los
              // umbrales de aviso son proporcionales al tiempo disponible.
              <CountdownTimer
                endsAt={survival.puzzleEndsAt}
                durationMs={survival.perPuzzleMs}
                isFinished={survival.phase === 'finished'}
                warnMs={survivalWarnMs(survival.perPuzzleMs)}
                dangerMs={survivalDangerMs(survival.perPuzzleMs)}
              />
            ) : (
              settings.isSettingsLoaded && settings.showTimer && (
                <PuzzleTimer runningSince={timerRunningSince} baseMs={timerBaseMs} frozenMs={solveElapsedMs} result={timerResult} />
              )
            )}
          </View>
          
          <View style={[styles.turnIndicatorFrame, sc.turnFrame]}>
            <View style={[
              styles.turnDot, 
              sc.turnDot,
              { 
                backgroundColor: playerColor === 'w' ? '#fff' : '#000',
                borderColor: '#555',
                borderWidth: playerColor === 'b' ? 1.5 : 0 
              }
            ]} />
            <Text style={[styles.turnText, sc.turnText]}>
              {playerColor === 'w' ? "WHITE TO MOVE" : "BLACK TO MOVE"}
            </Text>
          </View>

          {/* Columna fantasma: mantiene el pill exactamente centrado */}
          <View style={styles.turnRowSide} />
        </View>

          {/* 3. TABLERO DE AJEDREZ */}
          <View style={styles.boardSection}>
              <Animated.View
                style={[
                  styles.boardWrapper,
                  { width: responsive.width },
                  // Hasta la primera medición el tablero puede tener aún el tamaño
                  // "solo por ancho": en tablet no se debe ver ese salto.
                  !boardFit.isBoardFitReady && { opacity: 0 },
                  boardSlideStyle,
                ]}
                renderToHardwareTextureAndroid={isBoardSliding}
                shouldRasterizeIOS={isBoardSliding}
                collapsable={false}
              >
              <ChessBoard 
                pieces={pieces}
                onSquarePress={stableSquarePress} 
                onDragMove={stableDragMove}
                selectedSquare={selectedSquare} 
                legalMoves={legalMoves} 
                orientation={playerColor}
                hintSquare={isAtLastMove ? hintSquare : null} 
                hintMove={isAtLastMove ? hintMove : null}
                successSquare={successSquare}
                errorSquare={errorSquare}
                inCheck={boardStatus.inCheck}
                isMate={boardStatus.isMate}
                turn={boardStatus.turn}
                lastMoveFrom={lastMoveFrom}
                lastMoveTo={lastMoveTo}
                isAnalysisMode={analysisEngine.isAnalysisMode}
                engineOutput={analysisEngine.outputStore}
                showLegalMoves={settings.showLegalMoves}
                showCoordinates={settings.showCoordinates}
                moveDurationMs={isRunPlaying ? CLOCK_TIMING.pieceMove : PUZZLE_TIMING.pieceMove}
                size={boardFit.boardSize}
                positionKey={currentPuzzle?.id ?? null}
                inputLocked={isSequencePlaying}
                snapBackToken={snapBackToken}
              />
            </Animated.View>

            {/* Aviso en el hueco del tablero. Fuera del Animated.View: el tablero
                está desplazado fuera de pantalla y esto se queda en su sitio. */}
            {boardNotice && (
              <Animated.View
                entering={FadeIn.duration(200)}
                style={[styles.boardNotice, { width: boardFit.boardSize, height: boardFit.boardSize }]}
              >
                <Ionicons
                  name={boardNotice === 'exhausted' ? 'checkmark-done-circle-outline' : 'funnel-outline'}
                  size={sc.noticeIcon}
                  color={PALETTE.primary}
                />
                <Text style={[styles.boardNoticeTitle, sc.noticeTitle]}>
                  {boardNotice === 'exhausted' ? t.puzzle.allSolvedTitle : t.puzzle.noMatchTitle}
                </Text>
                <Text style={[styles.boardNoticeBody, sc.noticeBody]}>
                  {boardNotice === 'exhausted' ? t.puzzle.allSolvedBody : t.puzzle.noMatchBody}
                </Text>
                {!isRunMode && !isRepasoMode && (
                  <TouchableOpacity
                    style={[styles.openFiltersBtn, sc.pillBtn, styles.boardNoticeBtn]}
                    onPress={() => setIsFilterModalVisible(true)}
                    accessibilityRole="button"
                  >
                    <View style={styles.filterLeftGroup}>
                      <Ionicons name="options-outline" size={sc.pillIcon} color={PALETTE.primary} />
                      <Text style={[styles.openFiltersText, sc.pillText]}>{t.puzzle.changeFilters}</Text>
                    </View>
                  </TouchableOpacity>
                )}
                {boardNotice === 'exhausted' && !isRunMode && !isRepasoMode && (
                  <TouchableOpacity
                    style={[styles.openFiltersBtn, sc.pillBtn]}
                    // Solo activa el ajuste (queda guardado, se apaga desde
                    // Ajustes). La carga la hace el efecto de allowRepeats, que
                    // también cubre activarlo desde Ajustes con el aviso visible.
                    onPress={() => settings.setSetting('allowRepeats', true)}
                    accessibilityRole="button"
                  >
                    <View style={styles.filterLeftGroup}>
                      <Ionicons name="repeat" size={sc.pillIcon} color={PALETTE.primary} />
                      <Text style={[styles.openFiltersText, sc.pillText]}>{t.puzzle.allowRepeats}</Text>
                    </View>
                  </TouchableOpacity>
                )}
              </Animated.View>
            )}
          </View>
    
            {/* 3. ID PUZZLE · ELO (MINIMALISTA) */}
            <View style={[styles.puzzleMetaContainer, { width: contentWidth * 0.95 }]}>
              <View style={[styles.puzzleMetaRow, sc.metaRow]}>
                {hasBooted && currentPuzzle ? (
                  <>
                    <Text style={[styles.puzzleMetaText, sc.metaText]}>
                      #{String(currentPuzzle.id).toUpperCase()}
                    </Text>
                    <Text style={[styles.bulletSeparator, sc.metaBullet]}>·</Text>
                    <Text style={[styles.puzzleMetaText, sc.metaText]}>
                      PUZZLE ELO {currentPuzzle.rating}
                    </Text>
                    {showReplayTag && (
                      <View
                        style={[styles.replayTag, sc.replayTag]}
                        accessible
                        accessibilityLabel={t.puzzle.replayA11y}
                      >
                        <Ionicons name="repeat" size={sc.replayIcon} color={PALETTE.warning} />
                        <Text style={[styles.replayTagText, sc.replayText]}>{t.puzzle.replayTag}</Text>
                      </View>
                    )}
                  </>
                ) : boardNotice ? null : (
                  <>
                    <Skeleton width={70} height={12} />
                    <View style={{ width: 20 }} />
                    <Skeleton width={120} height={12} />
                  </>
                )}
              </View>
            </View>

            {/* 4. ÁREA DINÁMICA: HISTORIAL SAN o MULTI-PV */}
            <Animated.View style={[styles.moveListWrapper, { width: contentWidth * 0.98 }, analysisEngine.isAnalysisMode && styles.multiPvWrapper, moveListWrapperAnimatedStyle]}>
              {isRunPlaying ? (
                // Sin entering/exiting: el modo no cambia a mitad de partida y una animación
                // anidada bloquearía el exiting del padre
                <ClockScoreBar
                  solved={isSurvivalMode ? survival.solved : clock.solved}
                  failed={isSurvivalMode ? survival.failed : clock.failed}
                  lives={isSurvivalMode ? survival.lives : undefined}
                  maxLives={survival.maxLives}
                />
              ) : !analysisEngine.isAnalysisMode ? (
                <Animated.View key="move-history" entering={FadeIn.duration(200).delay(120)} exiting={FadeOut.duration(120)} style={{ flex: 1, justifyContent: 'center' }}>
                  <MoveList moveHistory={moveHistory} viewIndex={viewIndex} onMovePress={stableMovePress} />
                </Animated.View>
              ) : (
                <Animated.View key="multi-pv" entering={FadeIn.duration(200).delay(120)} exiting={FadeOut.duration(120)} style={styles.analysisLinesContainer}>
                  <AnalysisLines
                    engineOutput={analysisEngine.outputStore}
                    onSequencePress={stableEngineSequencePress}
                    placeholderHeight={MULTI_PV_HEIGHT - 20}/>
                </Animated.View>
              )}
            </Animated.View>

        </View>
        </View>

        {isRunPlaying ? (
          <View style={styles.clockFooterSpacer} />
        ) : (
          <BoardControls
            viewIndex={viewIndex}
            fenHistoryLength={fenHistory.length}
            onNavigate={stableNavigateHistory}
            message={message}
            isAnalysisMode={analysisEngine.isAnalysisMode}
            solutionRevealed={solutionRevealed}
            onShowSolution={stableShowSolution}
            onStartAnalysis={stableStartAnalysis}
            onExitAnalysis={stableExitAnalysis}
            onRetry={stableRetry}
            onNextPuzzle={stableNextPuzzle}
            onHint={stableHint}
            isNextDisabled={isNextDisabled || (isRunReview && isReviewSwitchLocked)}
            width={contentWidth}
          />
        )}

      </View>

    {/* --- MODALES --- */}

    <MainMenuModal
      visible={isMenuVisible}
      onClose={() => setIsMenuVisible(false)}
      currentMode={appMode}
      onSelectMode={handleSelectMode}
      onOpenStats={() => openFromMenu(openStats)}
      onOpenSupport={() => openFromMenu(() => setIsSupportModalVisible(true))}
      onOpenSettings={() => openFromMenu(() => setIsSettingsModalVisible(true))}
      onOpenFeedback={() => openFromMenu(() => setIsFeedbackModalVisible(true))}
      repasoCount={repaso.stats.count}
    />

    <FilterModal
      visible={isFilterModalVisible}
      onClose={() => setIsFilterModalVisible(false)}
      db={db}
      currentEloRange={eloRange}
      currentSelectedThemes={selectedThemes}
      currentIsRecommendedMode={isRecommendedMode}
      globalElo={userRatings['global'] || DEFAULT_ELO}
      onApply={(newRange, newThemes, newRecommendedMode) => {
        setEloRange(newRange);
        setSelectedThemes(newThemes);
        setIsRecommendedMode(newRecommendedMode);
        setIsFilterModalVisible(false);
        loadSinglePuzzle(db, newRange, newThemes, { recommended: newRecommendedMode });
      }}
    />

    <FeedbackModal
      visible={isFeedbackModalVisible}
      onClose={() => setIsFeedbackModalVisible(false)}
      context={{
        locale,
        mode: appMode,
        elo: userRatings['global'] ?? DEFAULT_ELO,
        // El puzle en pantalla es justo el que el usuario quiere reportar
        // cuando elige "puzle incorrecto"; sin el id, el aviso no es accionable.
        puzzleId: currentPuzzle?.id ?? null,
      }}
    />

    <SettingsModal
      visible={isSettingsModalVisible}
      onClose={() => setIsSettingsModalVisible(false)}
      onPreviewSound={() => playSound('move')}
    />
        
    <HistoryModal
      visible={isHistoryModalVisible}
      onClose={closeHistory}
      globalElo={userRatings['global'] || DEFAULT_ELO}
      eloHistoryData={eloHistoryData}
      recentPuzzles={recentPuzzles}
      isHistoryListReady={isHistoryListReady}
      isChartReady={isChartReady}
      selectedHistoryItem={selectedHistoryItem}
      onSelectPuzzle={selectHistoryPuzzle}
    />

    <StatsModal
        visible={isStatsVisible}
        onClose={closeStats}
        stats={stats}
        isLoading={isStatsLoading}
        range={statsRange}
        onChangeRange={setStatsRange}
        currentStreak={currentStreak}
      />

    <PromotionModal
      visible={promotionModalVisible}
      playerColor={playerColor}
      getPieceImage={getPromotionPieceImage}
      onSelect={(piece) => pendingMove && executeMove(pendingMove.from, pendingMove.to, piece)}
      onCancel={() => {
        setPromotionModalVisible(false);
        setPendingMove(null);
        clearSelection();
        syncPiecesFromGame(game);
        setSnapBackToken(t => t + 1);
      }}
    />

    <SupportModal
      visible={isSupportModalVisible}
      onClose={() => {
        setIsSupportModalVisible(false);
        // Reseteamos con retardo para que no se vea el cambio de texto
        // mientras el modal se está cerrando.
        setTimeout(donations.resetStatus, 400);
      }}
      products={donations.products}
      status={donations.status}
      isAvailable={donations.isAvailable}
      connected={donations.connected}
      onDonate={donations.donate}
    />

    <RunStartModal
      visible={clock.isStartVisible}
      db={db}
      kind="clock"
      icon="timer-outline"
      title={t.run.clockTitle}
      subtitle={t.run.clockSubtitle}
      options={CLOCK_DURATIONS}
      defaultMs={DEFAULT_CLOCK_DURATION_MS}
      onClose={() => { clock.closeStart(); if (clock.phase === 'idle') setAppMode('puzzles'); }}
      onStart={handleStartClockRun}
    />

    <RunResultModal
      visible={clock.isResultVisible}
      kind="clock"
      summary={clock.summary}
      ranking={clock.ranking}
      onClose={clock.closeResult}
      onPlayAgain={() => { clock.closeResult(); handleStartClockRun(clock.durationMs); }}
      onExit={() => { clock.closeResult(); handleExitRun(); }}
    />

    <RunStartModal
      visible={survival.isStartVisible}
      db={db}
      kind="survival"
      icon="skull-outline"
      title={t.run.survivalTitle}
      subtitle={t.run.survivalSubtitle}
      options={SURVIVAL_SPEEDS}
      defaultMs={DEFAULT_SURVIVAL_MS}
      optionsLabel="TIEMPO POR PUZLE"
      onClose={() => { survival.closeStart(); if (survival.phase === 'idle') setAppMode('puzzles'); }}
      onStart={handleStartSurvivalRun}
    />

    <RunResultModal
      visible={survival.isResultVisible}
      kind="survival"
      summary={survival.summary}
      ranking={survival.ranking}
      onClose={survival.closeResult}
      onPlayAgain={() => { survival.closeResult(); handleStartSurvivalRun(survival.perPuzzleMs); }}
      onExit={() => { survival.closeResult(); handleExitRun(); }}
    />

    <RepasoStartModal
      visible={repaso.isStartVisible}
      stats={repaso.stats}
      isPreparing={repaso.isPreparing}
      onClose={() => { repaso.closeStart(); if (repaso.phase === 'idle') setAppMode('puzzles'); }}
      onStart={startRepasoSession}
    />

    <RepasoResultModal
      visible={repaso.isResultVisible}
      summary={repaso.summary}
      remaining={repaso.stats.count}
      onReviewAgain={() => { repaso.closeResult(); repaso.openStart(); }}
      onExit={() => { repaso.closeResult(); handleExitRepaso(); }}
    />

    {/* El motor se monta la primera vez que se pide (precarga o análisis) y ya
        no se desmonta: salir de análisis lo para, no lo destruye. */}
    <View style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}>
      {analysisEngine.StockfishWebView}
    </View>
  </View>
</GestureHandlerRootView>
);
}

const styles = StyleSheet.create({
// --- CONTENEDORES PRINCIPALES ---
container: { flex: 1, backgroundColor: PALETTE.background },
mainWrapper: { flex: 1, paddingTop: 40, paddingBottom: 10, alignItems: 'center' },
containerMainContent: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', marginTop: MAIN_CONTENT_MARGIN_TOP, marginBottom: MAIN_CONTENT_MARGIN_BOTTOM },
containerMainContentRun: { marginTop: MAIN_CONTENT_MARGIN_TOP_RUN },
mainContentInner: { width: '100%', alignItems: 'center' },

  // --- CABECERA Y META-DATA ---
headerRow: { flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', gap: 10, alignSelf: 'center', marginTop: HEADER_MARGIN_TOP, marginBottom: 15, paddingHorizontal: 5 },
headerLeftGroup: { flexDirection: 'row', alignItems: 'center', },
supportBtn: { marginLeft: 8, marginRight: 4, flexDirection: 'row', alignItems: 'center', backgroundColor: PALETTE.surface, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: PALETTE.surfaceLight },
openFiltersBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: PALETTE.surface, paddingVertical: 10, paddingHorizontal: 15, borderRadius: 12, borderWidth: 1, borderColor: PALETTE.surfaceLight },
filterLeftGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
iconBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: PALETTE.surface, borderRadius: 12, borderWidth: 1, borderColor: PALETTE.surfaceLight },
menuBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginLeft: -6, marginRight: 2 },
openFiltersText: { color: PALETTE.primary, fontWeight: '800', fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase' },
filterBadgeCount: { backgroundColor: PALETTE.primary, minWidth: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center', marginLeft: 10, paddingHorizontal: 3 },
filterBadgeText: { color: PALETTE.surface, fontSize: 10, fontWeight: 'bold' },
puzzleMetaContainer: { marginTop: 1, marginBottom: 1, alignItems: 'center' },
puzzleMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 40 },
puzzleMetaText: { color: PALETTE.primary, fontSize: 13, fontWeight: '700', letterSpacing: 1.5, alignSelf: 'center', textAlign: 'center' },
bulletSeparator: { color: PALETTE.primary, fontSize: 34, paddingHorizontal: 8 },
minimalTag: { backgroundColor: PALETTE.tagBg, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: PALETTE.tagBorder },
headerSpacer: { flex: 1 },

// --- INDICADOR DE TURNO
turnIndicatorFrame: { flexDirection: 'row', alignItems: 'center', backgroundColor: PALETTE.surface, paddingVertical: 6, paddingHorizontal: 20, borderRadius: 25, borderWidth: 1, borderColor: PALETTE.surfaceLight, elevation: 4 },
turnDot: { width: 14, height: 14, borderRadius: 7, marginRight: 12 },
turnText: { color: PALETTE.accent, fontSize: 13, fontWeight: '800', letterSpacing: 1.2 },
turnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 10 },
turnRowSide: { flex: 1, alignItems: 'flex-end', paddingRight: 8 },

// --- SECCIÓN DEL TABLERO ---
boardSection: { width: '100%', alignItems: 'center', overflow: 'hidden' },
boardNotice: { position: 'absolute', top: 0, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
boardNoticeTitle: { color: PALETTE.accent, fontWeight: '800', letterSpacing: 0.5, textAlign: 'center' },
boardNoticeBody: { color: PALETTE.primary, textAlign: 'center' },
boardNoticeBtn: { marginTop: 8 },
// Ámbar = "esto no puntúa". Mismo patrón de pastilla que minimalTag.
replayTag: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(217, 119, 6, 0.12)', borderWidth: 1, borderColor: 'rgba(217, 119, 6, 0.45)' },
replayTagText: { color: PALETTE.warning, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
boardWrapper: { borderWidth: 0, borderColor: PALETTE.surface, borderRadius: 4, elevation: 0, shadowColor: '#000000', alignItems: 'center' },

// --- CONTROLES DE NAVEGACIÓN Y ACCIÓN ---
multiPvWrapper: { paddingVertical: 10, justifyContent: 'flex-start', backgroundColor: 'transparent', borderWidth: 0, borderRadius: 0, },
analysisLinesContainer: { width: '100%', alignItems: 'center', gap: 1, justifyContent: 'flex-start', },
streakSlot: { width: '100%', alignItems: 'center', justifyContent: 'flex-start', overflow: 'hidden' },

// --- MODAL DE FILTROS ---
moveListWrapper: { height: 40, backgroundColor: PALETTE.surface, borderRadius: 8, marginTop: 1, marginBottom: 2, justifyContent: 'center', borderWidth: 1, borderColor: PALETTE.surfaceLight },
eloSessionRowOuter: { alignSelf: 'center', overflow: 'hidden' },
eloSessionRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },

// --- MODO CONTRARELOJ ---
clockFooterSpacer: { height: 69, marginTop: 'auto', marginBottom: FOOTER_MARGIN_BOTTOM },
});