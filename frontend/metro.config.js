// metro.config.js
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Folders inside the project that are NOT app source. Metro crawls, watches and
// caches everything under the project root; `.kilo/worktrees` holds a full second
// copy of the repo, which doubled the work and caused "EMFILE: too many open files"
// on Windows. Matched by absolute path so nothing else can be caught by accident.
const IGNORED_DIRS = [".kilo", "dist", ".claude"];

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ignoredPatterns = IGNORED_DIRS.map(
  (dir) => new RegExp(`^${escapeRegExp(path.join(__dirname, dir))}([\\\\/].*)?$`)
);

// Keep Expo's own defaults (.expo/types, android/app/build, ios/Pods, …).
const existing = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  ...ignoredPatterns,
];

module.exports = withNativeWind(config, { input: "./global.css" });
