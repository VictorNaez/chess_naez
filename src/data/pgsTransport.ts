import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import PgsSavedGames, { isPgsModuleAvailable, type PgsSnapshotMeta } from '../../modules/pgs-saved-games';
import {
  BACKUP_SLOT, CloudAuthError, CloudTooBigError, EMPTY_REMOTE,
  type CloudTransport, type RemoteInfo,
} from './cloudTransport';

// =========================================================
// TRANSPORTE: PLAY GAMES SERVICES (Saved Games)
// =========================================================
// La ventaja entera está en el login: el SDK v2 entra solo al arrancar, sin
// pantalla de consentimiento ni toque del usuario, porque el scope de Drive que
// necesitan las partidas guardadas ya va incluido en el permiso de Play Games.
// El fichero acaba en el mismo sitio que antes, el Drive del jugador.
//
// Lo que no cabe en los metadatos de la API va en `description` como JSON: el
// número de intentos tiene su propio hueco (progressValue) porque es el que
// decide quién va por delante, y también el que usa Play Games para resolver
// conflictos por su cuenta.

const encode = (info: RemoteInfo): string =>
  JSON.stringify({ e: info.elo, s: info.solved, p: info.puzzles });

const decode = (meta: PgsSnapshotMeta | null): RemoteInfo | null => {
  if (!meta) return null;
  let extra: { e?: number; s?: number; p?: number } = {};
  try {
    extra = meta.description ? JSON.parse(meta.description) : {};
  } catch {
    // Descripción de otra versión o escrita a mano: los intentos y la fecha
    // siguen siendo válidos, que es lo que mueve las decisiones.
  }
  return {
    savedAt: meta.savedAt,
    attempts: meta.progress,
    elo: Number(extra.e ?? 0),
    solved: Number(extra.s ?? 0),
    puzzles: Number(extra.p ?? 0),
  };
};

// El módulo nativo trabaja con rutas del sistema de ficheros, no con URIs.
const toPath = (uri: string): string => uri.replace('file://', '');

// El ID del proyecto de Play Games vive en app.json y el config plugin lo
// escribe en el manifiesto. Sin él, PlayGamesSdk.initialize revienta en el
// arranque, así que aquí se comprueba antes de tocar nada nativo.
const isConfigured = (): boolean => {
  const extra = Constants.expoConfig?.extra as { pgsProjectId?: string } | undefined;
  return !!extra?.pgsProjectId;
};

const requireModule = () => {
  if (!PgsSavedGames) throw new CloudAuthError('módulo nativo ausente');
  return PgsSavedGames;
};

export const pgsTransport: CloudTransport = {
  id: 'pgs',

  // Sin módulo nativo (build antigua) o sin sesión de Play Games, este
  // transporte no sirve y el provider se queda con Drive.
  isSupported: async () => {
    if (!isConfigured() || !isPgsModuleAvailable()) return false;
    try {
      return await requireModule().isAuthenticated();
    } catch {
      return false;
    }
  },

  // El login automático lo dispara el SDK al arrancar la app; aquí solo se
  // recoge el resultado. Por eso esto no enseña nada al usuario.
  restoreSession: async () => {
    const native = requireModule();
    if (!(await native.isAuthenticated())) return null;
    return (await native.getPlayerName()) ?? 'Play Games';
  },

  signIn: async () => {
    const native = requireModule();
    if (!(await native.signIn())) return null;
    return (await native.getPlayerName()) ?? 'Play Games';
  },

  // Play Games no tiene cierre de sesión por app: se gestiona en los ajustes del
  // sistema. Dejarlo en nada es lo correcto, no un hueco por rellenar.
  signOut: async () => {},

  find: async () => decode(await requireModule().describe(BACKUP_SLOT)),

  upload: async (fileUri, info) => {
    try {
      const meta = await requireModule().save(
        BACKUP_SLOT, toPath(fileUri), encode(info), info.attempts,
      );
      return decode(meta) ?? { ...EMPTY_REMOTE, ...info };
    } catch (error) {
      // El tope por partida guardada es de unos pocos MB. Si algún día el
      // historial lo supera, esto es lo que deja caer la copia a Drive en vez de
      // dejar al jugador sin nada.
      if (error instanceof Error && error.message.includes('ERR_TOO_BIG')) {
        throw new CloudTooBigError(error.message);
      }
      throw error;
    }
  },

  download: async destUri => {
    await FileSystem.deleteAsync(destUri, { idempotent: true }).catch(() => {});
    const meta = await requireModule().load(BACKUP_SLOT, toPath(destUri));
    if (!meta) throw new Error('no-backup');
  },

  remove: async () => { await requireModule().remove(BACKUP_SLOT); },
};
