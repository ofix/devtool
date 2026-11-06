import { DATA_CATEGORY } from "../../constants/DataCategories.js"
import StreamDataset from "../runtime/StreamDataset.js"
import StreamController from "../runtime/StreamController.js"
import { resourceManager } from "../runtime/ResourceManager.js"

export default {
  type: "summarize",
  meta: {
    label: "Summarize",
    icon: "IconDataLine",
    color: "#f59e0b",
    category: "transform",
    inputs: 1,
    outputs: 1,
    inputCategory: DATA_CATEGORY.TABLE,
    outputCategory: DATA_CATEGORY.TABLE,
  },
  schema: [
    { field: "groupFields", label: "分组字段", component: "fieldSelect", multiple: true },
    { field: "aggregations", label: "聚合配置", component: "input" },
  ],
  async execute(inputs, params, ctx) {
    const data = inputs[0]
    if (!data) return null

    let groupFields = params.groupFields || []
    if (typeof groupFields === "string")
      groupFields = groupFields
        .split(",")
        .map(s => s.trim())
        .filter(Boolean)

    const aggConfigs = []
    if (params.aggregations && params.aggregations.trim()) {
      params.aggregations.split(",").forEach(pair => {
        const [field, func] = pair.split(":").map(s => s.trim())
        if (field && func) aggConfigs.push({ field, func: func.toUpperCase() })
      })
    }
    if (aggConfigs.length === 0) return data

    const outCols = groupFields.map(f => ({ name: f, type: "string" }))
    for (const cfg of aggConfigs) {
      outCols.push({ name: `${cfg.field}_${cfg.func}`, type: "number" })
    }

    async function* summarizeGenerator() {
      let groups = new Map()
      let currentBytes = 0
      const MEMORY_LIMIT = 50 * 1024 * 1024 // 50MB
      const tempFilePaths = []

      const controller = new StreamController(data.controller.sourceGenerator, "rendezvous")
      const iterator = controller.createIterator("summarize-node", ctx.signal)

      // 辅助函数：合并聚合状态
      const mergeState = (state, val) => {
        if (isNaN(val)) return
        state.sum += val
        state.count++
        state.min = Math.min(state.min, val)
        state.max = Math.max(state.max, val)
      }

      // 辅助函数：将内存 Map 溢写磁盘
      const spillToDisk = async () => {
        if (groups.size === 0) return
        const filePath = await resourceManager.createTempFilePath(ctx.taskId)
        const stream = window.api.dataClean.tempFile.createWriteStream(filePath)

        for (const [key, data] of groups.entries()) {
          stream.write(JSON.stringify({ key, ...data }) + "\n")
        }
        stream.end()
        tempFilePaths.push(filePath)
        groups.clear()
        currentBytes = 0
      }

      // 1. 流式聚合
      for await (const chunk of iterator) {
        if (ctx.signal.aborted) return

        for (const row of chunk.rows) {
          const keyVals = groupFields.map(f => String(row[f]))
          const key = keyVals.join("|||")

          if (!groups.has(key)) {
            const gRow = {}
            groupFields.forEach(f => (gRow[f] = row[f]))
            groups.set(key, { base: gRow, aggs: {} })
          }

          const group = groups.get(key)
          for (const { field, func } of aggConfigs) {
            const val = Number(row[field])
            const aggKey = `${field}_${func}`

            if (!group.aggs[aggKey])
              group.aggs[aggKey] = { sum: 0, count: 0, min: Infinity, max: -Infinity }
            mergeState(group.aggs[aggKey], val)
          }
          currentBytes += 200 // 粗略估算字节
        }

        if (currentBytes > MEMORY_LIMIT) {
          await spillToDisk()
        }
        await new Promise(resolve => setTimeout(resolve, 0))
      }

      // 2. 将剩余内存数据溢写
      if (groups.size > 0) await spillToDisk()

      // 3. 读取所有临时文件进行二次合并
      if (tempFilePaths.length > 0) {
        const finalGroups = new Map()
        for (const path of tempFilePaths) {
          const fileIt = createFileIterator(path)
          for await (const item of fileIt) {
            if (!finalGroups.has(item.key)) {
              finalGroups.set(item.key, { base: item.base, aggs: item.aggs })
            } else {
              const existing = finalGroups.get(item.key)
              for (const aggKey in item.aggs) {
                if (!existing.aggs[aggKey])
                  existing.aggs[aggKey] = { sum: 0, count: 0, min: Infinity, max: -Infinity }
                const cur = item.aggs[aggKey]
                const ext = existing.aggs[aggKey]
                ext.sum += cur.sum
                ext.count += cur.count
                ext.min = Math.min(ext.min, cur.min)
                ext.max = Math.max(ext.max, cur.max)
              }
            }
          }
        }

        // 4. 输出最终结果
        const outRows = []
        for (const { base, aggs } of finalGroups.values()) {
          const newRow = { ...base }
          for (const cfg of aggConfigs) {
            const state = aggs[`${cfg.field}_${cfg.func}`]
            if (!state) continue
            switch (cfg.func) {
              case "SUM":
                newRow[`${cfg.field}_SUM`] = state.sum
                break
              case "AVG":
                newRow[`${cfg.field}_AVG`] = state.count > 0 ? state.sum / state.count : null
                break
              case "COUNT":
                newRow[`${cfg.field}_COUNT`] = state.count
                break
              case "MIN":
                newRow[`${cfg.field}_MIN`] = state.min === Infinity ? null : state.min
                break
              case "MAX":
                newRow[`${cfg.field}_MAX`] = state.max === -Infinity ? null : state.max
                break
            }
          }
          outRows.push(newRow)
        }

        // 清理临时文件
        for (const path of tempFilePaths) {
          await window.api.dataClean.tempFile.cleanupFile(path)
        }

        // 分块吐出
        for (let i = 0; i < outRows.length; i += 1000) {
          yield { columns: outCols, rows: outRows.slice(i, i + 1000) }
          await new Promise(resolve => setTimeout(resolve, 0))
        }
      }
    }

    const columnMapping = {}
    groupFields.forEach(f => (columnMapping[f] = f))
    aggConfigs.forEach(cfg => (columnMapping[`${cfg.field}_${cfg.func}`] = [cfg.field]))

    return new StreamDataset({
      dataCategory: DATA_CATEGORY.TABLE,
      columns: outCols,
      controller: { sourceGenerator: summarizeGenerator, strategy: "rendezvous" },
      columnMapping,
    })
  },
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
