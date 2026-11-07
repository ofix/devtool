import { BaseJsOperator } from "./BaseJsOperator.js"

export class JsSummarize extends BaseJsOperator {
  async execute(inputs, params, ctx) {
    const inputData = inputs[0]
    if (!inputData) return null

    // 👇 核心修复 1：精准提取真实的流
    const streamDataset = inputData.payload.streamDataset

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
    if (aggConfigs.length === 0) return inputData

    const outCols = groupFields.map(f => ({ name: f, type: "string" }))
    for (const cfg of aggConfigs) {
      outCols.push({ name: `${cfg.field}_${cfg.func}`, type: "number" })
    }
    const columnMapping = { ...inputData.columnMapping }

    const generator = async function* (self) {
      const groups = new Map()

      // 1. 流式接收并聚合
      // 👇 核心修复 2：传入 streamDataset
      for await (const chunk of self.pullStream(streamDataset, ctx.nodeId, ctx)) {
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
            const state = group.aggs[aggKey]

            if (!isNaN(val)) {
              state.sum += val
              state.count++
              state.min = Math.min(state.min, val)
              state.max = Math.max(state.max, val)
            }
          }
        }
      }

      // 2. 结算并输出
      const outRows = []
      for (const { base, aggs } of groups.values()) {
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

      // 分块吐出
      for (let i = 0; i < outRows.length; i += 5000) {
        yield { columns: outCols, rows: outRows.slice(i, i + 5000) }
        await new Promise(r => setTimeout(r, 0))
      }
    }

    return this.buildHandle(outCols, columnMapping, generator.bind(null, this))
  }
}
