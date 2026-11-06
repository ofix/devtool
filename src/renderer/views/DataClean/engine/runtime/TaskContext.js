import { v4 as uuidv4 } from "uuid" // 如果没有 uuid 库，可用 Date.now() + Math.random() 替代

export default class TaskContext {
  /**
   * @param {String} projectId 工程/标签页ID
   * @param {String} mode 'preview' | 'execute'
   * @param {String} priority 'high' | 'low'
   */
  constructor(projectId, mode = "preview", priority = "high") {
    this.taskId = `task-${uuidv4()}`
    this.projectId = projectId
    this.mode = mode
    this.priority = priority

    this.abortController = new AbortController()
    this.hardTimeout = null

    // 统计埋点（指标不重叠）
    this.metrics = {
      mainRows: 0,
      errorRows: 0,
      discardedRows: 0,
      startTime: null,
      firstChunkTime: null,
    }
  }

  get signal() {
    return this.abortController.signal
  }

  /**
   * 触发取消（手动或超时）
   */
  abort(reason = "用户取消") {
    if (!this.signal.aborted) {
      this.abortController.abort(reason)
      this.stopHardTimeout()
      this.reportMetrics("cancelled")

      // 👇 新增：触发物理资源销毁
      if (this.onDestroy) {
        this.onDestroy()
        this.onDestroy = null
      }
    }
  }

  /**
   * 启动硬超时（从第一个 chunk 开始计时）
   * @param {Number} timeoutMs 超时时长
   * @param {Function} onTimeout 超时回调
   */
  startHardTimeout(timeoutMs, onTimeout) {
    if (!timeoutMs) return
    this.hardTimeout = setTimeout(() => {
      if (!this.signal.aborted) {
        onTimeout()
        this.abort("硬超时熔断")
      }
    }, timeoutMs)
  }

  stopHardTimeout() {
    if (this.hardTimeout) {
      clearTimeout(this.hardTimeout)
      this.hardTimeout = null
    }
  }

  /**
   * 标记首个 chunk 到达，开始计时并触发进度
   */
  markFirstChunk() {
    if (!this.firstChunkTime) {
      this.firstChunkTime = Date.now()
      this.metrics.startTime = Date.now()
      this.startHardTimeout(5 * 60 * 1000, () => {
        console.warn(`[TaskContext] 任务 ${this.taskId} 触发硬超时`)
      })
    }
  }

  /**
   * 上报指标
   */
  reportMetrics(status = "active") {
    const now = Date.now()
    const duration = this.metrics.startTime ? now - this.metrics.startTime : 0

    // 校验指标统计守恒
    const total = this.metrics.mainRows + this.metrics.errorRows + this.metrics.discardedRows

    console.log(`[TaskMetrics] ${this.taskId} | 状态: ${status} | 耗时: ${duration}ms`)
    console.log(
      `  主流程行: ${this.metrics.mainRows} | 脏数据: ${this.metrics.errorRows} | 丢弃: ${this.metrics.discardedRows} | 总计: ${total}`,
    )
  }
}
