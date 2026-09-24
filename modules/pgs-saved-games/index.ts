import { requireOptionalNativeModule } from 'expo';

// =========================================================
// PUENTE CON EL MÓDULO NATIVO DE SAVED GAMES
// =========================================================
// `requireOptionalNativeModule` devuelve null si la build no lleva el módulo,
// en vez de reventar al importar. Es lo que permite que el mismo JS corra en una
// build antigua sin Play Games: la app se queda con el otro transporte y no se
// entera nadie.

export interface PgsSnapshotMeta {
  /** Epoch ms del último guardado, según los servidores de Play. */
  savedAt: number;
  /** progressValue de la partida: aquí, el número de intentos puntuados. */
  progress: number;
  /** JSON compacto con el resto del resumen. Puede venir vacío. */
  description: string;
}

export interface PgsPlayer {
  name: string | null;
  /** Avatar pequeño. Puede ser null: no todos los jugadores tienen foto. */
  iconUri: string | null;
  /** Avatar grande, cuando existe. */
  hiResUri: string | null;
}

interface PgsSavedGamesNativeModule {
  isAuthenticated(): Promise<boolean>;
  signIn(): Promise<boolean>;
  getPlayer(): Promise<PgsPlayer | null>;
  describe(name: string): Promise<PgsSnapshotMeta | null>;
  save(name: string, path: string, description: string, progress: number): Promise<PgsSnapshotMeta>;
  load(name: string, path: string): Promise<PgsSnapshotMeta | null>;
  remove(name: string): Promise<void>;
}

const nativeModule = requireOptionalNativeModule<PgsSavedGamesNativeModule>('PgsSavedGames');

export const isPgsModuleAvailable = (): boolean => nativeModule !== null;

export default nativeModule;
