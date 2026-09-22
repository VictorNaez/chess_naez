import * as FileSystem from 'expo-file-system/legacy';

// =========================================================
// GOOGLE DRIVE — CARPETA appDataFolder
// =========================================================
// Sin SDK: cuatro llamadas REST con el access token del usuario. Meter el SDK de
// Google Drive por esto serían megas de dependencia para lo que aquí son 100
// líneas.
//
// `appDataFolder` es un espacio oculto por app dentro del Drive del usuario: no
// aparece en "Mi unidad", no se puede compartir, y el usuario puede borrarlo
// desde Configuración > Aplicaciones de Drive. Cuenta contra SU cuota, que para
// un fichero de unos pocos cientos de KB da igual.

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

// Un único fichero, siempre el mismo, que se sobrescribe. Sin versiones: Drive
// ya guarda su propio historial y nosotros no queremos ocupar cuota ajena.
export const BACKUP_NAME = 'chess_naez_progress.db';

/** 401: el token caducó. Quien llama debe refrescarlo y reintentar UNA vez. */
export class DriveAuthError extends Error {}
/** Cualquier otro fallo del servidor o de red. */
export class DriveError extends Error {}

export interface RemoteBackup {
  id: string;
  size: number;
  modifiedTime: string;              // ISO 8601, lo pone Drive
  appProperties: Record<string, string>;
}

const parseBackup = (file: any): RemoteBackup => ({
  id: String(file.id),
  size: Number(file.size ?? 0),
  modifiedTime: String(file.modifiedTime ?? ''),
  appProperties: (file.appProperties ?? {}) as Record<string, string>,
});

const request = async (
  token: string,
  url: string,
  init?: RequestInit,
): Promise<any> => {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
    });
  } catch (error) {
    throw new DriveError(`network: ${String(error)}`);
  }

  if (response.status === 401) throw new DriveAuthError('token caducado');
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new DriveError(`${response.status} ${body.slice(0, 200)}`);
  }
  if (response.status === 204) return null;
  return response.json();
};

/** La copia actual, o null si esta cuenta todavía no tiene ninguna. */
export const findBackup = async (token: string): Promise<RemoteBackup | null> => {
  const q = encodeURIComponent(`name = '${BACKUP_NAME}' and trashed = false`);
  const fields = encodeURIComponent('files(id,name,size,modifiedTime,appProperties)');
  const data = await request(
    token,
    `${API}/files?spaces=appDataFolder&q=${q}&fields=${fields}&orderBy=modifiedTime%20desc&pageSize=10`,
  );
  const files: any[] = data?.files ?? [];
  return files.length > 0 ? parseBackup(files[0]) : null;
};

/**
 * Devuelve el id del fichero de copia, creándolo vacío si hace falta. La subida
 * del contenido va aparte: `uploadType=media` no admite metadatos, así que el
 * nombre y la carpeta hay que fijarlos al crearlo.
 */
export const ensureBackupFile = async (token: string): Promise<string> => {
  const existing = await findBackup(token);
  if (existing) return existing.id;

  const created = await request(token, `${API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: BACKUP_NAME, parents: ['appDataFolder'] }),
  });
  if (!created?.id) throw new DriveError('sin id al crear el fichero');
  return String(created.id);
};

/**
 * Sube el fichero binario. Va por FileSystem.uploadAsync y no por fetch: pasar
 * un .db por JS obligaría a leerlo entero a base64 (un tercio más de memoria) y
 * a mantenerlo en el heap; uploadAsync lo hace en nativo, en streaming.
 */
export const uploadSnapshot = async (
  token: string,
  fileId: string,
  fileUri: string,
): Promise<void> => {
  const result = await FileSystem.uploadAsync(
    `${UPLOAD_API}/files/${fileId}?uploadType=media&fields=id`,
    fileUri,
    {
      httpMethod: 'PATCH',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-sqlite3',
      },
    },
  ).catch((error: unknown) => {
    throw new DriveError(`upload: ${String(error)}`);
  });

  if (result.status === 401) throw new DriveAuthError('token caducado al subir');
  if (result.status >= 300) {
    throw new DriveError(`upload ${result.status} ${result.body.slice(0, 200)}`);
  }
};

/**
 * Metadatos que la app enseña ANTES de restaurar (ELO, puzles, fecha). Van en
 * `appProperties` para no tener que descargar 300 KB solo para saber qué hay al
 * otro lado. Drive limita cada par clave/valor a 124 bytes: todo son números
 * cortos en texto.
 */
export const writeBackupMetadata = async (
  token: string,
  fileId: string,
  properties: Record<string, string>,
): Promise<RemoteBackup> => {
  const fields = encodeURIComponent('id,size,modifiedTime,appProperties');
  const data = await request(token, `${API}/files/${fileId}?fields=${fields}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appProperties: properties }),
  });
  return parseBackup(data);
};

export const downloadBackup = async (
  token: string,
  fileId: string,
  destUri: string,
): Promise<void> => {
  await FileSystem.deleteAsync(destUri, { idempotent: true }).catch(() => {});
  const result = await FileSystem.downloadAsync(
    `${API}/files/${fileId}?alt=media`,
    destUri,
    { headers: { Authorization: `Bearer ${token}` } },
  ).catch((error: unknown) => {
    throw new DriveError(`download: ${String(error)}`);
  });

  if (result.status === 401) throw new DriveAuthError('token caducado al descargar');
  if (result.status >= 300) throw new DriveError(`download ${result.status}`);
};

/** Borrado explícito: el usuario manda sobre sus datos, también para quitarlos. */
export const deleteBackup = async (token: string, fileId: string): Promise<void> => {
  await request(token, `${API}/files/${fileId}`, { method: 'DELETE' });
};
