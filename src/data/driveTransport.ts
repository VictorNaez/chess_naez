import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  deleteBackup, DriveAuthError, DriveError, downloadBackup, ensureBackupFile, findBackup,
  uploadSnapshot, writeBackupMetadata, type RemoteBackup,
} from './driveBackup';
import {
  CloudAuthError, CloudNetworkError, EMPTY_REMOTE, type CloudTransport, type RemoteInfo,
} from './cloudTransport';
import {
  getAccessToken, isCloudConfigured, refreshAccessToken, restoreSession,
  signInInteractive, signOutFromGoogle,
} from '../lib/googleAuth';

// =========================================================
// TRANSPORTE: GOOGLE DRIVE (appDataFolder)
// =========================================================
// El que ya está en producción. Sigue siendo el plan B de Play Games: funciona
// en cualquier dispositivo con servicios de Google, sin depender de que la app
// esté dada de alta como juego ni de que el jugador tenga perfil de Play Games.

const toRemoteInfo = (backup: RemoteBackup | null): RemoteInfo | null => {
  if (!backup) return null;
  const props = backup.appProperties;
  return {
    savedAt: Number(props.savedAt ?? 0) || Date.parse(backup.modifiedTime) || 0,
    attempts: Number(props.attempts ?? 0),
    solved: Number(props.solved ?? 0),
    puzzles: Number(props.puzzles ?? 0),
    elo: Number(props.elo ?? 0),
  };
};

// Un token por operación, con UN reintento si Google dice que caducó. Vive aquí
// y no en el provider porque es un detalle de ESTE transporte: Play Games no
// maneja tokens, los resuelve el SDK nativo.
const withToken = async <T,>(fn: (token: string) => Promise<T>): Promise<T> => {
  let token: string;
  try {
    token = await getAccessToken();
  } catch (error) {
    throw new CloudAuthError(String(error));
  }
  try {
    return await fn(token);
  } catch (error) {
    if (!(error instanceof DriveAuthError)) throw translate(error);
    const fresh = await refreshAccessToken(token).catch(() => { throw new CloudAuthError('refresh'); });
    try {
      return await fn(fresh);
    } catch (retryError) {
      throw translate(retryError);
    }
  }
};

const translate = (error: unknown): Error => {
  if (error instanceof DriveAuthError) return new CloudAuthError(error.message);
  if (error instanceof DriveError && error.message.startsWith('network')) {
    return new CloudNetworkError(error.message);
  }
  return error instanceof Error ? error : new Error(String(error));
};

export const driveTransport: CloudTransport = {
  id: 'drive',

  isSupported: async () => isCloudConfigured(),

  restoreSession: async () => {
    const user = await restoreSession();
    return user?.user.email ?? null;
  },

  signIn: async () => {
    const user = await signInInteractive();
    return user?.user.email ?? null;
  },

  signOut: () => signOutFromGoogle(),

  find: async () => withToken(async token => toRemoteInfo(await findBackup(token))),

  upload: async (fileUri, info) => withToken(async token => {
    const fileId = await ensureBackupFile(token);
    await uploadSnapshot(token, fileId, fileUri);
    const updated = await writeBackupMetadata(token, fileId, {
      elo: String(info.elo),
      attempts: String(info.attempts),
      solved: String(info.solved),
      puzzles: String(info.puzzles),
      savedAt: String(info.savedAt),
      platform: Platform.OS,
      appVersion: String(Constants.expoConfig?.version ?? ''),
    });
    return toRemoteInfo(updated) ?? { ...EMPTY_REMOTE, ...info };
  }),

  download: async destUri => withToken(async token => {
    const file = await findBackup(token);
    if (!file) throw new Error('no-backup');
    await downloadBackup(token, file.id, destUri);
  }),

  remove: async () => withToken(async token => {
    const file = await findBackup(token);
    if (file) await deleteBackup(token, file.id);
  }),
};
