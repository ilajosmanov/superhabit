const { sep } = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativewind } = require('nativewind/metro');

const base = getDefaultConfig(__dirname);
const config = withNativewind(base);

// shortcut: react-native-css (3.1.0-rc.0 and rc.1) swaps `react-native` for a shim without RN 0.88's
// AssetRegistry, so expo-asset gets undefined and every bundled asset (e.g. tab icons) fails to load.
// expo-asset gets the real module; drop this once react-native-css re-exports AssetRegistry.
const nativewindResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) =>
  moduleName === 'react-native' && context.originModulePath.includes(`${sep}expo-asset${sep}`)
    ? (base.resolver.resolveRequest ?? context.resolveRequest)(context, moduleName, platform)
    : nativewindResolve(context, moduleName, platform);

// Drizzle's generated migrations import .sql files (inlined as strings by babel-plugin-inline-import).
config.resolver.sourceExts.push('sql');

module.exports = config;
