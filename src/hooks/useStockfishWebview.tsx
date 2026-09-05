import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { useCallback, useEffect, useRef, useState } from 'react';
import { WebView } from 'react-native-webview';

const STOCKFISH_DIR = FileSystem.documentDirectory + 'stockfish/';
const FILES = [
  { mod: require('../../assets/stockfish/engine.html'), name: 'engine.html' },
  { mod: require('../../assets/stockfish/stockfish-18-lite-single.cjs'), name: 'stockfish-18-lite-single.cjs' },
  { mod: require('../../assets/stockfish/stockfish-18-lite-single_wasm.wasm'), name: 'stockfish-18-lite-single_wasm.wasm' },
];

// Cada vez que toques cualquiera de los tres ficheros de assets/stockfish/. 
// Si editas engine.html y no subes ENGINE_VERSION, la app seguirá usando la 
// copia antigua del disco y te volverás loco buscando por qué tus cambios no hacen 
// nada. Déjalo anotado.

// Súbelo cada vez que modifiques engine.html, el .cjs o el .wasm.
// Si no cambia, los ficheros no se recopian en el arranque.
const ENGINE_VERSION = '18-lite-1';
const STAMP_PATH = STOCKFISH_DIR + 'version.txt';

async function ensureEngineFilesOnDisk(): Promise<string> {
  const finalUri = STOCKFISH_DIR + 'engine.html';

  const dirInfo = await FileSystem.getInfoAsync(STOCKFISH_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(STOCKFISH_DIR, { intermediates: true });
  } else {
    // ¿Ya tenemos esta versión en disco? Si sí, no copiamos nada.
    try {
      const stamp = await FileSystem.readAsStringAsync(STAMP_PATH);
      if (stamp.trim() === ENGINE_VERSION) {
        // Verificación de integridad: el stamp puede existir pero los ficheros no
        // (instalación interrumpida, limpieza del sistema...).
        const htmlInfo = await FileSystem.getInfoAsync(finalUri);
        const wasmInfo = await FileSystem.getInfoAsync(
          STOCKFISH_DIR + 'stockfish-18-lite-single_wasm.wasm'
        );
        if (htmlInfo.exists && wasmInfo.exists) {
          return finalUri;   // ← camino rápido: cero I/O
        }
      }
    } catch {
      // No hay stamp o no se pudo leer: seguimos y copiamos.
    }
  }

  // --- COPIA (solo la primera vez o al subir ENGINE_VERSION) ---
  console.log('[SF] Copiando ficheros del motor, versión', ENGINE_VERSION);

  const assets = await Asset.loadAsync(FILES.map((f) => f.mod));

  await Promise.all(
    assets.map(async (asset, i) => {
      const dest = STOCKFISH_DIR + FILES[i].name;
      if (asset.localUri) {
        await FileSystem.deleteAsync(dest, { idempotent: true });
        await FileSystem.copyAsync({ from: asset.localUri, to: dest });
      }
    })
  );

  // El stamp se escribe AL FINAL: si la copia falla a medias, no queda
  // marcado como completo y el siguiente arranque lo reintenta.
  await FileSystem.writeAsStringAsync(STAMP_PATH, ENGINE_VERSION);

  return finalUri;
}

export function useStockfishWebview({
  onOutput,
  onError,
}: {
  onOutput: (output: string) => void;
  onError?: (error: string) => void;
}) {
  const webviewRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const queueRef = useRef<string[]>([]);
  const [engineUri, setEngineUri] = useState<string | null>(null);

  useEffect(() => {
    ensureEngineFilesOnDisk()
      .then(setEngineUri)
      .catch((e) => {
        console.log('[SF] ❌ ensureEngineFilesOnDisk ERROR:', e);
        onError?.('No se pudieron preparar los ficheros del motor: ' + e);
      });
  }, []);

  const flushQueue = useCallback(() => {
    queueRef.current.forEach((cmd) => webviewRef.current?.postMessage(cmd));
    queueRef.current = [];
  }, []);

  const sendCommandToStockfish = useCallback((cmd: string) => {
    if (readyRef.current) {
      webviewRef.current?.postMessage(cmd);
    } else {
      queueRef.current.push(cmd);
    }
  }, []);

  const handleLoadEnd = useCallback(() => {
    console.log('[SF] WebView onLoadEnd disparado');
    readyRef.current = true;
    flushQueue();
  }, [flushQueue]);

  const handleMessage = useCallback((event: any) => {
    //console.log('[SF] RAW MSG <-', event.nativeEvent.data);
    onOutput(event.nativeEvent.data);
  }, [onOutput]);

  const StockfishWebView = engineUri ? (
    <WebView
      ref={webviewRef}
      originWhitelist={['*']}
      source={{ uri: engineUri }}
      allowFileAccess={true}
      allowFileAccessFromFileURLs={true}
      allowUniversalAccessFromFileURLs={true}
      onLoadEnd={handleLoadEnd}
      onMessage={handleMessage}
      onError={(e) => {
        console.log('[SF] ❌ WebView onError (navegación):', e.nativeEvent);
        onError?.(e.nativeEvent.description);
      }}
      javaScriptEnabled
      style={{ width: 0, height: 0 }}
    />
  ) : null;

  const reloadEngine = useCallback(() => {
    console.log('[SF] Motor colapsado, recargando WebView...');
    readyRef.current = false;
    queueRef.current = [];
    webviewRef.current?.reload();
  }, []);

  return { sendCommandToStockfish, StockfishWebView, reloadEngine };
}