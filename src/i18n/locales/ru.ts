import type { Dictionary } from '../index';

// ---------------------------------------------------------------------------
// РУССКИЙ
//
// Tipado contra la forma de es.ts. Si falta una clave o cambia una firma,
// `npx tsc --noEmit` lo canta aquí antes de llegar al dispositivo.
//
// El ruso tiene TRES formas de plural (1 задача / 2 задачи / 5 задач), no dos.
// Por eso las cadenas con número son funciones: aquí abajo va la regla real,
// y el call site sigue pasando solo un número sin enterarse de nada.
// ---------------------------------------------------------------------------

/** Elige entre las tres formas rusas: one / few / many. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export const ru: Dictionary = {
  common: {
    save: 'СОХРАНИТЬ',
    cancel: 'ОТМЕНА',
    apply: 'ПРИМЕНИТЬ',
    reset: 'Сбросить',
    close: 'Закрыть',
    retry: 'Повторить',
    next: 'Далее',
    error: 'Не удалось выполнить операцию.',
    back: 'Назад',
    backToPuzzles: 'К задачам',
    soon: 'СКОРО',
    total: 'ВСЕГО',
  },

  menu: {
    title: 'МЕНЮ',
    modes: 'РЕЖИМЫ',
    other: 'ПРОЧЕЕ',
    modePuzzles: 'Режим задач',
    modeClock: 'На время',
    modeSurvival: 'Выживание',
    modeRepaso: 'Повторение',
    stats: 'Статистика',
    settings: 'Настройки',
    donations: 'Поддержать',
    analysisSection: 'АНАЛИЗ',
  },

  settings: {
    title: 'НАСТРОЙКИ',
    sectionSound: 'ЗВУК',
    sectionHaptics: 'ВИБРАЦИЯ',
    sectionBoard: 'ДОСКА',
    sectionEngine: 'ДВИЖОК (STOCKFISH)',
    sectionLanguage: 'ЯЗЫК',

    soundEffects: 'Звуковые эффекты',
    volume: 'Громкость',

    haptics: 'Вибрация',
    hapticsHint: 'Отклик при ходе, взятии, решении и ошибке',

    timer: 'Таймер',
    timerHint: 'Время записывается, даже если таймер скрыт',
    legalMoves: 'Возможные ходы',
    legalMovesHint: 'Показывать возможные ходы выбранной фигуры',
    coordinates: 'Координаты доски',
    coordinatesHint: 'Показывать буквы (a - h) и числа (1 - 8) на краях',

    depth: 'Глубина анализа',
    depthHint: 'Больше глубина — точнее ходы, но медленнее и больше расход батареи',
    depthFast: 'БЫСТРО',
    depthNormal: 'ОБЫЧНО',
    depthDeep: 'ГЛУБОКО',

    multipv: 'Линии анализа',
    multipvHint: 'Сколько вариантов движок показывает одновременно',

    language: 'Язык приложения',
    languageSystem: 'Системный',
  },

  stats: {
    title: 'СТАТИСТИКА',
    accuracy: 'ТОЧНОСТЬ',
    attempts: 'ПОПЫТКИ',
    solved: 'РЕШЕНО',
    failed: 'ОШИБКИ',
    puzzlesSolved: 'РЕШЕНО ЗАДАЧ',
    eloGained: 'ELO ПРИРОСТ / ПОТЕРЯ',
    eloAvgSolved: 'СРЕДНИЙ ELO РЕШЁННЫХ',
    eloMax: 'МАКС. ELO',
    eloMin: 'МИН. ELO',
    eloAvg: 'СРЕДНИЙ ELO',
    avgOnSolved: 'СРЕДНЕЕ ПРИ РЕШЕНИИ',
    avgOnFailed: 'СРЕДНЕЕ ПРИ ОШИБКЕ',
    eloAuto: 'ELO автоматический',
    eloManual: 'ELO вручную',
    activeDays: 'АКТИВНЫХ ДНЕЙ',
    dayStreak: 'СЕРИЯ ДНЕЙ',
    bestDay: 'ЛУЧШИЙ ДЕНЬ',
    bestStreak: 'ЛУЧШАЯ СЕРИЯ',
    noData: 'Вы ещё не решили ни одной задачи',
    noActivity: 'Нет активности за этот период',
    noActivity_data: 'Данных пока нет',
    tryWiderTimeInterval: 'Попробуйте более широкий период.',

    lastNDays: (n: number) =>
      `последние ${n} ${plural(n, 'день', 'дня', 'дней')}`,
    bestTheme: (name: string) => `Лучшая тема: ${name}`,
    worstTheme: (name: string) => `Худшая тема: ${name}`,

    puzzleCount: (n: number) =>
      `${n} ${plural(n, 'задача', 'задачи', 'задач')}`,

    periodToday: 'СЕГОДНЯ',
    period30d: '30Д',
    periodAll: 'ВСЁ',
    periodWeek: 'ЭТА НЕДЕЛЯ',

    totalTime: 'ОБЩЕЕ ВРЕМЯ',
    currentStreak: 'ТЕКУЩАЯ СЕРИЯ',
    fastest: 'БЫСТРЕЕ ВСЕГО',
    puzzlesPerHour: 'ЗАДАЧ / ЧАС',
    hardestPuzzle: 'САМАЯ СЛОЖНАЯ',
    sectionByType: 'РЕШЕНО ПО ТИПУ ЗАДАЧИ',
    sectionSolveTime: 'ВРЕМЯ РЕШЕНИЯ',
    sectionByDifficulty: 'РЕШЕНО ПО СЛОЖНОСТИ',
    sectionByTheme: 'ПО ТАКТИЧЕСКОЙ ТЕМЕ',
    sectionOtherModes: 'ДРУГИЕ РЕЖИМЫ ИГРЫ',
    sectionActivity: 'АКТИВНОСТЬ',
    emptyDifficulty: 'Нужно больше попыток, чтобы разбить по сложности.',
    emptyThemes: 'За этот период вы не играли ни одной темы.',
    tableClock: 'НА ВРЕМЯ',
    tableSurvival: 'ВЫЖИВАНИЕ',
    tableGames: 'ПАРТИИ',
  },

  puzzle: {
    hint: 'Подсказка',
    solution: 'Решение',
    skip: 'Пропустить',
    nextPuzzle: 'Следующая задача',
    analysis: 'АНАЛИЗ',
    exitAnalysis: 'Выйти из анализа',
    promotion: 'ПРЕВРАЩЕНИЕ',
    currentRating: 'Текущий ELO:',
    globalElo: 'Общий ELO',
    analyze: 'Анализ',
    solved: 'РЕШЕНО',
    failed: 'ОШИБКИ',
    lives: 'ЖИЗНИ',
    filters: 'ФИЛЬТРЫ',
    history: 'ИСТОРИЯ',
    result: 'РЕЗУЛЬТАТ',
    currentRatingLabel: 'Текущий ELO:',
    noActivityPeriod: 'Нет активности за этот период',
    noPuzzlesYet: 'Вы ещё не решили ни одной задачи',
  },

  historyRanges: {
    all: 'ВСЁ',
    year: '1Г',
    month: '30Д',
    week: '7Д',
    today: 'СЕГОДНЯ',
  },

  filters: {
    title: 'ФИЛЬТРЫ',
    themesTitle: 'ТАКТИЧЕСКИЕ ТЕМЫ',
    dynamicLevel: 'Динамический уровень по вашему текущему прогрессу',
  },

  run: {
    start: 'НАЧАТЬ',
    playAgain: 'ЕЩЁ РАЗ',
    result: 'РЕЗУЛЬТАТ',
    record: 'РЕКОРД',
    newRecord: 'НОВЫЙ РЕКОРД',
    bestOfWeek: 'ЛУЧШЕЕ ЗА НЕДЕЛЮ',
    games: 'ПАРТИИ',
    survived: 'ВЫ ПРОДЕРЖАЛИСЬ',
    avgTime: 'СР. ВРЕМЯ',
    clockTitle: 'НА ВРЕМЯ',
    clockSubtitle: 'Начинаете с лёгкого. Каждое решение поднимает уровень. Ошибка его не снижает, но стоит времени.',
    survivalTitle: 'РЕЖИМ ВЫЖИВАНИЯ',
    survivalSubtitle: 'Три жизни. На каждую задачу одно и то же время, каждое решение поднимает уровень. Ошибка или просроченное время стоят жизни.',
  },

  repaso: {
    title: 'ПОВТОРЕНИЕ',
    review: 'ПОВТОРИТЬ ЗАДАЧИ',
    finished: 'ПОВТОРЕНИЕ ЗАВЕРШЕНО',
    keepGoing: 'ПРОДОЛЖИТЬ',
    emptyQueue: 'ОЧЕРЕДЬ ПУСТА',
    failed: 'С ОШИБКОЙ',
    reviewed: 'ПОВТОРЕНО',
    skipped: 'ПРОПУЩЕНО',
    remaining: 'ОСТАЛОСЬ',
    time: 'ВРЕМЯ',
    order: 'ПОРЯДОК',
    backToPuzzles: 'К ЗАДАЧАМ',
    reasonSolution: 'РЕШЕНИЕ',
    reasonHint: 'ПОДСКАЗКА',
  },

  support: {
    title: 'ПОДДЕРЖАТЬ ПРИЛОЖЕНИЕ',
    thanks: 'Огромное спасибо! Ваша поддержка помогает делать приложение лучше.',
    subtitle: 'Приложение бесплатное и без рекламы. Если оно вам полезно, вы можете поддержать разработку. Это не открывает никаких дополнительных функций — просто жест.',
    unavailable: 'Платежи сейчас недоступны. Попробуйте позже.',
    close: 'ЗАКРЫТЬ',
    notNow: 'НЕ СЕЙЧАС',
  },

  themes: {
    '1': 'Вилка',
    '8': 'Мат',
    '9': 'Отвлечение',
    '10': 'Продвинутая пешка',
    '11': 'Жертва',
    '12': 'Завлечение',
    '13': 'Миттельшпиль',
    '14': 'Эндшпиль',
    '15': 'Вскрытое нападение',
    '16': 'Защитный ход',
    '17': 'Открытый король',
    '18': 'Сквозное нападение',
    '21': 'Вскрытый шах',
    '22': 'Связка',
    '23': 'Цугцванг',
    '24': 'Дебют',
    '25': 'Висящая фигура',
    '32': 'Пешечный эндшпиль',
    '33': 'Слоновый эндшпиль',
    '34': 'Коневой эндшпиль',
    '35': 'Ладейный эндшпиль',
    '36': 'Перекрытие',
    '37': 'Превращение',
    '38': 'Промежуточный ход',
    '39': 'Двойной шах',
    '40': 'Ферзевый эндшпиль',
    '45': 'Уничтожение защитника',
    '47': 'Рентген',
  },

  themeCategories: {
    attack: 'АТАКА',
    basicTactics: 'БАЗОВАЯ ТАКТИКА',
    advancedTactics: 'СЛОЖНАЯ ТАКТИКА',
    endgames: 'ЭНДШПИЛИ',
    phases: 'СТАДИИ',
  },
};
