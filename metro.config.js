const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Permitir que Metro cargue archivos .wasm y archivos JS estáticos de assets
config.resolver.assetExts.push('wasm', 'html' ,'cjs');
// por si 'cjs' estuviera también en sourceExts, evita que Metro intente parsearlo como código:
config.resolver.sourceExts = config.resolver.sourceExts.filter((ext) => ext !== 'cjs');

module.exports = config;