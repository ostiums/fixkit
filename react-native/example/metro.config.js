// The package's sources sit one folder up, outside the app. Metro watches them, and resolves their
// imports of other packages (react, react-native) from this app, as it would for the installed package.
const { getDefaultConfig } = require('expo/metro-config')
const path = require('node:path')

const config = getDefaultConfig(__dirname)
const fixkit = path.resolve(__dirname, '..')
const sources = path.join(fixkit, 'src')

config.watchFolders = [fixkit]
config.resolver.extraNodeModules = { 'react-native-fixkit': fixkit }
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const fromPackage = context.originModulePath.startsWith(sources + path.sep) && !moduleName.startsWith('.')
  const from = fromPackage ? { ...context, originModulePath: path.join(__dirname, 'index.ts') } : context
  return context.resolveRequest(from, moduleName, platform)
}

module.exports = config
