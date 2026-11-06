import Papa from "papaparse"
import { resourceManager } from "./ResourceManager.js"

export default class CsvStreamParser {
    /**
     * @param {String} filePath 文件绝对路径
     * @param {Object} taskContext 任务上下文 (包含 signal 和 metrics)
     * @param {Object} options 额外配置
     */
    constructor(filePath, taskContext, options = {}) {
        this.filePath = filePath
        this.ctx = taskContext
        this.encoding = options.encoding || "utf-8"
        
        this.streamId = null
        this.decoder = new TextDecoder(this.encoding)
        
        this.textBuffer = ""
        this.pendingRows = []
        this.isDone = false
        this.isStreamStopped = false
        
        // 表头与元数据
        this.columns = []
        this.resolveHeaderReady = null
        this.headerReadyPromise = new Promise(resolve => { this.resolveHeaderReady = resolve })
        
        // 背压唤醒
        this.currentResolver = null
    }

    /**
     * 启动解析器 (接驳主进程)
     */
    async start() {
        // 注册信号监听，一旦用户取消立刻止损
        this.ctx.signal.addEventListener("abort", () => this.stop(), { once: true })

        // 向主进程申请流通道
        this.streamId = await window.api.dataClean.fs.startStream(this.filePath)

        // 注册底层回调
        const removeData = window.api.dataClean.fs.onStreamData(this.streamId, chunk => {
            if (this.isStreamStopped) return
            this.ctx.markFirstChunk()
            
            // 流式解码，解决中文跨块截断
            const text = this.decoder.decode(chunk, { stream: true })
            if (text) this._processText(text)
        })

        const removeEnd = window.api.dataClean.fs.onStreamEnd(this.streamId, () => {
            this.isDone = true
            if (this.textBuffer.trim()) {
                this._parseChunk(this.textBuffer, false) // 解析末尾残余
            }
            this._wakeupConsumer()
        })

        const removeErr = window.api.dataClean.fs.onStreamError(this.streamId, err => {
            console.error("[CsvParser] 底层流异常:", err)
            this.isDone = true
            this._wakeupConsumer()
            this.resolveHeaderReady() // 防止异常卡死
        })

        // 挂载清理器
        this.ctx.onDestroy = () => {
            removeData(); removeEnd(); removeErr()
        }
    }

    /**
     * 处理文本，解决跨块行截断
     */
    _processText(text) {
        this.textBuffer += text
        const lastNewlineIndex = this.textBuffer.lastIndexOf("\n")
        if (lastNewlineIndex === -1) return

        const completeText = this.textBuffer.slice(0, lastNewlineIndex + 1)
        this.textBuffer = this.textBuffer.slice(lastNewlineIndex + 1)
        
        this._parseChunk(completeText, true)
    }

    /**
     * 调用 Papa 解析，提取表头并填充缓冲
     */
    _parseChunk(textToParse, checkHeader = true) {
        Papa.parse(textToParse, {
            header: true,
            skipEmptyLines: true,
            step: (results) => {
                // 第一次抓取到表头，标记就绪并广播
                if (checkHeader && this.columns.length === 0 && results.meta.fields) {
                    this.columns = results.meta.fields.map(name => ({ name, type: "string" }))
                    this.resolveHeaderReady()
                }
                this.pendingRows.push(results.data)
            },
            complete: () => {
                this._wakeupConsumer()
            }
        })
    }

    /**
     * 唤醒挂起的下游消费者 (核心 Pull 机制)
     */
    _wakeupConsumer() {
        if (!this.currentResolver) return

        if (this.pendingRows.length > 0) {
            const chunk = this.pendingRows
            this.pendingRows = []
            this.currentResolver({ value: chunk, done: false })
            this.currentResolver = null
        } else if (this.isDone) {
            this.currentResolver({ done: true })
            this.currentResolver = null
        }
    }

    /**
     * 对外暴露的异步迭代器（下游算子直接调用）
     */
    async *createIterator() {
        await this.headerReadyPromise // 保证 UI 能够先拿到列名

        try {
            while (true) {
                if (this.ctx.signal.aborted) return

                if (this.pendingRows.length > 0) {
                    const chunk = this.pendingRows
                    this.pendingRows = []
                    // 记录 metrics
                    this.ctx.metrics.mainRows += chunk.length 
                    yield chunk
                } else if (this.isDone) {
                    break
                } else {
                    // 缓冲区为空，挂起等待唤醒
                    const next = await new Promise(resolve => { this.currentResolver = resolve })
                    if (next.done) break
                    this.ctx.metrics.mainRows += next.value.length
                    yield next.value
                }
            }
        } finally {
            // 如果下游提前 break (take 1000 达成) 或发生异常，触发 finally
            this.stop()
        }
    }

    /**
     * 彻底刹车，关闭 IPC 通道并清理
     */
    stop() {
        if (this.isStreamStopped) return
        this.isStreamStopped = true

        if (this.streamId) {
            window.api.dataClean.fs.abortStream(this.streamId)
        }
        if (this.ctx.onDestroy) {
            this.ctx.onDestroy()
        }
        // 让可能还在挂起的 resolve 收到结束信号，防止泄漏
        if (this.currentResolver) {
            this.currentResolver({ done: true })
            this.currentResolver = null
        }
    }
}