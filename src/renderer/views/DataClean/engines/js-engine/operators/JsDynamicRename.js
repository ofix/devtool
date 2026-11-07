import { BaseJsOperator } from "./BaseJsOperator.js"

export class JsDynamicRename extends BaseJsOperator {
  async execute(inputs, params, ctx) {
    const inputData = inputs[0]
    if (!inputData) return null

    // 👇 核心修复 1：从 DataHandle 中提取真实的流和 schema
    const streamDataset = inputData.payload.streamDataset
    const originalSchema = inputData.schema

    const renameMap = {}
    if (params.renameMap && params.renameMap.trim()) {
      params.renameMap.split(",").forEach(pair => {
        const [oldName, newName] = pair.split(":").map(s => s.trim())
        if (oldName && newName) renameMap[oldName] = newName
      })
    }

    const { prefix = "", suffix = "" } = params

    // 构建列映射
    const columnMapping = {}
    const outCols = originalSchema.map(c => {
      let name = renameMap[c.name] || c.name
      const finalName = `${prefix}${name}${suffix}`
      columnMapping[finalName] = c.name
      return { name: finalName, type: c.type }
    })

    const generator = async function* (self) {
      // 👇 核心修复 2：传入 streamDataset
      for await (const chunk of self.pullStream(streamDataset, ctx.nodeId, ctx)) {
        if (ctx.signal.aborted) return

        const outRows = chunk.rows.map(row => {
          const newRow = {}
          for (const c of originalSchema) {
            let name = renameMap[c.name] || c.name
            newRow[`${prefix}${name}${suffix}`] = row[c.name]
          }
          return newRow
        })

        yield { columns: outCols, rows: outRows }
      }
    }

    // 👇 核心修复 3：返回标准 DataHandle
    return this.buildHandle(outCols, columnMapping, generator.bind(null, this))
  }
}
