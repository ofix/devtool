import { BaseJsOperator } from "./BaseJsOperator.js"

export class JsSelect extends BaseJsOperator {
  async execute(inputs, params, ctx) {
    const inputData = inputs[0]
    if (!inputData) return null

    // 👇 核心修复 1：获取正确的流和 schema
    const streamDataset = inputData.payload.streamDataset
    const originalSchema = inputData.schema

    let keepCols = params.columns || []
    if (keepCols.length === 0) keepCols = originalSchema.map(c => c.name)

    const renameMap = {}
    if (params.renameMap && params.renameMap.trim()) {
      params.renameMap.split(",").forEach(pair => {
        const [oldName, newName] = pair.split(":").map(s => s.trim())
        if (oldName && newName) renameMap[oldName] = newName
      })
    }

    const outCols = []
    const columnMapping = {}
    for (const c of originalSchema) {
      if (keepCols.includes(c.name)) {
        const newName = renameMap[c.name] || c.name
        outCols.push({ name: newName, type: c.type })
        columnMapping[newName] = c.name
      }
    }

    const generator = async function* (self) {
      // 👇 核心修复 2：传入 streamDataset
      for await (const chunk of self.pullStream(streamDataset, ctx.nodeId, ctx)) {
        const outRows = chunk.rows.map(row => {
          const newRow = {}
          for (const c of originalSchema) {
            if (keepCols.includes(c.name)) {
              const newName = renameMap[c.name] || c.name
              newRow[newName] = row[c.name]
            }
          }
          return newRow
        })
        yield { columns: outCols, rows: outRows }
      }
    }

    return this.buildHandle(outCols, columnMapping, generator.bind(null, this))
  }
}
