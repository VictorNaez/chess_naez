const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

// Cambios de configuración que la Activity gestiona sin destruirse.
//
// La plantilla de Expo SDK 54 declara
//   keyboard|keyboardHidden|orientation|screenSize|screenLayout|uiMode
// y le falta smallestScreenSize (las versiones posteriores de la plantilla ya lo
// incluyen). Al maximizar una ventana flotante o de pantalla dividida en una
// tablet cambia el ancho mínimo de la ventana (~400 dp -> ~800 dp) y, sin este
// flag, Android recrea la Activity: la app se vuelve a montar desde cero y se
// pierde el estado en curso (puzle a medias, reloj de contrarreloj...).
//
// Con el flag, React Native recibe el cambio en onConfigurationChanged,
// actualiza useWindowDimensions y el layout (useBoardFit) se reajusta en vivo.
//
// Requiere build nativa nueva: esto no viaja en una actualización solo de JS.
const EXTRA_CONFIG_CHANGES = ['smallestScreenSize'];

module.exports = function withLargeScreenConfigChanges(config) {
  return withAndroidManifest(config, cfg => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    const current = (activity.$['android:configChanges'] ?? '')
      .split('|')
      .filter(Boolean);
    for (const change of EXTRA_CONFIG_CHANGES) {
      if (!current.includes(change)) current.push(change);
    }
    activity.$['android:configChanges'] = current.join('|');
    return cfg;
  });
};
