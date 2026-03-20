// src/main/preload.js
import { contextBridge, ipcRenderer } from 'electron';

/**
 * 暴露安全的 API 给渲染进程
 * 使用 contextBridge 确保安全性
 */
contextBridge.exposeInMainWorld('crawlerAPI', {
  // ========== 爬虫控制 ==========
  startCrawler: (name, options) => ipcRenderer.invoke('crawler:start', name, options),
  stopCrawler: (name) => ipcRenderer.invoke('crawler:stop', name),
  pauseCrawler: (name) => ipcRenderer.invoke('crawler:pause', name),
  resumeCrawler: (name) => ipcRenderer.invoke('crawler:resume', name),
  restartCrawler: (name) => ipcRenderer.invoke('crawler:restart', name),
  getAllStatus: () => ipcRenderer.invoke('crawler:getAllStatus'),
  getStatus: (name) => ipcRenderer.invoke('crawler:getStatus', name),
  getStatistics: (filters) => ipcRenderer.invoke('crawler:getStatistics', filters),
  getHistory: (filters) => ipcRenderer.invoke('crawler:getHistory', filters),
  resetCircuitBreaker: (name) => ipcRenderer.invoke('crawler:resetCircuitBreaker', name),
  updateCircuitBreaker: (name, config) => ipcRenderer.invoke('crawler:updateCircuitBreaker', name, config),
  getCircuitBreakerConfig: (name) => ipcRenderer.invoke('crawler:getCircuitBreakerConfig', name),
  pauseSite: (name) => ipcRenderer.invoke('crawler:pauseSite', name),
  resumeSite: (name) => ipcRenderer.invoke('crawler:resumeSite', name),
  clearQueue: (name) => ipcRenderer.invoke('crawler:clearQueue', name),
  getHealth: () => ipcRenderer.invoke('crawler:getHealth'),
  shutdown: () => ipcRenderer.invoke('crawler:shutdown'),

  // ========== 配置管理 ==========
  getConfigs: () => ipcRenderer.invoke('config:getAll'),
  getConfig: (name) => ipcRenderer.invoke('config:get', name),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  deleteConfig: (name) => ipcRenderer.invoke('config:delete', name),
  validateConfig: (config) => ipcRenderer.invoke('config:validate', config),
  reloadConfig: (name) => ipcRenderer.invoke('config:reload', name),
  importConfig: (filePath) => ipcRenderer.invoke('config:import', filePath),
  exportConfig: (name, format) => ipcRenderer.invoke('config:export', name, format),
  generateConfigTemplate: (id) => ipcRenderer.invoke('config:generateTemplate', id),

  // ========== 认证管理 ==========
  submitCaptcha: (name, code) => ipcRenderer.invoke('auth:submitCaptcha', name, code),
  completeManualLogin: (name) => ipcRenderer.invoke('auth:completeManualLogin', name),
  getCredentials: (name) => ipcRenderer.invoke('auth:getCredentials', name),
  saveCredentials: (name, credentials) => ipcRenderer.invoke('auth:saveCredentials', name, credentials),
  clearCredentials: (name) => ipcRenderer.invoke('auth:clearCredentials', name),

  // ========== 文件管理 ==========
  getFiles: (filters) => ipcRenderer.invoke('file:getList', filters),
  getFileInfo: (fileId) => ipcRenderer.invoke('file:getInfo', fileId),
  deleteFile: (fileId) => ipcRenderer.invoke('file:delete', fileId),
  deleteFiles: (fileIds) => ipcRenderer.invoke('file:deleteBatch', fileIds),
  openFile: (filePath) => ipcRenderer.invoke('file:open', filePath),
  openFileLocation: (filePath) => ipcRenderer.invoke('file:openLocation', filePath),
  getFileStatistics: () => ipcRenderer.invoke('file:getStatistics'),

  // ========== 统计信息 ==========
  getStatisticsOverview: () => ipcRenderer.invoke('statistics:getOverview'),
  getStatisticsByTime: (interval, days) => ipcRenderer.invoke('statistics:getByTime', interval, days),
  getStatisticsByWebsite: () => ipcRenderer.invoke('statistics:getByWebsite'),
  getStatisticsByType: () => ipcRenderer.invoke('statistics:getByType'),
  exportStatistics: (format, filters) => ipcRenderer.invoke('statistics:export', format, filters),

  // ========== 事件监听 ==========
  onStatusUpdate: (callback) => {
    ipcRenderer.on('crawler-status-update', (event, data) => callback(data));
  },
  onStatsUpdate: (callback) => {
    ipcRenderer.on('crawler-stats-update', (event, data) => callback(data));
  },
  onCrawlerStart: (callback) => {
    ipcRenderer.on('crawler-start', (event, data) => callback(data));
  },
  onCrawlerComplete: (callback) => {
    ipcRenderer.on('crawler-complete', (event, data) => callback(data));
  },
  onCrawlerError: (callback) => {
    ipcRenderer.on('crawler-error', (event, data) => callback(data));
  },
  onDownloadComplete: (callback) => {
    ipcRenderer.on('download-complete', (event, data) => callback(data));
  },
  onLoginRequired: (callback) => {
    ipcRenderer.on('login-required', (event, data) => callback(data));
  },
  onCircuitOpen: (callback) => {
    ipcRenderer.on('circuit-open', (event, data) => callback(data));
  },

  // ========== 工具函数 ==========
  platform: process.platform,
  version: process.version,
  isDev: process.env.NODE_ENV === 'development'
});

// 添加日志
console.log('Preload script loaded');