import { BaseJsOperator } from "./BaseJsOperator.js"

function getValueByPath(obj, path) {
  if (!path) return obj
  const cleanPath = path.trim().replace(/^\./, "")
  const parts = cleanPath.split(/\.|\[|\]/).filter(Boolean)
  let current = obj
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    current = current[part]
  }
  return current
}

export class JsJsonExtract extends BaseJsOperator {
  async execute(inputs, params, ctx) {
    const inputData = inputs[0]
    if (!inputData) throw new Error("未接收到 JSON 数据")

    // 👇 核心修复 1：获取上游的完整 JSON
    const inputJson = await this.getUpstreamJson(inputData)
    const dataArray = Array.isArray(inputJson) ? inputJson : [inputJson]

    const fields = params.fields || []
    if (fields.length === 0) throw new Error("请至少选择一个提取字段")

    const outCols = fields.map(f => ({ name: f.alias || f.path, type: "string" }))
    const columnMapping = {}
    fields.forEach(f => (columnMapping[f.alias || f.path] = f.path))

    const generator = async function* () {
      const outRowsBuffer = []
      const MAX_BUFFER = 5000

      for (const item of dataArray) {
        if (ctx.signal.aborted) return

        const newRow = {}
        for (const f of fields) {
          newRow[f.alias || f.path] = getValueByPath(item, f.path)
        }
        outRowsBuffer.push(newRow)

        // 分批吐出，防止一次性撑爆
        if (outRowsBuffer.length >= MAX_BUFFER) {
          yield { columns: outCols, rows: outRowsBuffer.splice(0, MAX_BUFFER) }
          await new Promise(r => setTimeout(r, 0))
        }
      }

      if (outRowsBuffer.length > 0) {
        yield { columns: outCols, rows: outRowsBuffer }
      }
    }

    if (ctx.log) ctx.log(`[JsJsonExtract] 开始提取字段，共 ${fields.length} 个`)

    // 👇 核心修复 2：返回标准的 Table 句柄
    return this.buildHandle(outCols, columnMapping, generator.bind(null, this))
  }
}
