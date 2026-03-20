// src/main/main.js
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { CrawlerManager } from './crawler/core/CrawlerManager.js';
import { setupCrawlerHandlers } from './ipc/crawlerHandlers.js';
import { setupConfigHandlers } from './ipc/configHandlers.js';
import { setupAuthHandlers } from './ipc/authHandlers.js';
import { setupFileHandlers } from './ipc/fileHandlers.js';
import { setupStatisticsHandlers } from './ipc/statisticsHandlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 禁用 GPU 加速（解决某些兼容性问题）
app.disableHardwareAcceleration();

// 单实例锁定
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let crawlerManager = null;

/**
 * 创建主窗口
 */
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../../resources/icons/icon.png'),
    title: 'Crawler Framework',
    show: false,
    backgroundColor: '#2f3241'
  });

  // 初始化爬虫管理器
  const userDataPath = app.getPath('userData');
  crawlerManager = new CrawlerManager({
    downloadPath: path.join(userDataPath, 'downloads'),
    dbPath: path.join(userDataPath, 'data', 'crawler.db'),
    configPath: path.join(userDataPath, 'configs', 'websites'),
    globalConcurrent: 3,
    maxConcurrentPerSite: 1
  });

  // 设置 IPC 处理器
  setupCrawlerHandlers(ipcMain, crawlerManager);
  setupConfigHandlers(ipcMain, crawlerManager);
  setupAuthHandlers(ipcMain, crawlerManager);
  setupFileHandlers(ipcMain, crawlerManager);
  setupStatisticsHandlers(ipcMain, crawlerManager);

  // 加载配置文件
  try {
    await crawlerManager.loadConfigs();
    console.log('Configs loaded successfully');
  } catch (error) {
    console.error('Failed to load configs:', error);
  }

  // 定期推送状态更新
  const statusInterval = setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const status = crawlerManager.getAllStatus();
      mainWindow.webContents.send('crawler-status-update', status);
      
      crawlerManager.getStatistics().then(stats => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('crawler-stats-update', stats);
        }
      }).catch(console.error);
    }
  }, 2000);

  // 监听爬虫事件，转发到渲染进程
  const forwardEvent = (eventName, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(eventName, data);
    }
  };

  crawlerManager.on('crawlerStart', (data) => forwardEvent('crawler-start', data));
  crawlerManager.on('crawlerComplete', (data) => forwardEvent('crawler-complete', data));
  crawlerManager.on('crawlerError', (data) => forwardEvent('crawler-error', data));
  crawlerManager.on('downloadComplete', (data) => forwardEvent('download-complete', data));
  crawlerManager.on('loginRequired', (data) => forwardEvent('login-required', data));
  crawlerManager.on('circuitOpen', (data) => forwardEvent('circuit-open', data));

  // 加载页面
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    await mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // 显示窗口
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 窗口关闭事件
  mainWindow.on('closed', () => {
    clearInterval(statusInterval);
    mainWindow = null;
  });
}

// 应用准备就绪
app.whenReady().then(() => {
  createWindow();
});

// 所有窗口关闭
app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    if (crawlerManager) {
      await crawlerManager.shutdown();
    }
    app.quit();
  }
});

// 激活应用（macOS）
app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// 第二实例启动时，聚焦主窗口
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  if (crawlerManager) {
    crawlerManager.logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  }
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  if (crawlerManager) {
    crawlerManager.logger.error('Unhandled Rejection', { reason });
  }
});