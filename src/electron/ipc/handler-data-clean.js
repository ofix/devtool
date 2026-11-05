// DataClean 子应用 IPC 路由
// 负责文件/文件夹选择、文件读写、目录递归、命令执行、管线持久化

import { ipcMain, dialog, shell, MessageChannelMain } from "electron"
import fs from "fs"
import path from "path"
import { exec } from "child_process"

const CHANNEL_PREFIX = "data-clean"

/**
 * 注册 DataClean 相关 IPC 处理器
 * 在 main.js 的 app.whenReady() 之后调用一次
 */

class DataCleanHandler {
  constructor() {
    this.registerHandlers()
  }

  registerHandlers() {
    // ---- 文件/文件夹选择 ----
    ipcMain.handle(`${CHANNEL_PREFIX}:dialog:openFile`, async (_e, options = {}) => {
      const { filters = [], properties = ["openFile"] } = options
      const result = await dialog.showOpenDialog({
        filters,
        properties,
      })
      if (result.canceled || result.filePaths.length === 0) return null
      return result.filePaths[0]
    })

    ipcMain.handle(`${CHANNEL_PREFIX}:dialog:openDirectory`, async () => {
      const result = await dialog.showOpenDialog({
        properties: ["openDirectory"],
      })
      if (result.canceled || result.filePaths.length === 0) return null
      return result.filePaths[0]
    })

    ipcMain.handle(`${CHANNEL_PREFIX}:dialog:saveFile`, async (_e, options = {}) => {
      const { filters = [], defaultPath = "" } = options
      const result = await dialog.showSaveDialog({
        filters,
        defaultPath,
      })
      if (result.canceled || !result.filePath) return null
      return result.filePath
    })

    // ---- 文件读写 ----
    ipcMain.handle(`${CHANNEL_PREFIX}:fs:stat`, async (_e, filePath) => {
      try {
        const stats = await fs.promises.stat(filePath)
        return { size: stats.size, isFile: stats.isFile() }
      } catch (err) {
        return null
      }
    })

    ipcMain.handle(`${CHANNEL_PREFIX}:fs:readFile`, async (_e, filePath) => {
      return fs.promises.readFile(filePath, "utf8")
    })

    ipcMain.handle(`${CHANNEL_PREFIX}:fs:writeFile`, async (_e, filePath, content) => {
      await fs.promises.mkdir(path.dirname(filePath), {
        recursive: true,
      })
      await fs.promises.writeFile(filePath, content, "utf8")
      return true
    })

    // ---- 目录递归列出文件 ----
    ipcMain.handle(`${CHANNEL_PREFIX}:fs:listFiles`, async (_e, dirPath, extensions = []) => {
      const results = []
      const exts = extensions.map(e => e.toLowerCase())

      async function walk(dir) {
        let entries
        try {
          entries = await fs.promises.readdir(dir, {
            withFileTypes: true,
          })
        } catch (err) {
          return
        }
        for (const entry of entries) {
          const full = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            await walk(full)
          } else if (entry.isFile()) {
            if (exts.length === 0 || exts.includes(path.extname(entry.name).toLowerCase())) {
              results.push(full)
            }
          }
        }
      }

      await walk(dirPath)
      return results.sort()
    })

    // ---- 命令执行（超时 + 输出上限） ----
    ipcMain.handle(`${CHANNEL_PREFIX}:command:exec`, async (_e, command, options = {}) => {
      const { timeout = 30000, maxOutput = 1024 * 1024 } = options
      return new Promise(resolve => {
        exec(
          command,
          { timeout, maxBuffer: maxOutput, windowsHide: true },
          (err, stdout, stderr) => {
            resolve({
              ok: !err,
              code: err ? err.code : 0,
              stdout: stdout || "",
              stderr: stderr || "",
              killed: Boolean(err && err.killed),
            })
          },
        )
      })
    })

    // ---- 管线持久化 ----
    ipcMain.handle(`${CHANNEL_PREFIX}:pipeline:save`, async (_e, filePath, json) => {
      await fs.promises.mkdir(path.dirname(filePath), {
        recursive: true,
      })
      await fs.promises.writeFile(filePath, json, "utf8")
      return true
    })

    ipcMain.handle(`${CHANNEL_PREFIX}:pipeline:load`, async (_e, filePath) => {
      return fs.promises.readFile(filePath, "utf8")
    })

    ipcMain.handle(`${CHANNEL_PREFIX}:fs:readBuffer`, async (_e, filePath) => {
      return fs.promises.readFile(filePath) // 返回 Node Buffer
    })

    // 流式读取超大文件，转移文件所有权，零拷贝
    ipcMain.handle(`${CHANNEL_PREFIX}:fs:startStream`, async (evt, filePath) => {
      // 用一个随机 ID 隔离不同文件的流
      const streamId = Date.now().toString()

      // 注意：这是 WebContents 对象，用于给前端推流
      const webContents = evt.sender

      const rs = fs.createReadStream(filePath, { highWaterMark: 128 * 1024 })

      // 监听前端的终止信号
      ipcMain.once(`${CHANNEL_PREFIX}:fs:abort:${streamId}`, () => {
        rs.destroy()
      })

      rs.on("data", buf => {
        // 直接发送 Uint8Array，Electron 完美支持
        const ab = new Uint8Array(buf)
        webContents.send(`${CHANNEL_PREFIX}:fs:chunk:${streamId}`, ab)
      })

      rs.on("end", () => webContents.send(`${CHANNEL_PREFIX}:fs:end:${streamId}`))
      rs.on("error", err => webContents.send(`${CHANNEL_PREFIX}:fs:error:${streamId}`, err.message))

      // 把 streamId 返回给前端
      return streamId
    })

    ipcMain.handle(`${CHANNEL_PREFIX}:shell:showItemInFolder`, async (_e, filePath) => {
      shell.showItemInFolder(filePath)
    })

    // 👇 新增这个：用于写入 Excel 等二进制文件
    ipcMain.handle(`${CHANNEL_PREFIX}:fs:writeBuffer`, async (_e, filePath, buffer) => {
      await fs.promises.mkdir(path.dirname(filePath), {
        recursive: true,
      })
      await fs.promises.writeFile(filePath, buffer)
      return true
    })
  }
}

export default new DataCleanHandler()
