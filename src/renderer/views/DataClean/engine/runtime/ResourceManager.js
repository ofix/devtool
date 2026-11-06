/**
 * 资源管家（单例模式）
 * 负责：临时文件生命周期、磁盘水位、内存仲裁
 */
class ResourceManager {
    constructor() {
        this.allocatedMemory = 0
        this.maxMemory = 512 * 1024 * 1024 // 默认 512MB
        this.diskWatermark = {
            warn: 0.8,  // 80% 告警
            critical: 0.95 // 95% 阻断
        }
        this.tempFiles = new Map() // key: taskId, value: Set<filePath>
    }

    /**
     * 申请内存（软限制）
     * @param {Number} bytes 
     * @param {TaskContext} ctx 
     */
    async requestMemory(bytes, ctx) {
        if (this.allocatedMemory + bytes > this.maxMemory) {
            // 这里可以触发低优任务的 suspend 信号
            // 但为了防止死锁，当前直接抛出 OOM 异常由算子自行溢写
            throw new Error("MEMORY_LIMIT_EXCEEDED")
        }
        this.allocatedMemory += bytes
    }

    releaseMemory(bytes) {
        this.allocatedMemory = Math.max(0, this.allocatedMemory - bytes)
    }

    /**
     * 生成临时文件路径（带有 taskId 隔离）
     */
    getTempFilePath(taskId, suffix = ".ndjson") {
        // 主进程实际创建时应该加上 .tmp
        return `dc_temp/${taskId}/${Date.now()}_${Math.random().toString(36).slice(2)}${suffix}`
    }

    /**
     * 记录临时文件
     */
    trackTempFile(taskId, filePath) {
        if (!this.tempFiles.has(taskId)) {
            this.tempFiles.set(taskId, new Set())
        }
        this.tempFiles.get(taskId).add(filePath)
    }

    /**
     * 清理特定任务的所有临时文件
     * 注意：这里需要等待三态机进入 finish 才能删除，实际代码在主进程做
     */
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