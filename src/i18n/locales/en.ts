import type { Dictionary } from '../index';

// Tipado contra la forma de es.ts. Si falta una clave o cambia una firma,
// `npx tsc --noEmit` lo canta aquí antes de llegar al dispositivo.
export const en: Dictionary = {
  common: {
    save: 'SAVE',
    cancel: 'CANCEL',
    apply: 'APPLY',
    reset: 'Reset',
    close: 'Close',
    retry: 'Retry',
    next: 'Next',
    error: 'The operation could not be completed.',
  },

  menu: {
    title: 'MENU',
    modes: 'MODES',
    other: 'OTHER',
    modePuzzles: 'Puzzle mode',
    modeClock: 'Time attack',
    modeSurvival: 'Survival',
    modeRepaso: 'Review',
    stats: 'Statistics',
    settings: 'Settings',
    donations: 'Donations',
  },

  settings: {
    title: 'SETTINGS',
    sectionSound: 'SOUND',
    sectionHaptics: 'HAPTICS',
    sectionBoard: 'BOARD',
    sectionEngine: 'ENGINE (STOCKFISH)',
    sectionLanguage: 'LANGUAGE',

    soundEffects: 'Sound effects',
    volume: 'Volume',

    haptics: 'Vibration',
    hapticsHint: 'Feedback on moves, captures, hits and misses',

    timer: 'Timer',
    timerHint: 'Time is still tracked even when hidden',
    legalMoves: 'Legal moves',
    legalMovesHint: 'Highlights the legal moves of the selected piece',

    depth: 'Analysis depth',
    depthHint: 'Higher depth means better moves, but slower and more battery',
    depthFast: 'FAST',
    depthNormal: 'NORMAL',
    depthDeep: 'DEEP',

    multipv: 'Analysis lines',
    multipvHint: 'Variations the engine shows at once',

    language: 'App language',
    languageHint: 'Tactical theme names change too',
    languageSystem: 'System',
  },

  stats: {
    title: 'STATISTICS',
    accuracy: 'ACCURACY',
    attempts: 'ATTEMPTS',
    solved: 'SOLVED',
    failed: 'MISSED',
    puzzlesSolved: 'PUZZLES SOLVED',
    eloGained: 'ELO GAINED / LOST',
    eloAvgSolved: 'AVG ELO SOLVED',
    eloMax: 'PEAK ELO',
    eloMin: 'MIN ELO',
    eloAvg: 'AVG ELO',
    avgOnSolved: 'AVG ON SOLVED',
    avgOnFailed: 'AVG ON MISSED',
    eloAuto: 'Auto ELO',
    eloManual: 'Manual ELO',
    activeDays: 'ACTIVE DAYS',
    dayStreak: 'DAY STREAK',
    bestDay: 'BEST DAY',
    bestStreak: 'BEST STREAK',
    noData: 'No puzzles solved yet',
    noActivity: 'No activity in this period',

    lastNDays: (n: number) => `last ${n} days`,
    bestTheme: (name: string) => `Best theme: ${name}`,
    worstTheme: (name: string) => `Weakest theme: ${name}`,

    puzzleCount: (n: number) => (n === 1 ? '1 puzzle' : `${n} puzzles`),

    periodToday: 'TODAY',
    period30d: '30D',
    periodAll: 'ALL',
    periodWeek: 'THIS WEEK',
  },

  puzzle: {
    hint: 'Hint',
    solution: 'Solution',
    skip: 'Skip',
    nextPuzzle: 'Next puzzle',
    analysis: 'ANALYSIS',
    exitAnalysis: 'Exit analysis',
    promotion: 'PROMOTION',
    currentRating: 'Current rating:',
    globalElo: 'Global ELO',
  },

  filters: {
    title: 'FILTERS',
    themesTitle: 'TACTICAL THEMES',
    dynamicLevel: 'Dynamic level based on your current progress',
  },

  run: {
    start: 'START',
    playAgain: 'PLAY AGAIN',
    result: 'RESULT',
    record: 'RECORD',
    newRecord: 'NEW RECORD',
    bestOfWeek: 'BEST OF THE WEEK',
    games: 'GAMES',
    survived: 'YOU SURVIVED',
  },

  repaso: {
    title: 'REVIEW',
    review: 'REVIEW PUZZLES',
    finished: 'REVIEW COMPLETE',
    keepGoing: 'KEEP REVIEWING',
    emptyQueue: 'QUEUE EMPTY',
    failed: 'MISSED',
  },

  support: {
    title: 'SUPPORT THE APP',
  },

  themes: {
    '1': 'Fork',
    '8': 'Mate',
    '9': 'Deflection',
    '10': 'Advanced Pawn',
    '11': 'Sacrifice',
    '12': 'Attraction',
    '13': 'Middlegame',
    '14': 'Endgame',
    '15': 'Discovered Attack',
    '16': 'Defensive Move',
    '17': 'Exposed King',
    '18': 'Skewer',
    '21': 'Discovered Check',
    '22': 'Pin',
    '23': 'Zugzwang',
    '24': 'Opening',
    '25': 'Hanging Piece',
    '32': 'Pawn Endgame',
    '33': 'Bishop Endgame',
    '34': 'Knight Endgame',
    '35': 'Rook Endgame',
    '36': 'Interference',
    '37': 'Promotion',
    '38': 'Intermezzo',
    '39': 'Double Check',
    '40': 'Queen Endgame',
    '45': 'Remove the Defender',
    '47': 'X-Ray',
  },

  themeCategories: {
    attack: 'ATTACK',
    basicTactics: 'BASIC TACTICS',
    advancedTactics: 'ADVANCED TACTICS',
    endgames: 'ENDGAMES',
    phases: 'GAME PHASES',
  },
};
