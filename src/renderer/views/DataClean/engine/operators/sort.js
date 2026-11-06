import { DATA_CATEGORY } from "../../constants/DataCategories.js"
import StreamDataset from "../runtime/StreamDataset.js"
import StreamController from "../runtime/StreamController.js"
import { resourceManager } from "../runtime/ResourceManager.js"

export default {
  type: "sort",
  meta: {
    label: "Sort",
    icon: "IconSort",
    color: "#10b981",
    category: "transform",
    inputs: 1,
    outputs: 1,
    inputCategory: DATA_CATEGORY.TABLE,
    outputCategory: DATA_CATEGORY.TABLE,
  },
  schema: [
    { field: "sortField", label: "排序列", component: "fieldSelect", multiple: false },
    { field: "order", label: "排序方向", component: "select", options: [{label: "升序", value: "asc"}, {label: "降序", value: "desc"}], defaultValue: "asc" },
    { field: "stable", label: "稳定排序", component: "switch", defaultValue: false },
    { field: "nullPosition", label: "空值位置", component: "select", options: [{label: "排在最前", value: "first"}, {label: "排在最后", value: "last"}], defaultValue: "last" },
  ],
  
  async execute(inputs, params, ctx) {
    const data = inputs[0]
    if (!data) return null

    const { sortField, order = "asc", stable = false, nullPosition = "last" } = params
    if (!sortField) return data

    // 内存缓冲区（以字节数为阈值，而不是以行数）
    const BUFFER_LIMIT = 100 * 1024 * 1024 // 100MB
    
    async function* sortGenerator() {
      let memoryBuffer = []
      let currentMemoryBytes = 0
      const tempFilePaths = []

      const controller = new StreamController(data.controller.sourceGenerator, "rendezvous")
      const iterator = controller.createIterator('sort-node', ctx.signal)

      // 排序比较器
      const comparator = (a, b) => {
        let valA = a[sortField]
        let valB = b[sortField]
        
        // 处理 null 值
        if (valA === null || valA === undefined) return nullPosition === "first" ? -1 : 1
        if (valB === null || valB === undefined) return nullPosition === "first" ? 1 : -1
        
        let result = 0
        if (typeof valA === 'number' && typeof valB === 'number') {
          result = valA - valB
        } else {
          result = String(valA).localeCompare(String(valB))
        }
        return order === "asc" ? result : -result
      }

      // 1. 分块排序并溢写磁盘
      for await (const chunk of iterator) {
        if (ctx.signal.aborted) return

        for (const row of chunk.rows) {
          memoryBuffer.push(row)
          currentMemoryBytes += JSON.stringify(row).length
          
          if (currentMemoryBytes >= BUFFER_LIMIT) {
            memoryBuffer.sort(comparator)
            // 序列化为 NDJSON
            const dataToWrite = memoryBuffer.map(r => JSON.stringify(r)).join("\n")
            const fileName = `${ctx.taskId}_sort_${Date.now()}.ndjson`
            
            // 原子写入临时文件
            const tempPath = await window.api.dataClean.tempFile.atomicWrite(ctx.taskId, fileName, dataToWrite)
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
        const tempPath = await window.api.dataClean.tempFile.atomicWrite(ctx.taskId, fileName, dataToWrite)
        tempFilePaths.push(tempPath)
        memoryBuffer = []
      }

      // 3. 多路归并
      if (tempFilePaths.length === 0) {
        // 数据太小，或者空表
        return
      }

      // 打开所有临时文件的迭代器
      const fileIterators = []
      for (const filePath of tempFilePaths) {
        // 这里使用一个简单的异步生成器读取
        const fileIt = createFileIterator(filePath)
        fileIterators.push(fileIt)
      }

      // 最小堆逻辑实现
      const minHeap = new MinHeap(comparator)
      const activeHeapNodes = []

      for (let i = 0; i < fileIterators.length; i++) {
        const { value, done } = await fileIterators[i].next()
        if (!done) {
          minHeap.push({ row: value, fileIdx: i })
        }
      }

      // 逐行弹出并输出
      while (!minHeap.isEmpty()) {
        const { row, fileIdx } = minHeap.pop()
        yield { columns: data.columns, rows: [row] } // 为保证严格顺序，逐行吐出

        const { value, done } = await fileIterators[fileIdx].next()
        if (!done) {
          minHeap.push({ row: value, fileIdx })
        }
      }

      // 清理临时文件
      for (const filePath of tempFilePaths) {
        await window.api.dataClean.tempFile.cleanupTask(ctx.taskId)
      }
    }

    return new StreamDataset({
      dataCategory: DATA_CATEGORY.TABLE,
      columns: data.columns,
      controller: { sourceGenerator: sortGenerator, strategy: "rendezvous" }
    })
  }
}

/**
 * 辅助函数：读取单个临时文件（NDJSON）的异步生成器
 */
async function* createFileIterator(filePath) {
  let buffer = ""
  let pendingRows = []
  let isDone = false
  
  // 这里使用回调方式与主进程通信
  window.api.dataClean.tempFile.readStream(
    filePath,
    (chunk) => {
      buffer += chunk
      const lines = buffer.split("\n")
      buffer = lines.pop() // 最后一行可能不完整
      for (const line of lines) {
        if (line.trim()) {
          pendingRows.push(JSON.parse(line))
        }
      }
    },
    () => { isDone = true },
    (err) => { console.error("读取临时文件失败", err); isDone = true }
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

/**
 * 极简最小堆实现
 */
class MinHeap {
  constructor(comparator) { this.heap = []; this.comparator = comparator }
  isEmpty() { return this.heap.length === 0 }
  peek() { return this.heap[0] }
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
        [this.heap[idx], this.heap[parentIdx]] = [this.heap[parentIdx], this.heap[idx]]
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
      
      if (leftIdx < length) {
        if (this.comparator(this.heap[leftIdx].row, this.heap[idx].row) < 0) {
          swapIdx = leftIdx
        }
      }
      if (rightIdx < length) {
        if (this.comparator(this.heap[rightIdx].row, (swapIdx === -1 ? this.heap[idx].row : this.heap[swapIdx].row)) < 0) {
          swapIdx = rightIdx
        }
      }
      if (swapIdx === -1) break
      [this.heap[idx], this.heap[swapIdx]] = [this.heap[swapIdx], this.heap[idx]]
      idx = swapIdx
    }
  }
}