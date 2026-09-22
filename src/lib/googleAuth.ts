import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
  type User,
} from '@react-native-google-signin/google-signin';
import Constants from 'expo-constants';

// =========================================================
// SESIÓN DE GOOGLE — SOLO PARA LA COPIA EN LA NUBE
// =========================================================
// El único scope que se pide es `drive.appdata`: una carpeta OCULTA dentro del
// Drive del usuario a la que solo puede acceder esta app. No vemos ni un fichero
// suyo, y Google lo clasifica como scope NO sensible (verificación básica, sin
// auditoría de seguridad).
//
// Aquí no se crea ninguna cuenta: la app sigue sin tener usuarios. El token va
// del móvil a Google directamente y los datos acaban en el Drive del jugador,
// no en un servidor nuestro.
export const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

// El client ID de tipo Web NO es un secreto (viaja en cada petición OAuth), así
// que vive en app.json y no en variables de entorno. Si está vacío, toda la
// sección de nube se oculta: una build sin configurar no enseña un botón que
// solo puede fallar.
export const WEB_CLIENT_ID: string =
  (Constants.expoConfig?.extra as { googleWebClientId?: string } | undefined)
    ?.googleWebClientId ?? '';

export const isCloudConfigured = (): boolean => WEB_CLIENT_ID.length > 0;

// configure() es síncrono y idempotente, pero llamarlo en cada acción es ruido:
// bandera de módulo, no de React, porque lo llaman tanto el provider como la UI.
let configured = false;

export const configureGoogleAuth = (): void => {
  if (configured || !isCloudConfigured()) return;
  GoogleSignin.configure({
    scopes: [DRIVE_APPDATA_SCOPE],
    webClientId: WEB_CLIENT_ID,
    // Sin servidor propio no hay a quién darle el refresh token.
    offlineAccess: false,
  });
  configured = true;
};

/**
 * Login con interfaz. Devuelve null si el usuario cancela: cancelar no es un
 * error y no debe pintar el aviso rojo.
 */
export const signInInteractive = async (): Promise<User | null> => {
  configureGoogleAuth();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  try {
    const response = await GoogleSignin.signIn();
    return isSuccessResponse(response) ? response.data : null;
  } catch (error) {
    if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED) {
      return null;
    }
    throw error;
  }
};

/**
 * Sesión ya concedida en un arranque anterior, sin interfaz. Es lo que hace que
 * la copia automática funcione sin pedirle nada al usuario cada vez.
 */
export const restoreSession = async (): Promise<User | null> => {
  configureGoogleAuth();
  try {
    const response = await GoogleSignin.signInSilently();
    return response.type === 'success' ? response.data : null;
  } catch {
    // Sin credencial guardada, sin red, o Play Services ausente: no hay sesión y
    // punto. Quien quiera entrar, que pulse el botón.
    return null;
  }
};

export const getAccessToken = async (): Promise<string> => {
  configureGoogleAuth();
  const { accessToken } = await GoogleSignin.getTokens();
  return accessToken;
};

/**
 * Los access token de Google caducan en ~1 h y el módulo nativo cachea el
 * último: sin invalidarlo antes, getTokens devolvería otra vez el caducado y el
 * reintento volvería a comerse un 401.
 */
export const refreshAccessToken = async (stale: string): Promise<string> => {
  configureGoogleAuth();
  await GoogleSignin.clearCachedAccessToken(stale).catch(() => {});
  const { accessToken } = await GoogleSignin.getTokens();
  return accessToken;
};

export const signOutFromGoogle = async (): Promise<void> => {
  configureGoogleAuth();
  await GoogleSignin.signOut().catch(() => {});
};

export const currentUserEmail = (): string | null =>
  GoogleSignin.getCurrentUser()?.user.email ?? null;

/**
 * Traduce los códigos del módulo nativo a una clave de diccionario. DEVELOPER_ERROR
 * es el clásico de la primera build: el SHA-1 de la firma no está registrado en
 * el cliente OAuth de Android.
 */
export type AuthErrorKind = 'playServices' | 'config' | 'network' | 'unknown';

// El módulo nativo rechaza DEVELOPER_ERROR con el código numérico de
// CommonStatusCodes (10) en texto, y no lo expone en `statusCodes`. Es el error
// más probable en la primera build: SHA-1 no registrado, package distinto o
// client ID de otro proyecto.
const DEVELOPER_ERROR_CODE = '10';

export const classifyAuthError = (error: unknown): AuthErrorKind => {
  if (!isErrorWithCode(error)) return 'unknown';
  if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return 'playServices';
  if (error.code === DEVELOPER_ERROR_CODE) return 'config';
  return 'unknown';
};
