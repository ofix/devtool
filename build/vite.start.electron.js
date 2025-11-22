import { spawn } from 'child_process' // Node 内置模块，用于启动 Electron
import electron from 'electron'

// Vite 插件：启动 Vite 后自动启动 Electron
export const StartElectronPlugin = () => {
  let electronProcess = null; // 存储 Electron 进程

  return {
    name: 'StartElectronPlugin', // 插件名称（必填）
    configureServer (server) {
      // 监听 Vite 服务器「监听成功」事件（端口已就绪）
      server.httpServer.once('listening', () => {
        // 关闭之前可能残留的 Electron 进程（避免多开）
        if (electronProcess) {
          electronProcess.kill();
        }

        let addr = server.httpServer?.address()
        const listenUrl = `http://localhost:${addr.port}`

        // 启动 Electron（关键：--no-devtools 禁用内置 DevTools，消除报错）
        electronProcess = spawn(
          electron + '',
          ["src/electron/main.js", listenUrl], // 启动参数：Electron 主进程入口 + 禁用 DevTools
          {
            cwd: process.cwd(), // 工作目录
            stdio: 'inherit' // 共享日志输出（Electron 日志会同步到终端）
          }
        );
      });

      // Vite 服务器关闭时，关闭 Electron 进程
      server.httpServer.on('close', () => {
        if (electronProcess) {
          electronProcess.kill();
          electronProcess = null;
        }
      });
    }
  };
};