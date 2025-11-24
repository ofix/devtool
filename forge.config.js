const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const packageJson = require('./package.json');
const path = require('path');

module.exports = {
  packagerConfig: { // 参考 https://electron.github.io/packager/main/interfaces/Options.html
    asar: true,
    dir: './dist/*',
    appId: "com.sima.devtool", // 唯一标识
    productName: packageJson.productName, // 读取 package.json 的显示名称
    version: packageJson.version, // 读取 package.json 的版本号
    artifactName: `${packageJson.productName}-v${packageJson.version}.${process.platform === 'win32' ? 'msi' : 'zip'}`,
    icon: "./src/renderer/assets/devtool.ico",
    ignore: ['node_modules', "build", "src", "vite.config.js", "package-lock.json", "forge.config.js", "jsconfig.json", ".vscode", ".gitignore", ".npmrc",],
  },
  outDir: 'dist/deploy',
  rebuildConfig: {},
  makers: [
    // {
    //   name: '@electron-forge/maker-squirrel',
    //   platforms: ['win32'],
    //   config: {
    //     authors: "sima",
    //     description: "DevTool - 高效开发辅助工具",
    //     setupIcon: "./src/renderer/assets/devtool.ico",
    //     shortcutName: "DevTool",
    //     createDesktopShortcut: true,
    //     disableRunAfterInstall: true,
    //     noMsi: true,
    //     setupCommand: "", // 设置安装完成后的行为，不自动启动应用, 清空安装完成后的自动执行命令
    //     quietInstall: true, // 开启静默安装模式（减少安装过程中的弹窗）
    //     // 额外：禁止 Squirrel 安装时注册自动更新（避免触发应用启动）
    //     updateUrl: "",
    //   }
    // },
    {
      name: "@electron-forge/maker-wix", // WIX 工具链（生成 MSI 的核心）, 依赖本地 wix311.exe（安装完成后需要配置环境变量 C:\Program Files (x86)\WiX Toolset v3.11\bin）
      config: {                          // 需要安装wix依赖 npm install --save-dev @electron-forge/maker-wix
        language: 2052,                  // 安装向导语言（1033=英文，2052=中文简体）
        manufacturer: "sima",            // 安装包显示的厂商名称
        shortcutFolderName: "DevTool",   // 开始菜单文件夹名称
        shortcutName: "DevTool",         // 快捷方式名称
        installDirectory: "C:\\Program Files\\DevTool",
        LegalCopyright: "Copyright © 2025 sima. All rights reserved.", // 版权信息
        OriginalFilename: "DevTool.exe", // 原始文件名
        allowChangingInstallationDirectory: true,
        createDesktopShortcut: true,
        output: './dist/deploy/wix'
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
