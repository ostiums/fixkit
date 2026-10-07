// The package's sources sit one folder up, outside the app: Metro watches them and resolves their
// imports of other packages (react, react-native) from this app, as it would for the installed package.
const { getDefaultConfig } = require('expo/metro-config')
const path = require('node:path')

const config = getDefaultConfig(__dirname)
const fixkit = path.resolve(__dirname, '..')

config.watchFolders = [fixkit]
config.resolver.nodeModulesPaths = [path.join(__dirname, 'node_modules')]
config.resolver.extraNodeModules = { fixkit }

module.exports = config
