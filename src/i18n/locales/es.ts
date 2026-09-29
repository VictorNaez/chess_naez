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
    // Decimal con el separador del idioma (coma en todos salvo inglés).
    decimal: (n: number, digits: number) => n.toFixed(digits).replace('.', ','),
    save: 'GUARDAR',
    cancel: 'CANCELAR',
    apply: 'APLICAR',
    reset: 'Restablecer',
    close: 'Cerrar',
    preparing: 'Preparando los puzles…',
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
    privacy: 'Política de privacidad',
    donations: 'Donaciones',
    feedback: 'Contacto y sugerencias',
    analysisSection: 'ANÁLISIS',
  },

  feedback: {
    title: 'CONTACTO',
    subtitle: 'Escríbeme. Leo todos los correos, y trato de responderlos a todos.',
    pickCategory: '¿DE QUÉ SE TRATA?',
    categories: {
      bug: 'Fallo',
      suggestion: 'Sugerencia',
      puzzle: 'Puzle incorrecto',
      translation: 'Traducción',
    },
    diagnosticsNote: 'Estos datos se añadirán al final del correo para poder reproducir el problema.',
    diagnosticsTitle: 'Datos técnicos (bórralos si no quieres enviarlos):',
    bodyIntro: 'Escribe aquí tu mensaje:',
    send: 'ABRIR MI CORREO',
    noMailApp: 'No se ha encontrado ninguna app de correo. Escríbeme a:',
    close: 'CERRAR',
  },

  settings: {
    title: 'AJUSTES',
    sectionSound: 'SONIDO',
    sectionHaptics: 'VIBRACIÓN',
    sectionBoard: 'TABLERO',
    sectionEngine: 'MOTOR (STOCKFISH)',
    sectionLanguage: 'IDIOMA',
    sectionPuzzles: 'PUZLES',

    soundEffects: 'Efectos de sonido',
    volume: 'Volumen',

    haptics: 'Vibración',
    hapticsHint: 'Feedback al mover, capturar, acertar o fallar',

    timer: 'Cronómetro',
    timerHint: 'Muestra el tiempo que llevas en el puzle actual',
    legalMoves: 'Movimientos legales',
    legalMovesHint: 'Muestra los movimientos legales de la pieza seleccionada',
    coordinates: 'Muestra las coordenadas del tablero',
    coordinatesHint: 'Muestra las letras (A - H) y números (1 - 8) en los bordes',

    allowRepeats: 'Puzle repetido',
    allowRepeatsHint: 'Permite repetir puzles ya resueltos. No suman ni restan ELO.',

    depth: 'Profundidad de análisis',
    depthHint: 'A mayor profundidad, mejores jugadas, pero es más lento y gasta más batería',
    depthFast: 'RÁPIDO',
    depthNormal: 'NORMAL',
    depthDeep: 'PROFUNDO',

    multipv: 'Líneas de análisis',
    multipvHint: 'Variantes que muestra el motor a la vez',

    language: 'Idioma de la aplicación',
    languageSystem: 'Sistema',
  },

  cloud: {
    signedOutHint: 'Conéctate para que tu ELO, tu historial y tus estadísticas sobrevivan a un cambio de móvil o a una reinstalación.',
    statusConnected: 'Conectado a Play Games',
    connectedHint: 'Sincronizado con Play Games',
    statusDisconnected: 'Progreso sin guardar en la nube',
    connectPlayGames: 'CONECTAR CON PLAY GAMES',
    playGamesNote: 'La sesión y los datos guardados se gestionan desde la app de Play Games.',
    restore: 'RESTAURAR',
    summary: (elo: number, puzzles: number) => `ELO ${elo} · ${puzzles} puzles`,
    promptSignInTitle: 'No pierdas tu progreso',
    promptSignInBody: (puzzles: number) =>
      `Llevas ${puzzles} puzles resueltos. Conéctate a Play Games y tu ELO y tus estadísticas quedarán a salvo, aunque cambies de móvil o reinstales.`,
    promptSignInBodyFresh: 'Conéctate a Play Games y tu ELO, tu historial y tus estadísticas quedarán guardados solos. Si ya jugabas antes en otro dispositivo, recuperarás tu progreso ahora mismo.',
    promptRestoreTitle: 'Hay una copia más avanzada',
    promptRestoreBody: (remote: string) =>
      `En tu cuenta hay una copia por delante de este dispositivo:\n${remote}\n\n¿Quieres traerla? El progreso de aquí se sustituirá.`,
    promptLater: 'Ahora no',
    errors: {
      auth: 'Tu sesión de Play Games ha caducado. Vuelve a conectarte.',
      network: 'Sin conexión con Play Games.',
      noBackup: 'No hay ninguna copia guardada en esta cuenta.',
      invalid: 'La copia descargada está dañada: no se ha tocado tu progreso.',
      tooBig: 'El progreso ha crecido más de lo que admite la copia de Play Games.',
      unknown: 'No se ha podido completar la sincronización.',
    },
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
    allSolvedTitle: 'Todos resueltos',
    allSolvedBody: 'Ya has resuelto todos los puzles que cumplen estos filtros. ¿Quieres cambiarlos?',
    changeFilters: 'Cambiar filtros',
    allowRepeats: 'Permitir puzles repetidos',
    replayTag: 'Puzle repetido',
    replayA11y: 'Puzle repetido: no suma ni resta ELO',
    noMatchTitle: 'Ningún puzle encontrado',
    noMatchBody: 'Ningún puzle cumple estos filtros. Prueba a cambiarlos.',
    whiteToMove: 'JUEGAN BLANCAS',
    blackToMove: 'JUEGAN NEGRAS',
    puzzleElo: 'ELO DEL PUZLE',
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
    noneAvailable: 'Sin puzles disponibles',
    reset: 'Restablecer filtros',
    availableCount: (n: number) => `${n} ${n === 1 ? 'puzle' : 'puzles'}`,
    solvedCount: (s: number) => `(${s} ${s === 1 ? 'resuelto' : 'resueltos'})`,
    // Filtro de puntos débiles. El interruptor comparte fila con el título de
    // temas: corto en todos los idiomas.
    weakFocus: 'PUNTOS DÉBILES',
    weakFocusHint: 'Centrado en los temas que más te cuestan: cuanto más fallas uno, más a menudo sale.',
    weakFocusNoData: 'Aún no hay datos suficientes. Resuelve más puzles para que podamos detectar tus puntos débiles.',
    weakGainA11y: (theme: string, from: string, to: string) => `${theme}: tu precisión sube de ${from} a ${to}`,
    weakLossA11y: (theme: string, from: string, to: string) => `${theme}: tu precisión baja de ${from} a ${to}`,
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
    clockSubtitle: 'Resuelve tantos puzles como puedas.',
    survivalTitle: 'MODO SUPERVIVENCIA',
    survivalSubtitle: 'Resuelve tantos puzles como puedas. Cada fallo te quita una vida.',
    outOfLives: 'TE QUEDASTE SIN VIDAS',
    timeUp: 'SE ACABÓ EL TIEMPO',
  },

  repaso: {
    title: 'REPASO',
    review: 'REVISAR PUZLES',
    finished: 'REPASO TERMINADO',
    keepGoing: 'SEGUIR REPASANDO',
    emptyQueue: '¡TODOS LOS PUZLES REPASADOS!',
    failed: 'FALLADOS',
    reviewed: 'REPASADOS',
    skipped: 'SALTADOS',
    remaining: 'QUEDAN',
    time: 'TIEMPO',
    order: 'ORDEN',
    backToPuzzles: 'VOLVER A PUZLES',
    reasonSolution: 'SOLUCIÓN',
    reasonHint: 'PISTA',
    intro: 'Los puzles que fallaste o resolviste con ayuda. Si lo aciertas sale de la lista; si no, se queda.',
    introEmpty: 'Aquí se guardan solos los puzles que falles o en los que pidas ayuda. Todavía no hay ninguno.',
    orderOldest: 'ANTIGUOS',
    orderRandom: 'ALEATORIO',
    orderHardest: 'DIFÍCILES',
    loading: 'CARGANDO…',
    footClean: 'No te queda nada pendiente. Los próximos fallos volverán a llenar la cola.',
    footPending: 'Los que fallaste siguen ahí y saldrán los últimos la próxima vez.',
    pending: (n: number): string => (n === 1 ? 'PUZLE PENDIENTE' : 'PUZLES PENDIENTES'),
    cleared: (n: number): string => (n === 1 ? 'PUZLE SUPERADO' : 'PUZLES SUPERADOS'),
    // Antigüedad del puzle más viejo de la cola (null = cola vacía).
    oldest: (days: number | null) => {
      if (days === null) return '';
      if (days <= 0) return 'El más antiguo entró hoy';
      if (days === 1) return 'El más antiguo entró ayer';
      if (days < 30) return `El más antiguo entró hace ${days} días`;
      const months = Math.floor(days / 30);
      return months === 1 ? 'El más antiguo entró hace 1 mes' : `El más antiguo entró hace ${months} meses`;
    },
  },

  support: {
    title: 'APOYA EL PROYECTO',
    thanks: 'Muchisimas gracias! Tu apoyo ayuda a seguir mejorando la app.',
    subtitle: 'Hola! Soy Víctor, un aficionado de ajedrez que ha hecho esta aplicación para dar a todo el mundo acceso a una plataforma de puzzles de ajedrez totalmente gratuita y sin anuncios de ningún tipo. \n \n Cualquier ayuda es totalmente opcional, pero ayudarás a que el proyecto siga adelante  \n \n ¡Te estaré infinitamente agradecido!',
    unavailable: 'Los pagos no están disponibles ahora mismo. Inténtalo más tarde.',
    close: 'CERRAR',
    notNow: 'AHORA NO',
  },

  // Nombres de temas tácticos, indexados por la clave OFICIAL de Lichess
  // (THEME_VOCAB en data/themeBits.ts), que es lo que persiste en
  // elo_history.theme / user_progress.theme_id. Nunca traduzcas la clave, solo
  // el valor. Antes seguían indexados por los ids numéricos del catálogo v2 y
  // ninguna clave coincidía: todos los temas salían en inglés (THEME_LABEL_EN)
  // en los seis idiomas. Están los 64 que expone CHESS_THEMES.
  themes: {
    opening: 'Apertura',
    middlegame: 'Medio Juego',
    endgame: 'Final',
    oneMove: 'Una Jugada',
    short: 'Puzle Corto',
    long: 'Puzle Largo',
    veryLong: 'Puzle Muy Largo',
    mate: 'Mate',
    crushing: 'Aplastante',
    advantage: 'Ventaja',
    equality: 'Igualdad',
    fork: 'Ataque doble',
    pin: 'Pin',
    skewer: 'Skewer',
    hangingPiece: 'Pieza Colgante',
    discoveredAttack: 'Ataque Descubierto',
    discoveredCheck: 'Jaque Descubierto',
    doubleCheck: 'Doble Jaque',
    capturingDefender: 'Eliminar Defensor',
    xRayAttack: 'Rayos X',
    trappedPiece: 'Pieza Atrapada',
    deflection: 'Desviación',
    attraction: 'Atracción',
    interference: 'Interferencia',
    clearance: 'Despeje',
    intermezzo: 'Intermezzo',
    defensiveMove: 'Jugada Defensiva',
    quietMove: 'Jugada Tranquila',
    sacrifice: 'Sacrificio',
    zugzwang: 'Zugzwang',
    exposedKing: 'Rey Expuesto',
    kingsideAttack: 'Ataque en el Flanco de Rey',
    queensideAttack: 'Ataque en el Flanco de Dama',
    attackingF2F7: 'Ataque a f2 o f7',
    advancedPawn: 'Peón Avanzado',
    promotion: 'Promoción',
    underPromotion: 'Subpromoción',
    enPassant: 'Captura al Paso',
    castling: 'Enroque',
    pawnEndgame: 'Final de Peones',
    knightEndgame: 'Final de Caballos',
    bishopEndgame: 'Final de Alfiles',
    rookEndgame: 'Final de Torres',
    queenEndgame: 'Final de Damas',
    queenRookEndgame: 'Final de Dama y Torre',
    backRankMate: 'Mate en la Última Fila',
    smotheredMate: 'Mate Ahogado',
    anastasiaMate: 'Mate de Anastasia',
    arabianMate: 'Mate Árabe',
    bodenMate: 'Mate de Boden',
    operaMate: 'Mate de la Ópera',
    epauletteMate: 'Mate de las Charreteras',
    dovetailMate: 'Mate Cola de Milano',
    hookMate: 'Mate del Gancho',
    killBoxMate: 'Mate de la Caja',
    cornerMate: 'Mate en la Esquina',
    doubleBishopMate: 'Mate de los Dos Alfiles',
    blindSwineMate: 'Mate de los Cerdos Ciegos',
    morphysMate: 'Mate de Morphy',
    pillsburysMate: 'Mate de Pillsbury',
    swallowstailMate: 'Mate Cola de Golondrina',
    triangleMate: 'Mate del Triángulo',
    vukovicMate: 'Mate de Vuković',
    balestraMate: 'Mate Balestra',
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
    pawns: 'PEONES Y REGLAS',
    matePatterns: 'PATRONES DE MATE',
    goal: 'OBJETIVO',
    length: 'LONGITUD',
  },

  fatal: {
    title: 'No se pudo iniciar',
    body: 'Chess Naez no ha podido abrir tus datos. Casi siempre se arregla reintentando.',
    retry: 'REINTENTAR',
    resetTitle: 'Si sigue fallando',
    resetBody: 'Puedes borrar los datos de progreso. Perderás tu ELO, tu historial y tu cola de repaso, pero la app volverá a funcionar. Los puzles no se tocan.',
    reset: 'Borrar progreso',
    resetConfirm: 'Se borrarán tu ELO, tu historial y tu cola de repaso. No se puede deshacer.',
    cancel: 'Cancelar',
    crashTitle: 'Algo ha fallado',
    crashBody: 'Se ha producido un error inesperado. Puedes volver a intentarlo.',
    details: 'Detalles técnicos',
  },
};
