import { Chess } from 'chess.js';
import type { PieceItem } from '../components/ChessBoard';

// Mapa vivo casilla -> ID persistente de la pieza que hay en ella.
// Vive a nivel de módulo (no es estado de React) a propósito: solo determina
// qué ID recibe cada pieza al reconstruir `pieces`, nunca se lee en el render,
// así que no necesita disparar ningún re-render por sí mismo.
let pieceIdentityMap: Record<string, string> = {};

let seedEpoch = 0;

export const seedIdentityMap = (chessGame: Chess): void => {
  seedEpoch += 1;                        // ← nuevo
  const nextMap: Record<string, string> = {};
  chessGame.board().forEach((row, rIdx) => {
    row.forEach((cell, cIdx) => {
      if (cell) {
        const sq = String.fromCharCode(97 + cIdx) + (8 - rIdx);
        nextMap[sq] = `${cell.type}-${cell.color}-${sq}-${seedEpoch}`;  // ← sufijo
      }
    });
  });
  pieceIdentityMap = nextMap;
};

// Mueve la identidad de una pieza de una casilla a otra (movimiento normal
// o rebobinado manual en handleRetry).
export const moveIdentity = (from: string, to: string): void => {
  const id = pieceIdentityMap[from];
  if (id) {
    // Si hay una pieza en el destino (captura), eliminamos su ID antiguo
    delete pieceIdentityMap[to];
    // Movemos el ID de la pieza que se mueve a la nueva casilla
    pieceIdentityMap[to] = id;
    // Limpiamos la casilla de origen
    delete pieceIdentityMap[from];
  }
};

// Construye el array de PieceItem a partir de una posición, asignando un ID
// nuevo a cualquier pieza que no tenga uno todavía (ej. coronación).
export const buildPieceItems = (chessGame: Chess): PieceItem[] => {
  const newPieces: PieceItem[] = [];
  chessGame.board().forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      if (cell) {
        const square = String.fromCharCode(97 + colIndex) + (8 - rowIndex);

        // Si por alguna razón la pieza no está en el mapa (ej. coronación), le damos uno
        if (!pieceIdentityMap[square]) {
          pieceIdentityMap[square] = `${cell.type}-${cell.color}-${Math.random().toString(36).substring(2, 11)}`;
        }

        newPieces.push({
          id: pieceIdentityMap[square], // ID persistente
          type: cell.type,
          color: cell.color,
          square: square,
        });
      }
    });
  });
  return newPieces;
};

// Recalcula pieceIdentityMap para una posición destino, preservando la identidad
// de las piezas que no cambian de tipo/color respecto al mapa actual. Sin esto,
// las piezas "parpadean" en vez de deslizar al saltar a otro punto del historial.
export const remapIdentitiesToFen = (targetFen: string): Chess => {
  const targetGame = new Chess(targetFen);
  const targetBoard = targetGame.board();
  const nextMap: Record<string, string> = {};

  // Registro de IDs del mapa anterior ya reutilizados, para no asignar
  // el mismo ID a dos piezas distintas en el nuevo estado.
  const usedOldKeys = new Set<string>();

  // PASO A: prioridad absoluta — piezas que NO se han movido de su casilla
  targetBoard.forEach((row, rIdx) => {
    row.forEach((cell, cIdx) => {
      if (cell) {
        const sq = String.fromCharCode(97 + cIdx) + (8 - rIdx);
        const oldId = pieceIdentityMap[sq];
        const pieceTypeColor = `${cell.type}-${cell.color}`;

        if (oldId && oldId.startsWith(pieceTypeColor)) {
          nextMap[sq] = oldId;
          usedOldKeys.add(sq);
        }
      }
    });
  });

  // PASO B: piezas que sí se han movido — buscamos su ID en el mapa viejo
  targetBoard.forEach((row, rIdx) => {
    row.forEach((cell, cIdx) => {
      if (cell) {
        const sq = String.fromCharCode(97 + cIdx) + (8 - rIdx);
        if (nextMap[sq]) return; // ya asignada en el Paso A

        const pieceTypeColor = `${cell.type}-${cell.color}`;

        const originalSquare = Object.keys(pieceIdentityMap).find(oldSq => {
          const id = pieceIdentityMap[oldSq];
          return id.startsWith(pieceTypeColor) && !usedOldKeys.has(oldSq);
        });

        if (originalSquare) {
          nextMap[sq] = pieceIdentityMap[originalSquare];
          usedOldKeys.add(originalSquare);
        } else {
          // Pieza totalmente nueva (ej: coronación), ID nuevo
          nextMap[sq] = `${pieceTypeColor}-${Math.random().toString(36).substring(2, 9)}`;
        }
      }
    });
  });

  pieceIdentityMap = nextMap;
  return targetGame;
};

// ============================================================
// NAVEGACIÓN POR EL HISTORIAL
// ============================================================

// Solo la parte posicional del FEN: piezas, turno, enroques, al paso.
// Ignoramos los dos contadores finales porque no siempre coinciden al
// reconstruir posiciones desde el historial.
const positionKey = (fen: string): string => fen.split(' ').slice(0, 4).join(' ');

type IdentityMove = {
  from: string;
  to: string;
  color: 'w' | 'b';
  flags: string;
  promotion?: string;
};

// Busca el movimiento legal EXACTO que lleva de fromFen a toFen.
// No es un diff de casillas: probamos los legales y comparamos la posición
// resultante. Así enroque, captura al paso y coronación se identifican bien,
// que es donde un diff empareja mal y hace que "se muevan dos piezas".
const findMoveBetween = (fromFen: string, toFen: string): IdentityMove | null => {
  let source: Chess;
  try {
    source = new Chess(fromFen);
  } catch {
    return null;
  }

  const targetKey = positionKey(toFen);

  for (const candidate of source.moves({ verbose: true })) {
    // chess.js >= 1.0 ya trae la FEN resultante en `after`; si no, la calculamos.
    let afterFen = (candidate as any).after as string | undefined;
    if (!afterFen) {
      const played = source.move({
        from: candidate.from,
        to: candidate.to,
        promotion: candidate.promotion ?? 'q',
      });
      if (!played) continue;
      afterFen = source.fen();
      source.undo();
    }
    if (positionKey(afterFen) === targetKey) {
      return candidate as unknown as IdentityMove;
    }
  }
  return null;
};

// Torre implicada en un enroque: [origen, destino]
const castlingRookSquares = (move: IdentityMove): [string, string] | null => {
  if (move.flags.includes('k')) return move.color === 'w' ? ['h1', 'f1'] : ['h8', 'f8'];
  if (move.flags.includes('q')) return move.color === 'w' ? ['a1', 'd1'] : ['a8', 'd8'];
  return null;
};

const freshId = (type: string, color: 'w' | 'b') =>
  `${type}-${color}-${Math.random().toString(36).substring(2, 11)}`;

// Aplica al mapa un movimiento ya validado por chess.js.
// Úsalo SIEMPRE en vez de moveIdentity(from, to) cuando tengas el objeto move:
// moveIdentity no sabe de enroques ni capturas al paso y deja entradas
// fantasma que luego se reasignan a la pieza equivocada.
export const applyMoveIdentity = (move: IdentityMove): void => {
  // Captura al paso: el peón capturado está en la columna de destino
  // y la fila de origen, no en `to`.
  if (move.flags.includes('e')) {
    delete pieceIdentityMap[move.to[0] + move.from[1]];
  }

  moveIdentity(move.from, move.to);

  const rook = castlingRookSquares(move);
  if (rook) moveIdentity(rook[0], rook[1]);

  // Coronación: el ID seguía diciendo "p-...". Le damos uno acorde al tipo nuevo.
  if (move.promotion) {
    pieceIdentityMap[move.to] = freshId(move.promotion, move.color);
  }
};

// Deshace un movimiento en el mapa (navegar hacia atrás).
// La pieza capturada no recupera su ID antiguo: buildPieceItems le dará uno
// nuevo y reaparecerá con fade-in, que es justo lo que queremos ver.
const undoMoveIdentity = (move: IdentityMove): void => {
  const rook = castlingRookSquares(move);
  if (rook) moveIdentity(rook[1], rook[0]);

  moveIdentity(move.to, move.from);

  if (move.promotion) {
    pieceIdentityMap[move.from] = freshId('p', move.color);
  }
};

// Mueve el mapa de identidades de una FEN a la contigua (adelante o atrás)
// y devuelve el Chess ya posicionado en toFen.
export const stepIdentityBetweenFens = (fromFen: string, toFen: string): Chess => {
  if (!fromFen || !toFen) return remapIdentitiesToFen(toFen);
  if (positionKey(fromFen) === positionKey(toFen)) return new Chess(toFen);

  const forward = findMoveBetween(fromFen, toFen);
  if (forward) {
    applyMoveIdentity(forward);
    return new Chess(toFen);
  }

  const backward = findMoveBetween(toFen, fromFen);
  if (backward) {
    undoMoveIdentity(backward);
    return new Chess(toFen);
  }

  // No están a un movimiento de distancia (historial inconsistente):
  // caemos al emparejamiento por tipo/color. Menos preciso, pero nunca
  // deja el tablero mal.
  return remapIdentitiesToFen(toFen);
};

// Movimiento que separa dos FENs contiguas, para pintar el resaltado de
// "última jugada" al navegar. null si no son contiguas.
export const getMoveBetweenFens = (
  fromFen: string,
  toFen: string
): { from: string; to: string } | null => {
  if (!fromFen || !toFen) return null;
  const move = findMoveBetween(fromFen, toFen);
  return move ? { from: move.from, to: move.to } : null;
};

// Consulta puntual del ID en una casilla (usado en el rebobinado de handleRetry
// para decidir si hay algo que mover antes de llamar a moveIdentity).
export const getIdentityAt = (square: string): string | undefined => {
  return pieceIdentityMap[square];
};

