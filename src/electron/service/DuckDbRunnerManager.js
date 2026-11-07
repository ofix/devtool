import { spawn } from "child_process"
import path from "path"
import { app } from "electron"

class DuckDbRunnerManager {
  constructor() {
    this.runner = null
    this.requestId = 0
    this.pendingRequests = new Map()
  }

  init() {
    if (this.runner) return

    // 注意：打包后实际运行环境（asar）下的路径可能需要调整，开发环境先用这个
    const runnerPath = path.join(app.getAppPath(), "src", "duckdb-runner", "index.js")

    this.runner = spawn("node", [runnerPath], {
      stdio: ["pipe", "pipe", "pipe"],
    })

    let buffer = ""
    this.runner.stdout.on("data", data => {
      buffer += data.toString()
      let newlineIndex
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex)
        buffer = buffer.slice(newlineIndex + 1)
        try {
          const response = JSON.parse(line)
          const resolver = this.pendingRequests.get(response.id)
          if (resolver) {
            if (response.error) resolver.reject(new Error(response.error))
            else resolver.resolve(response.data)
            this.pendingRequests.delete(response.id)
          }
        } catch (e) {
          console.error("[DuckRunner] 解析数据失败", e, line)
        }
      }
    })

    this.runner.stderr.on("data", data => {
      console.error("[DuckRunner Error]", data.toString())
    })

    // 👇 极其关键的异常处理：Runner 崩溃后要拒绝所有挂起的请求
    this.runner.on("exit", code => {
      console.error(`[DuckRunner] 进程已退出，退出码: ${code}`)
      this.pendingRequests.forEach(req => req.reject(new Error("DuckDB Runner 进程异常终止")))
      this.pendingRequests.clear()
      this.runner = null
    })
  }

  /**
   * 发送 SQL 指令到独立进程执行
   */
  async query(sql) {
    this.init() // 懒加载，确保进程启动
    const id = this.requestId++
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject })
      this.runner.stdin.write(JSON.stringify({ id, sql }) + "\n")
    })
  }

  destroy() {
    if (this.runner) {
      this.runner.kill()
      this.runner = null
    }
  }
}

export const duckDbRunnerManager = new DuckDbRunnerManager()
