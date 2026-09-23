const { withAndroidManifest, withStringsXml, AndroidConfig } = require('expo/config-plugins');

// El SDK de Play Games Services busca el ID del proyecto en un <meta-data> del
// manifiesto al inicializarse. Si no está, PlayGamesSdk.initialize revienta en
// el arranque, así que este plugin escribe las dos piezas: el recurso de cadena
// y la referencia en el manifiesto.
//
// El ID sale de expo.extra.pgsProjectId para que haya UNA sola fuente de verdad:
// el mismo valor que lee el transporte en JS para decidir si Play Games está
// configurado. Si está vacío, el plugin no toca nada y la app cae a Drive.
const withPlayGames = config => {
  const projectId = config.extra?.pgsProjectId;
  if (!projectId) return config;

  config = withStringsXml(config, cfg => {
    cfg.modResults = AndroidConfig.Strings.setStringItem(
      [{ _: String(projectId), $: { name: 'game_services_project_id', translatable: 'false' } }],
      cfg.modResults,
    );
    return cfg;
  });

  return withAndroidManifest(config, cfg => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      application,
      'com.google.android.gms.games.APP_ID',
      '@string/game_services_project_id',
      'value',
    );
    return cfg;
  });
};

module.exports = withPlayGames;
