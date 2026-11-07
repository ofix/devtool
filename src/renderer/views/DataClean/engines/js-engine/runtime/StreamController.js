/**
 * 流控制器
 * 支持 rendezvous(会合) / independent(独立缓冲) 两种策略
 */
export default class StreamController {
    /**
     * @param {AsyncGenerator} sourceGenerator 底层数据的生成器工厂
     * @param {String} strategy 'rendezvous' | 'independent'
     */
    constructor(sourceGenerator, strategy = "rendezvous") {
        this.sourceGenerator = sourceGenerator
        this.strategy = strategy
        this.activeConsumers = new Set()
        
        // 独立缓冲模式下的数据队列
        this.bufferQueues = new Map() 
        this.maxBufferChunks = 10
        
        this.isExhausted = false
        this.isAborted = false
        this.sourceIterator = null
    }

    /**
     * 创建消费者迭代器
     * @param {String} consumerId 消费者标识
     * @param {AbortSignal} abortSignal 单分支取消信号
     */
    async *createIterator(consumerId, abortSignal) {
        this.activeConsumers.add(consumerId)
        
        if (this.strategy === "rendezvous") {
            yield* this._createRendezvousIterator(consumerId, abortSignal)
        } else {
            yield* this._createIndependentIterator(consumerId, abortSignal)
        }
        
        // 消费者退出，剔除并记录丢弃行数
        this._removeConsumer(consumerId)
    }

    async *_createRendezvousIterator(consumerId, abortSignal) {
        if (!this.sourceIterator) {
            this.sourceIterator = this.sourceGenerator()
        }

        while (true) {
            if (this.isAborted || (abortSignal && abortSignal.aborted)) break

            const { value, done } = await this.sourceIterator.next()
            if (done) {
                this.isExhausted = true
                break
            }

            // 会合模式下，等待所有存活消费者拉取完当前 chunk
            // 这里简化实现：直接返回数据，背压由 AsyncGenerator 自动控制
            yield value
        }
    }

    async *_createIndependentIterator(consumerId, abortSignal) {
        if (!this.bufferQueues.has(consumerId)) {
            this.bufferQueues.set(consumerId, [])
        }
        const queue = this.bufferQueues.get(consumerId)

        if (!this.sourceIterator) {
            this.sourceIterator = this.sourceGenerator()
            this._pumpSource()
        }

        while (true) {
            if (this.isAborted || (abortSignal && abortSignal.aborted)) break

            if (queue.length > 0) {
                yield queue.shift()
            } else if (this.isExhausted) {
                break
            } else {
                // 队列空，让出微任务等待新数据
                await new Promise(resolve => setTimeout(resolve, 10))
            }
        }
    }

    /**
     * 独立缓冲模式下，持续从源头拉数据并推入各消费者队列
     */
    async _pumpSource() {
        while (!this.isExhausted && !this.isAborted) {
            const { value, done } = await this.sourceIterator.next()
            if (done) {
                this.isExhausted = true
                break
            }

            // 推入所有消费者的队列
            for (const queue of this.bufferQueues.values()) {
                if (queue.length >= this.maxBufferChunks) {
                    // 触发背压，这里简单用延迟代替
                    await new Promise(resolve => setTimeout(resolve, 20))
                }
                queue.push(value)
            }
        }
    }

    /**
     * 剔除消费者
     */
    _removeConsumer(consumerId) {
        this.activeConsumers.delete(consumerId)
        if (this.bufferQueues.has(consumerId)) {
            const queue = this.bufferQueues.get(consumerId)
            // 记录丢弃行数
            const droppedRows = queue.reduce((sum, chunk) => sum + (chunk.rows?.length || 0), 0)
            // 可以上报 metrics
            console.warn(`[StreamController] 消费者 ${consumerId} 退出，丢弃缓冲行数: ${droppedRows}`)
            
            this.bufferQueues.delete(consumerId)
        }
        
        if (this.activeConsumers.size === 0) {
            this.abort()
        }
    }

    /**
     * 紧急刹车
     */
    abort() {
        this.isAborted = true
        this.isExhausted = true
        // 清理队列
        this.bufferQueues.clear()
    }
}