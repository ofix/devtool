import { BaseJsOperator } from "./BaseJsOperator.js"

export class JsRegexExtract extends BaseJsOperator {
  async execute(inputs, params, ctx) {
    const inputHandle = inputs[0]
    if (!inputHandle) return null

    const { sourceField, regex, newField } = params
    if (!sourceField || !regex || !newField) return inputHandle

    let regExp
    try {
      regExp = new RegExp(regex)
    } catch (e) {
      throw new Error("正则表达式不合法")
    }

    const upstreamStream = inputHandle.payload.streamDataset
    // 元数据从顶层句柄拿，符合 DataHandle 契约
    const inSchema = inputHandle.schema
    // 新建输出schema：复制上游，追加新字段
    const outSchema = [...inSchema, { name: newField, type: "string" }]
    const columnMapping = { ...inputHandle.columnMapping, [newField]: sourceField }

    const stream = async function* () {
      for await (const chunk of this.pullStream(upstreamStream, ctx.nodeId, ctx)) {
        const outRows = chunk.rows.map(row => {
          const val = String(row[sourceField] ?? "")
          const match = val.match(regExp)
          const extracted = match ? (match[1] ?? match[0]) : null
          return { ...row, [newField]: extracted }
        })
        yield { columns: outSchema, rows: outRows }
      }
    }.bind(this)

    return this.buildHandle(outSchema, columnMapping, stream())
  }
}
