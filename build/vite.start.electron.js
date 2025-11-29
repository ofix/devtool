import { spawn } from 'child_process' // Node 内置模块，用于启动 Electron
import electron from 'electron'
import { join } from 'path';
import { watch } from 'chokidar'; // Vite 依赖的文件监听库，无需额外安装

// Vite 插件：启动 Vite 后自动启动 Electron
export const StartElectronPlugin = () => {
  let electronProcess = null; // 存储 Electron 进程
  let fileWatcher = null;    // 存储文件监听实例
  const electronDir = join(process.cwd(), 'src', 'electron');
  // 重启 Electron 进程
  const restartElectron = (listenUrl) => {
    // 杀死旧进程（避免多开）
    if (electronProcess) {
      electronProcess.kill();
      electronProcess = null;
      console.log('[Electron] 旧进程已关闭，准备重启...');
    }

    // 启动新的 Electron 进程
    electronProcess = spawn(electron, [join(electronDir, 'main.js'), listenUrl], {
      cwd: process.cwd(),
      stdio: 'inherit', // 共享日志（Electron 日志同步到终端）
      shell: process.platform === 'win32' // Windows 系统需要 shell: true 才能正确找到 electron 命令
    });

    // 监听 Electron 进程退出事件（异常退出时自动重启）
    electronProcess.on('exit', (code) => {
      if (code !== 0) {
        console.log(`[Electron] 进程异常退出（码：${code}），1秒后自动重启...`);
        setTimeout(() => restartElectron(listenUrl), 1000);
      }
    });
    console.log('[Electron] 进程已重启，监听主进程文件变化...');
  };
  // 监听主进程文件变化，如果有任何修改和删除将重启 Electron 进程
  const watchElectronFiles = (listenUrl) => {
    fileWatcher = watch(
      [
        join(electronDir, '**/*.js'),
        join(electronDir, '**/*.cjs'),
        join(electronDir, 'preload.js')
      ],
      {
        ignoreInitial: true, // 忽略初始扫描（避免启动时触发重启）
        ignore: ['node_modules/**']
      }
    );

    // 主进程文件变化时，重启 Electron
    fileWatcher.on('change', (filePath) => {
      restartElectron(listenUrl);
    });

    // 主进程文件新增时，重启 Electron
    fileWatcher.on('add', (filePath) => {
      restartElectron(listenUrl);
    });

    // 主进程文件删除时，重启 Electron
    fileWatcher.on('unlink', (filePath) => {
      restartElectron(listenUrl);
    });
  };

  return {
    name: 'StartElectronPlugin', // 插件名称（必填）
    configureServer (server) {
      // 监听 Vite 服务器「监听成功」事件（端口已就绪）
      server.httpServer.once('listening', () => {
        let addr = server.httpServer?.address()
        const listenUrl = `http://localhost:${addr.port}`
        watchElectronFiles(listenUrl);
        restartElectron(listenUrl);
      });

      // Vite 服务器关闭时，关闭 Electron 进程
      server.httpServer.on('close', () => {
        if (electronProcess) {
          electronProcess.kill();
          electronProcess = null;
        }
        if (fileWatcher) {
          fileWatcher.close();
          fileWatcher = null;
        }
      });
    }
  };
};