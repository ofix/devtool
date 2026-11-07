import { BaseJsOperator } from "./BaseJsOperator.js"

export class JsCrossTab extends BaseJsOperator {
  async execute(inputs, params, ctx) {
    const inputData = inputs[0]
    if (!inputData) return null
    const data = inputData.payload

    const { rowField, colField, valField, aggFunc = "SUM" } = params
    if (!rowField || !colField || !valField) return inputData

    const generator = async function* (self) {
      const pivotMap = new Map()
      const uniqueCols = new Set()

      for await (const chunk of self.pullStream(data, ctx.nodeId, ctx)) {
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
        }
      }

      // 动态生成输出列
      const colArray = Array.from(uniqueCols).slice(0, 100) // 限制 100 列防炸
      const outCols = [
        { name: rowField, type: "string" },
        ...colArray.map(c => ({ name: String(c), type: "number" })),
      ]

      const outRows = []
      for (const [rKey, pRow] of pivotMap.entries()) {
        const newRow = { [rowField]: rKey }
        for (const c of colArray) {
          const state = pRow[c]
          if (!state) newRow[c] = null
          else if (aggFunc === "SUM") newRow[c] = state.sum
          else if (aggFunc === "COUNT") newRow[c] = state.count
        }
        outRows.push(newRow)
      }

      for (let i = 0; i < outRows.length; i += 5000) {
        yield { columns: outCols, rows: outRows.slice(i, i + 5000) }
        await new Promise(r => setTimeout(r, 0))
      }
    }

    return this.buildHandle(
      [{ name: rowField, type: "string" }],
      inputData.columnMapping,
      generator.bind(null, this),
    )
  }
}
