/**
 * 资源管家（单例模式）
 * 负责：临时文件生命周期、磁盘水位、内存仲裁
 */
class ResourceManager {
  constructor() {
    this.allocatedMemory = 0
    this.maxMemory = 512 * 1024 * 1024 // 默认 512MB
    this.tempFiles = new Map() // key: taskId, value: Set<filePath>
  }

  async requestMemory(bytes, ctx) {
    if (this.allocatedMemory + bytes > this.maxMemory) {
      throw new Error("MEMORY_LIMIT_EXCEEDED")
    }
    this.allocatedMemory += bytes
  }

  releaseMemory(bytes) {
    this.allocatedMemory = Math.max(0, this.allocatedMemory - bytes)
  }

  getTempFilePath(taskId, suffix = ".ndjson") {
    return `dc_temp/${taskId}/${Date.now()}_${Math.random().toString(36).slice(2)}${suffix}`
  }

  trackTempFile(taskId, filePath) {
    if (!this.tempFiles.has(taskId)) {
      this.tempFiles.set(taskId, new Set())
    }
    this.tempFiles.get(taskId).add(filePath)
  }

  async cleanupTaskFiles(taskId) {
    const files = this.tempFiles.get(taskId)
    if (files) {
      for (const file of files) {
        await window.api.dataClean.fs.deleteFile(file)
      }
      this.tempFiles.delete(taskId)
    }
  }
}

export const resourceManager = new ResourceManager()
