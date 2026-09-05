export interface ChessTheme {
  id: string;
  name: string;
  category: string;
}

// --- TEMAS ACTIVOS Y AGRUPADOS ---
export const CHESS_THEMES: ChessTheme[] = [
  // GRUPO 1: ATAQUE AL REY (MATES)
  { id: "8", name: "Mate", category: "Ataque" },
  { id: "17", name: "Rey Expuesto", category: "Ataque" },
  { id: "39", name: "Doble Jaque", category: "Ataque" },
  { id: "21", name: "Jaque Descubierto", category: "Ataque" },
  { id: "15", name: "Ataque Descubierto", category: "Ataque" },

  // GRUPO 2: TÁCTICA FUNDAMENTAL
  { id: "1", name: "Fork", category: "Táctica Fundamental" },
  { id: "22", name: "Pin", category: "Táctica Fundamental" },
  { id: "18", name: "Skewer", category: "Táctica Fundamental" },
  { id: "25", name: "Pieza Colgante", category: "Táctica Fundamental" },
  { id: "47", name: "Rayos X", category: "Táctica Fundamental" },
  { id: "38", name: "Intermezzo", category: "Táctica Fundamental" },

  // GRUPO 3: MANIOBRAS AVANZADAS
  { id: "9", name: "Desviación", category: "Táctica Avanzada" },
  { id: "12", name: "Atracción", category: "Táctica Avanzada" },
  { id: "36", name: "Interferencia", category: "Táctica Avanzada" },
  { id: "45", name: "Eliminar Defensor", category: "Táctica Avanzada" },
  //{ id: "27", name: "Al Paso", category: "Táctica Avanzada" },
  { id: "16", name: "Jugada Defensiva", category: "Táctica Avanzada" },
  { id: "11", name: "Sacrificio", category: "Táctica Avanzada" },

  // GRUPO 4: FINALES
  { id: "10", name: "Peón Avanzado", category: "Finales" },
  { id: "37", name: "Promoción", category: "Finales" },
  { id: "23", name: "Zugzwang", category: "Finales" },
  { id: "32", name: "Final de Peones", category: "Finales" },
  { id: "33", name: "Final de Alfiles", category: "Finales" },
  { id: "34", name: "Final de Caballos" , category: "Finales" },
  { id: "35", name: "Final de Torres", category: "Finales" },
  { id: "40", name: "Final de Reina", category: "Finales" },

  // GRUPO 5: FASES DEL JUEGO
  { id: "24", name: "Apertura", category: "Fases" },
  { id: "13", name: "Medio Juego", category: "Fases" },
  { id: "14", name: "Final", category: "Fases" },
];

/* --- TEMAS DESCARTADOS O ELIMINADOS ---
  Estos temas fueron omitidos para mejorar la UX y la legibilidad del gráfico Radar.

  // MATES DEMASIADO LARGOS (Poco prácticos para móvil / Agrupados en Ataque)
  // { id: "2", name: "Mate en 1" },
  // { id: "3", name: "Mate en 2" },
  // { id: "4", name: "Mate en 3" },
  // { id: "5", name: "Mate in 4" },
  // { id: "6", name: "Mate in 5" },
  // { id: "7", name: "Mate in 6" },

  // DUPLICADOS O REDUNDANTES
  // { id: "26", name: "Discovered check" }, -> Ya existe el ID 21

  // METADATOS DE LONGITUD (No son temas tácticos/habilidades)
  // { id: "28", name: "One move" },
  // { id: "29", name: "Short" },
  // { id: "30", name: "Long" },
  // { id: "31", name: "Very long" },

  // TEMAS MUY ESPECÍFICOS (Difíciles de agrupar o poco comunes)
  // { id: "19", name: "Kingside attack" }, -> Agrupado conceptualmente en "Ataque"
  // { id: "20", name: "Queenside attack" }, -> Agrupado conceptualmente en "Ataque"
  // { id: "??", name: "Knight endgame" }, -> Simplificado a Finales generales
*/

export const RADAR_CATEGORIES = [
  { id: "Ataque", name: "ATAQUE" },
  { id: "Táctica Fundamental", name: "TÁCTICA FUNDAMENTAL" },
  { id: "Táctica Avanzada", name: "TÁCTICA AVANZADA" },
  { id: "Finales", name: "FINALES" },
  { id: "Fases", name: "FASES" },
];