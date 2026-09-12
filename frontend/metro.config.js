const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push('mjs');
config.resolver.blacklistRE = /node_modules\/.*\/node_modules\/|.*\.git\/.*/;
config.watcher.watchman = false

module.exports = withNativeWind(config, { input: "./global.css" });
