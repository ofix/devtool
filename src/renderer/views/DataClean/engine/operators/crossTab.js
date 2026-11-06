import { DATA_CATEGORY } from "../../constants/DataCategories.js"
import StreamDataset from "../runtime/StreamDataset.js"
import StreamController from "../runtime/StreamController.js"
import { resourceManager } from "../runtime/ResourceManager.js"

export default {
  type: "crossTab",
  meta: {
    label: "Cross Tab",
    icon: "IconGrid",
    color: "#f43f5e",
    category: "transform",
    inputs: 1,
    outputs: 1,
    inputCategory: DATA_CATEGORY.TABLE,
    outputCategory: DATA_CATEGORY.TABLE,
  },
  schema: [
    { field: "rowField", label: "行字段", component: "fieldSelect" },
    { field: "colField", label: "列字段", component: "fieldSelect" },
    { field: "valField", label: "值字段", component: "fieldSelect" },
    { field: "aggFunc", label: "聚合函数", component: "select", options: [{label: "SUM", value: "SUM"}, {label: "COUNT", value: "COUNT"}] },
  ],
  async execute(inputs, params, ctx) {
    const data = inputs[0]
    if (!data) return null

    const { rowField, colField, valField, aggFunc = "SUM" } = params
    if (!rowField || !colField || !valField) return data

    async function* crossTabGenerator() {
        let pivotMap = new Map()
        let uniqueCols = new Set()
        let currentBytes = 0
        const MEMORY_LIMIT = 50 * 1024 * 1024 // 50MB
        const tempFilePaths = []

        const controller = new StreamController(data.controller.sourceGenerator, "rendezvous")
        const iterator = controller.createIterator('crosstab-node', ctx.signal)

        // 辅助函数：将内存 Map 溢写磁盘
        const spillToDisk = async () => {
            if (pivotMap.size === 0) return
            const filePath = await resourceManager.createTempFilePath(ctx.taskId)
            const stream = window.api.dataClean.tempFile.createWriteStream(filePath)
            
            for (const [rKey, pRow] of pivotMap.entries()) {
                stream.write(JSON.stringify({ rKey, pRow }) + "\n")
            }
            stream.end()
            tempFilePaths.push(filePath)
            pivotMap.clear()
            currentBytes = 0
        }

        // 1. 流式处理
        for await (const chunk of iterator) {
            if (ctx.signal.aborted) return
            
            for (const row of chunk.rows) {
                const rKey = String(row[rowField])
                const cKey = String(row[colField])
                const val = Number(row[valField])

                uniqueCols.add(cKey)

                if (!pivotMap.has(rKey)) pivotMap.set(rKey, {})
                const pRow = pivotMap.get(rKey)

                if (!pRow[cKey]) pRow[cKey] = { sum: 0, count: 0 }
                const state = pRow[cKey]
                if (!isNaN(val)) state.sum += val
                state.count++
                
                currentBytes += 100 // 粗略估算
            }

            if (currentBytes > MEMORY_LIMIT) {
                await spillToDisk()
            }
            await new Promise(resolve => setTimeout(resolve, 0))
        }

        if (pivotMap.size > 0) await spillToDisk()

        // 2. 全局合并：从各个分区文件合并数据
        const finalPivotMap = new Map()
        if (tempFilePaths.length > 0) {
            for (const path of tempFilePaths) {
                const fileIt = createFileIterator(path)
                for await (const item of fileIt) {
                    if (!finalPivotMap.has(item.rKey)) {
                        finalPivotMap.set(item.rKey, item.pRow)
                    } else {
                        const existing = finalPivotMap.get(item.rKey)
                        for (const c in item.pRow) {
                            if (!existing[c]) existing[c] = { sum: 0, count: 0 }
                            existing[c].sum += item.pRow[c].sum
                            existing[c].count += item.pRow[c].count
                        }
                    }
                }
            }
        }

        const colArray = Array.from(uniqueCols).slice(0, 100) // 动态列最多 100 列
        const outCols = [
            { name: rowField, type: "string" },
            ...colArray.map(c => ({ name: String(c), type: "number" })),
        ]

        // 3. 构建输出
        const outRows = []
        for (const [rKey, pRow] of finalPivotMap.entries()) {
            const newRow = { [rowField]: rKey }
            for (const c of colArray) {
                const state = pRow[c]
                if (!state) newRow[c] = null
                else if (aggFunc === "SUM") newRow[c] = state.sum
                else if (aggFunc === "COUNT") newRow[c] = state.count
            }
            outRows.push(newRow)
        }

        // 清理临时文件
        for (const path of tempFilePaths) {
            await window.api.dataClean.tempFile.cleanupFile(path)
        }

        // 4. 分块吐出
        for (let i = 0; i < outRows.length; i += 1000) {
            yield { columns: outCols, rows: outRows.slice(i, i + 1000) }
            await new Promise(resolve => setTimeout(resolve, 0))
        }
    }

    // 动态列，初始只能给一个骨架
    return new StreamDataset({
        dataCategory: DATA_CATEGORY.TABLE,
        columns: [{ name: rowField, type: "string" }], 
        controller: { sourceGenerator: crossTabGenerator, strategy: "rendezvous" },
        columnMapping: { [rowField]: rowField }
    })
  }
}

/**
 * 辅助：读取临时文件迭代器
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
      () => {
        isDone = true
      },
    )
  
    while (true) {
      if (pendingRows.length > 0) yield pendingRows.shift()
      else if (isDone) break
      else await new Promise(resolve => setTimeout(resolve, 10))
    }
  }
  