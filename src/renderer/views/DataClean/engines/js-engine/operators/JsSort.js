import { BaseJsOperator } from "./BaseJsOperator.js"
import { resourceManager } from "../../../core/runtime/ResourceManager.js"

/**
 * 极简最小堆实现（保持不变）
 */
class MinHeap {
  constructor(comparator) {
    this.heap = []
    this.comparator = comparator
  }
  isEmpty() {
    return this.heap.length === 0
  }
  push(item) {
    this.heap.push(item)
    this._bubbleUp(this.heap.length - 1)
  }
  pop() {
    if (this.isEmpty()) return null
    const top = this.heap[0]
    const bottom = this.heap.pop()
    if (this.heap.length > 0) {
      this.heap[0] = bottom
      this._sinkDown(0)
    }
    return top
  }
  _bubbleUp(idx) {
    while (idx > 0) {
      const parentIdx = Math.floor((idx - 1) / 2)
      if (this.comparator(this.heap[idx].row, this.heap[parentIdx].row) < 0) {
        ;[this.heap[idx], this.heap[parentIdx]] = [this.heap[parentIdx], this.heap[idx]]
        idx = parentIdx
      } else break
    }
  }
  _sinkDown(idx) {
    const length = this.heap.length
    while (true) {
      let leftIdx = 2 * idx + 1
      let rightIdx = 2 * idx + 2
      let swapIdx = -1

      if (leftIdx < length && this.comparator(this.heap[leftIdx].row, this.heap[idx].row) < 0) {
        swapIdx = leftIdx
      }
      if (
        rightIdx < length &&
        this.comparator(
          this.heap[rightIdx].row,
          swapIdx === -1 ? this.heap[idx].row : this.heap[swapIdx].row,
        ) < 0
      ) {
        swapIdx = rightIdx
      }
      if (swapIdx === -1) break
      ;[this.heap[idx], this.heap[swapIdx]] = [this.heap[swapIdx], this.heap[idx]]
      idx = swapIdx
    }
  }
}

export class JsSort extends BaseJsOperator {
  async execute(inputs, params, ctx) {
    const inputData = inputs[0]
    if (!inputData) return null

    const streamDataset = inputData.payload.streamDataset
    const { sortField, order = "asc", nullPosition = "last" } = params
    if (!sortField) return inputData

    const BUFFER_LIMIT = 100 * 1024 * 1024 // 100MB

    const generator = async function* (self) {
      let memoryBuffer = []
      let currentMemoryBytes = 0
      const tempFilePaths = []

      const comparator = (a, b) => {
        let valA = a[sortField]
        let valB = b[sortField]
        if (valA === null || valA === undefined) return nullPosition === "first" ? -1 : 1
        if (valB === null || valB === undefined) return nullPosition === "first" ? 1 : -1
        let result = 0
        if (typeof valA === "number" && typeof valB === "number") {
          result = valA - valB
        } else {
          result = String(valA).localeCompare(String(valB))
        }
        return order === "asc" ? result : -result
      }

      // 1. 分块排序并溢写磁盘
      for await (const chunk of self.pullStream(streamDataset, ctx.nodeId, ctx)) {
        if (ctx.signal.aborted) return

        for (const row of chunk.rows) {
          memoryBuffer.push(row)
          currentMemoryBytes += JSON.stringify(row).length

          if (currentMemoryBytes >= BUFFER_LIMIT) {
            memoryBuffer.sort(comparator)
            const dataToWrite = memoryBuffer.map(r => JSON.stringify(r)).join("\n")
            const fileName = `${ctx.taskId}_sort_${Date.now()}.ndjson`
            const tempPath = await window.api.dataClean.tempFile.atomicWrite(
              ctx.taskId,
              fileName,
              dataToWrite,
            )
            tempFilePaths.push(tempPath)
            memoryBuffer = []
            currentMemoryBytes = 0
            if (ctx.log) ctx.log(`[Sort] 溢写临时文件: ${fileName}`)
          }
        }
        await new Promise(resolve => setTimeout(resolve, 0))
      }

      // 2. 处理剩下的内存数据
      if (memoryBuffer.length > 0) {
        memoryBuffer.sort(comparator)
        const dataToWrite = memoryBuffer.map(r => JSON.stringify(r)).join("\n")
        const fileName = `${ctx.taskId}_sort_${Date.now()}.ndjson`
        const tempPath = await window.api.dataClean.tempFile.atomicWrite(
          ctx.taskId,
          fileName,
          dataToWrite,
        )
        tempFilePaths.push(tempPath)
        memoryBuffer = []
      }

      if (tempFilePaths.length === 0) return

      // 3. 多路归并
      const fileIterators = tempFilePaths.map(path => createFileIterator(path))
      const minHeap = new MinHeap(comparator)

      for (let i = 0; i < fileIterators.length; i++) {
        const { value, done } = await fileIterators[i].next()
        if (!done) minHeap.push({ row: value, fileIdx: i })
      }

      // 逐行吐出
      while (!minHeap.isEmpty()) {
        if (ctx.signal.aborted) return
        const { row, fileIdx } = minHeap.pop()
        yield { columns: inputData.schema, rows: [row] }

        const { value, done } = await fileIterators[fileIdx].next()
        if (!done) minHeap.push({ row: value, fileIdx })
      }

      // 清理临时文件
      for (const filePath of tempFilePaths) {
        await window.api.dataClean.tempFile.cleanupTask(ctx.taskId)
      }
    }

    return this.buildHandle(inputData.schema, inputData.columnMapping, generator.bind(null, this))
  }
}

/**
 * 辅助函数：读取单个临时文件
 */
async function* createFileIterator(filePath) {
  let buffer = ""
  let pendingRows = []
  let isDone = false

  window.api.dataClean.tempFile.readStream(
    filePath,
    chunk => {
      buffer += chunk
      const lines = buffer.split("\n")
      buffer = lines.pop()
      for (const line of lines) {
        if (line.trim()) pendingRows.push(JSON.parse(line))
      }
    },
    () => {
      isDone = true
    },
    err => {
      console.error("读取临时文件失败", err)
      isDone = true
    },
  )

  while (true) {
    if (pendingRows.length > 0) {
      yield pendingRows.shift()
    } else if (isDone) {
      break
    } else {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  }
}
