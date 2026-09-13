const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// En cuanto aparece un solo <include>, Android deja de respaldar por defecto y
// sube ÚNICAMENTE lo listado. Es lo que queremos: sin esto entrarían también
// files/SQLite/puzzles_v2.db (12 MB de catálogo que ya viaja en el APK) y
// databases/RKStorage, y por encima de 25 MB Android llama a onQuotaExceeded y
// no sube absolutamente nada.
//
// `SQLite/` es donde expo-sqlite pone las bases, dentro de getFilesDir()
// => domain="file". Se listan los ficheros uno a uno porque incluir la carpeta
// entera arrastraría el catálogo.
//
// El -wal viaja con el .db: Android cierra la app antes de copiar, así que los
// dos ficheros salen del mismo instante y SQLite los reconcilia al abrir. El
// -shm queda fuera a propósito: es memoria compartida, se regenera sola, y
// restaurar uno rancio solo puede dar problemas.
//
// AsyncStorage (ajustes, idioma, filtros) NO se respalda. Si lo quieres,
// añade <include domain="database" path="RKStorage" />.
const INCLUDES = `        <include domain="file" path="SQLite/progress.db" />
        <include domain="file" path="SQLite/progress.db-wal" />`;

// Android 11 e inferior.
const BACKUP_RULES = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
${INCLUDES.replace(/^ {4}/gm, '')}
</full-backup-content>
`;

// Android 12+. Hacen falta LOS DOS ficheros: el dispositivo elige uno u otro
// según su versión de Android, no según el targetSdk de la app.
// `device-transfer` cubre el traspaso directo móvil a móvil, que no pasa por la
// nube y por tanto funciona aunque el usuario tenga desactivada la copia de
// seguridad de Google.
const DATA_EXTRACTION_RULES = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
    <cloud-backup>
${INCLUDES}
    </cloud-backup>
    <device-transfer>
${INCLUDES}
    </device-transfer>
</data-extraction-rules>
`;

const withBackupXmlFiles = config =>
  withDangerousMod(config, [
    'android',
    async cfg => {
      const xmlDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app/src/main/res/xml',
      );
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(path.join(xmlDir, 'backup_rules.xml'), BACKUP_RULES);
      fs.writeFileSync(
        path.join(xmlDir, 'data_extraction_rules.xml'),
        DATA_EXTRACTION_RULES,
      );
      return cfg;
    },
  ]);

const withBackupManifest = config =>
  withAndroidManifest(config, cfg => {
    const application = cfg.modResults.manifest.application?.[0];
    if (!application) return cfg;

    application.$['android:allowBackup'] = 'true';
    application.$['android:fullBackupContent'] = '@xml/backup_rules';
    application.$['android:dataExtractionRules'] = '@xml/data_extraction_rules';

    return cfg;
  });

module.exports = config => withBackupManifest(withBackupXmlFiles(config));
