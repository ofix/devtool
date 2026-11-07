// 移除 uuid 依赖，改用原生生成，避免打包报错
function generateTaskId() {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export default class TaskContext {
  constructor(projectId, mode = "preview", priority = "high") {
    this.taskId = generateTaskId()
    this.projectId = projectId
    this.mode = mode
    this.priority = priority

    // 核心修复：直接赋值，彻底消除 getter 的上下文丢失问题
    this.abortController = new AbortController()
    this.signal = this.abortController.signal

    this.hardTimeout = null
    this.onDestroy = null

    // 统计埋点
    this.metrics = {
      mainRows: 0,
      errorRows: 0,
      discardedRows: 0,
      startTime: null,
      firstChunkTime: null,
    }
  }

  /**
   * 触发取消（手动或超时）
   */
  abort(reason = "用户取消") {
    if (this.signal && !this.signal.aborted) {
      this.abortController.abort(reason)
      this.stopHardTimeout()
      this.reportMetrics("cancelled")

      if (this.onDestroy) {
        this.onDestroy()
        this.onDestroy = null
      }
    }
  }

  startHardTimeout(timeoutMs, onTimeout) {
    if (!timeoutMs) return
    this.hardTimeout = setTimeout(() => {
      if (this.signal && !this.signal.aborted) {
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

  markFirstChunk() {
    if (!this.firstChunkTime) {
      this.firstChunkTime = Date.now()
      this.metrics.startTime = Date.now()
      this.startHardTimeout(5 * 60 * 1000, () => {
        console.warn(`[TaskContext] 任务 ${this.taskId} 触发硬超时`)
      })
    }
  }

  reportMetrics(status = "active") {
    const now = Date.now()
    const duration = this.metrics.startTime ? now - this.metrics.startTime : 0
    const total = this.metrics.mainRows + this.metrics.errorRows + this.metrics.discardedRows

    console.log(`[TaskMetrics] ${this.taskId} | 状态: ${status} | 耗时: ${duration}ms`)
    console.log(
      `  主流程行: ${this.metrics.mainRows} | 脏数据: ${this.metrics.errorRows} | 丢弃: ${this.metrics.discardedRows} | 总计: ${total}`,
    )
  }
}
