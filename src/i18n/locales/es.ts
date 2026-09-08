// ---------------------------------------------------------------------------
// ESPAÑOL — FUENTE DE VERDAD
//
// Este fichero define la FORMA del diccionario. El resto de idiomas se tipan
// contra él (`Dictionary = typeof es`), así que si añades una clave aquí y no
// la traduces en en.ts, `npx tsc --noEmit` falla. No hay claves huérfanas.
//
// Las cadenas con variables son FUNCIONES, no plantillas con {{placeholders}}:
// TypeScript comprueba los argumentos y cada idioma puede reordenar o pluralizar
// a su manera sin tocar el call site.
// ---------------------------------------------------------------------------

export const es = {
  common: {
    save: 'GUARDAR',
    cancel: 'CANCELAR',
    apply: 'APLICAR',
    reset: 'Restablecer',
    close: 'Cerrar',
    retry: 'Reintentar',
    next: 'Siguiente',
    error: 'No se pudo completar la operación.',
    back: 'Volver',
    backToPuzzles: 'Volver a puzles',
    soon: 'PRONTO',
    total: 'TOTAL',
  },

  menu: {
    title: 'MENÚ',
    modes: 'MODOS',
    other: 'OTROS',
    modePuzzles: 'Modo puzles',
    modeClock: 'Modo contrarreloj',
    modeSurvival: 'Modo Supervivencia',
    modeRepaso: 'Repaso',
    stats: 'Estadísticas',
    settings: 'Ajustes',
    donations: 'Donaciones',
    analysisSection: 'ANÁLISIS',
  },

  settings: {
    title: 'AJUSTES',
    sectionSound: 'SONIDO',
    sectionHaptics: 'VIBRACIÓN',
    sectionBoard: 'TABLERO',
    sectionEngine: 'MOTOR (STOCKFISH)',
    sectionLanguage: 'IDIOMA',

    soundEffects: 'Efectos de sonido',
    volume: 'Volumen',

    haptics: 'Vibración',
    hapticsHint: 'Feedback al mover, capturar, acertar o fallar',

    timer: 'Cronómetro',
    timerHint: 'El tiempo se sigue registrando aunque lo ocultes',
    legalMoves: 'Movimientos legales',
    legalMovesHint: 'Muestra los movimientos legales de la pieza seleccionada',
    coordinates: 'Muestra las coordenadas del tablero',
    coordinatesHint: 'Muestra las letras (a - h) y números (1 - 8) en los bordes',

    depth: 'Profundidad de análisis',
    depthHint: 'A mayor profundidad, mejores jugadas pero más lento y más batería',
    depthFast: 'RÁPIDO',
    depthNormal: 'NORMAL',
    depthDeep: 'PROFUNDO',

    multipv: 'Líneas de análisis',
    multipvHint: 'Variantes que muestra el motor a la vez',

    language: 'Idioma de la aplicación',
    languageSystem: 'Sistema',
  },

  stats: {
    title: 'ESTADÍSTICAS',
    accuracy: 'PRECISIÓN',
    attempts: 'INTENTOS',
    solved: 'ACIERTOS',
    failed: 'FALLOS',
    puzzlesSolved: 'PUZLES RESUELTOS',
    eloGained: 'ELO GANADO / PERDIDO',
    eloAvgSolved: 'ELO MEDIO RESUELTO',
    eloMax: 'ELO MÁXIMO',
    eloMin: 'ELO MÍN',
    eloAvg: 'ELO MEDIO',
    avgOnSolved: 'MEDIA EN ACIERTOS',
    avgOnFailed: 'MEDIA EN FALLOS',
    eloAuto: 'ELO automático',
    eloManual: 'ELO manual',
    activeDays: 'DÍAS ACTIVOS',
    dayStreak: 'RACHA DE DÍAS',
    bestDay: 'MEJOR DÍA',
    bestStreak: 'MEJOR RACHA',
    noData: 'Todavía no has resuelto ningún puzle',
    noActivity: 'Sin actividad en este periodo',
    noActivity_data: 'Aún no hay datos',
    tryWiderTimeInterval: 'Prueba con un rango de tiempo más amplio.',

    // Interpolación tipada: el call site pasa un número, no un objeto suelto.
    lastNDays: (n: number) => `últimos ${n} días`,
    bestTheme: (name: string) => `Mejor tema: ${name}`,
    worstTheme: (name: string) => `Peor tema: ${name}`,

    // Plural explícito. En inglés esta misma clave añade la "s"; el call site
    // no tiene que saber nada de reglas de plural.
    puzzleCount: (n: number) => (n === 1 ? '1 puzle' : `${n} puzles`),

    periodToday: 'HOY',
    period30d: '30D',
    periodAll: 'TODO',
    periodWeek: 'ESTA SEMANA',

    totalTime: 'TIEMPO TOTAL',
    currentStreak: 'RACHA ACTUAL',
    fastest: 'MÁS RÁPIDO',
    puzzlesPerHour: 'PUZLES / HORA',
    hardestPuzzle: 'PUZLE MÁS DIFÍCIL',
    sectionByType: 'ACIERTOS POR TIPO DE PUZLE',
    sectionSolveTime: 'TIEMPO DE RESOLUCIÓN',
    sectionByDifficulty: 'ACIERTOS POR DIFICULTAD',
    sectionByTheme: 'POR TEMA TÁCTICO',
    sectionOtherModes: 'OTROS MODOS DE JUEGO',
    sectionActivity: 'ACTIVIDAD',
    emptyDifficulty: 'Necesitas más intentos para desglosar por dificultad.',
    emptyThemes: 'Todavía no has jugado ningún tema en este periodo.',
    tableClock: 'CONTRARRELOJ',
    tableSurvival: 'SUPERVIVENCIA',
    tableGames: 'PARTIDAS',
  },

  puzzle: {
    hint: 'Pista',
    solution: 'Solución',
    skip: 'Saltar',
    nextPuzzle: 'Siguiente puzle',
    analysis: 'ANÁLISIS',
    exitAnalysis: 'Salir del análisis',
    promotion: 'CORONACIÓN',
    currentRating: 'ELO actual:',
    globalElo: 'ELO global',
    analyze: 'Analizar',
    solved: 'ACIERTOS',
    failed: 'FALLOS',
    lives: 'VIDAS',
    filters: 'FILTROS',
    history: 'HISTORIAL',
    result: 'RESULTADO',
    currentRatingLabel: 'ELO actual:',
    noActivityPeriod: 'Sin actividad en este periodo',
    noPuzzlesYet: 'Todavía no has resuelto ningún puzle',
  },

  // Pestañas de rango temporal de la gráfica del historial.
  historyRanges: {
    all: 'TODO',
    year: '1A',
    month: '30D',
    week: '7D',
    today: 'HOY',
  },

  filters: {
    title: 'FILTROS',
    themesTitle: 'TEMAS TÁCTICOS',
    dynamicLevel: 'Nivel dinámico basado en tu progreso actual',
  },

  run: {
    start: 'EMPEZAR',
    playAgain: 'JUGAR OTRA VEZ',
    result: 'RESULTADO',
    record: 'RÉCORD',
    newRecord: 'NUEVO RÉCORD',
    bestOfWeek: 'MEJOR DE LA SEMANA',
    games: 'PARTIDAS',
    survived: 'AGUANTASTE',
    avgTime: 'T. MEDIO',
    clockTitle: 'MODO CONTRARRELOJ',
    clockSubtitle: 'Empiezas fácil. Cada acierto sube el nivel. Un fallo no te baja, pero te cuesta tiempo.',
    survivalTitle: 'MODO SUPERVIVENCIA',
    survivalSubtitle: 'Tres vidas. Cada puzle tiene el mismo tiempo y cada acierto sube el nivel. Fallar o quedarte sin tiempo cuesta una vida.',
  },

  repaso: {
    title: 'REPASO',
    review: 'REVISAR PUZLES',
    finished: 'REPASO TERMINADO',
    keepGoing: 'SEGUIR REPASANDO',
    emptyQueue: 'COLA VACÍA',
    failed: 'FALLADOS',
    reviewed: 'REPASADOS',
    skipped: 'SALTADOS',
    remaining: 'QUEDAN',
    time: 'TIEMPO',
    order: 'ORDEN',
    backToPuzzles: 'VOLVER A PUZLES',
    reasonSolution: 'SOLUCIÓN',
    reasonHint: 'PISTA',
  },

  support: {
    title: 'APOYA LA APP',
    thanks: '¡Gracias de verdad! Tu apoyo ayuda a seguir mejorando la app.',
    subtitle: 'Esta app es gratuita y sin anuncios. Si te resulta útil, puedes apoyar su desarrollo. No desbloquea ninguna función extra: es solo un gesto.',
    unavailable: 'Los pagos no están disponibles ahora mismo. Inténtalo más tarde.',
    close: 'CERRAR',
    notNow: 'AHORA NO',
  },

  // Nombres de temas tácticos, indexados por el MISMO id numérico que guarda
  // la columna `themes` de la base de datos. Nunca traduzcas la clave, solo el
  // valor: el id es lo que persiste en SQLite.
  themes: {
    '1': 'Ataque doble',
    '8': 'Mate',
    '9': 'Desviación',
    '10': 'Peón Avanzado',
    '11': 'Sacrificio',
    '12': 'Atracción',
    '13': 'Medio Juego',
    '14': 'Final',
    '15': 'Ataque Descubierto',
    '16': 'Jugada Defensiva',
    '17': 'Rey Expuesto',
    '18': 'Skewer',
    '21': 'Jaque Descubierto',
    '22': 'Pin',
    '23': 'Zugzwang',
    '24': 'Apertura',
    '25': 'Pieza Colgante',
    '32': 'Final de Peones',
    '33': 'Final de Alfiles',
    '34': 'Final de Caballos',
    '35': 'Final de Torres',
    '36': 'Interferencia',
    '37': 'Promoción',
    '38': 'Intermezzo',
    '39': 'Doble Jaque',
    '40': 'Final de Damas',
    '45': 'Eliminar Defensor',
    '47': 'Rayos X',
  },

  // Categorías del radar. La clave es un id ESTABLE en inglés; antes el
  // agrupamiento se hacía comparando la cadena visible ("Ataque"), lo que se
  // rompería en cuanto la traduzcas.
  themeCategories: {
    attack: 'ATAQUE',
    basicTactics: 'TÁCTICA FUNDAMENTAL',
    advancedTactics: 'TÁCTICA AVANZADA',
    endgames: 'FINALES',
    phases: 'FASES',
  },
};
