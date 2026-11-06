import fs from "fs"
import path from "path"
import { app } from "electron"

const TEMP_ROOT = path.join(app.getPath("userData"), "dc_temp_files")

// 内存中的文件引用计数器 (支持多个消费者并发读)
const fileRefCounts = new Map()

class TempFileService {
    constructor() {
        if (!fs.existsSync(TEMP_ROOT)) {
            fs.mkdirSync(TEMP_ROOT, { recursive: true })
        }
        // App 启动时清理僵尸临时文件
        this._cleanZombieFiles()
    }

    _cleanZombieFiles() {
        // 简单粗暴地清空临时目录（按真实商用标准，这里应该遍历并比对状态机，或者清理 24h 前的文件）
        try {
            const files = fs.readdirSync(TEMP_ROOT)
            for (const file of files) {
                fs.rmSync(path.join(TEMP_ROOT, file), { recursive: true, force: true })
            }
        } catch (err) {
            console.error("清理僵尸文件失败", err)
        }
    }

    /**
     * 原子写入：先写 .tmp，完成后再 rename
     */
    async atomicWrite(fileName, dataArray) {
        const finalPath = path.join(TEMP_ROOT, fileName)
        const tmpPath = `${finalPath}.tmp`
        
        try {
            // 写入临时文件
            await fs.promises.writeFile(tmpPath, dataArray, "utf8")
            // 原子重命名
            await fs.promises.rename(tmpPath, finalPath)
            return finalPath
        } catch (err) {
            // 失败清理
            if (fs.existsSync(tmpPath)) {
                await fs.promises.unlink(tmpPath).catch(() => {})
            }
            throw err
        }
    }

    /**
     * 获取文件读取流 (支持引用计数)
     */
    createReadStream(filePath) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`文件不存在: ${filePath}`)
        }

        const currentCount = fileRefCounts.get(filePath) || 0
        fileRefCounts.set(filePath, currentCount + 1)

        const stream = fs.createReadStream(filePath, { encoding: "utf8" })
        
        // 监听流关闭，减少引用计数
        stream.on("close", () => {
            const count = fileRefCounts.get(filePath) - 1
            if (count <= 0) {
                fileRefCounts.delete(filePath)
                // 引用清零，可以安全删除
                this.safeDelete(filePath)
            } else {
                fileRefCounts.set(filePath, count)
            }
        })

        return stream
    }

    /**
     * 安全删除：只在引用计数为 0 时物理删除
     */
    async safeDelete(filePath) {
        if ((fileRefCounts.get(filePath) || 0) > 0) {
            return // 还有人在读，不能删
        }
        try {
            if (fs.existsSync(filePath)) {
                await fs.promises.unlink(filePath)
            }
        } catch (err) {
            console.error("删除文件失败", err)
        }
    }
}

export const tempFileService = new TempFileService()