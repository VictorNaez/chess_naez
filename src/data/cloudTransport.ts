// =========================================================
// TRANSPORTE DE LA COPIA
// =========================================================
// Toda la lógica de cuándo copiar, cuándo restaurar y qué lado va por delante es
// independiente de por dónde viaje el fichero. Esta interfaz es la frontera:
// arriba, el provider decide; abajo, Play Games mueve bytes.
//
// Hoy solo hay una implementación. La frontera se queda porque es lo que permitió
// cambiar de Drive a Play Games tocando un fichero, y lo que permitiría volver.
//
// La regla de reparto es simple: aquí abajo no hay ni una decisión de producto,
// solo "sube esto", "bájame aquello" y "dime qué hay".

/** Quién está conectado. El avatar puede faltar, el nombre no. */
export interface CloudIdentity {
  name: string;
  avatarUri: string | null;
}

/** Resumen de lo que hay al otro lado, sin descargar la copia entera. */
export interface RemoteInfo {
  savedAt: number;    // epoch ms
  attempts: number;   // el número que decide quién va por delante
  solved: number;
  puzzles: number;
  elo: number;
}

export const EMPTY_REMOTE: RemoteInfo = {
  savedAt: 0, attempts: 0, solved: 0, puzzles: 0, elo: 0,
};

/** La sesión caducó o nunca existió. */
export class CloudAuthError extends Error {}
/** Sin red, o el servicio no contesta. */
export class CloudNetworkError extends Error {}
/** El servicio no admite una copia de este tamaño. */
export class CloudTooBigError extends Error {}

export interface CloudTransport {
  readonly id: 'pgs';
  /** ¿Puede usarse en ESTE dispositivo y esta build? */
  isSupported(): Promise<boolean>;
  /** Sesión ya concedida, sin interfaz. Devuelve la identidad o null. */
  restoreSession(): Promise<CloudIdentity | null>;
  /** Login con interfaz. null si el usuario cancela. */
  signIn(): Promise<CloudIdentity | null>;
  find(): Promise<RemoteInfo | null>;
  upload(fileUri: string, info: RemoteInfo): Promise<RemoteInfo>;
  download(destUri: string): Promise<void>;
  remove(): Promise<void>;
}

/** Nombre del hueco donde vive la copia. Igual en los dos transportes. */
export const BACKUP_SLOT = 'chess_naez_progress';
