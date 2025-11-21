const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const path = require('path');

module.exports = {
  packagerConfig: { // 参考 https://electron.github.io/packager/main/interfaces/Options.html
    asar: true,
    dir: './dist/*',
    ignore: ['node_modules', "build", "src", "vite.config.js", "package-lock.json", "forge.config.js", "jsconfig.json", ".vscode", ".gitignore", ".npmrc",],
  },
  outDir: 'dist/deploy',
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        output: './dist/deploy/win32', // Windows
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
      config: {
        output: './dist/deploy/darwin', // macOS 安装包输出到
      },
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        output: './dist/deploy/deb',
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        output: './dist/deploy/rpm',
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
