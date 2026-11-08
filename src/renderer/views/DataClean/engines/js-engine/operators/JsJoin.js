import { BaseJsOperator } from "./BaseJsOperator.js"

export class JsJoin extends BaseJsOperator {
  async execute(inputs, params, ctx) {
    const [leftData, rightData] = inputs
    if (!leftData || !rightData) throw new Error("Join 必须有两个输入")

    const { joinKeys = [], joinType = "inner" } = params
    if (joinKeys.length === 0) throw new Error("请配置连接键")

    // 合并输出列结构
    const outCols = []
    const columnMapping = {}
    for (const c of leftData.schema) {
      outCols.push({ name: c.name, type: c.type })
      columnMapping[c.name] = c.name
    }
    for (const c of rightData.schema) {
      if (!outCols.some(x => x.name === c.name)) {
        outCols.push({ name: c.name, type: c.type })
        columnMapping[c.name] = c.name
      }
    }

    const generator = async function* (self) {
      // 1. 构建阶段（拉取左表建立 Hash Map）
      const buildMap = new Map()

      for await (const chunk of self.pullStream(leftData.payload.streamDataset, ctx.nodeId, ctx)) {
        for (const row of chunk.rows) {
          const key = joinKeys.map(k => String(row[k.left])).join("|||")
          if (!buildMap.has(key)) buildMap.set(key, [])
          buildMap.get(key).push(row)
        }
      }

      // 2. 探测阶段（拉取右表进行匹配）
      const matchedLeftKeys = new Set()

      for await (const chunk of self.pullStream(rightData.payload.streamDataset, ctx.nodeId, ctx)) {
        const outRows = []
        for (const row of chunk.rows) {
          const key = joinKeys.map(k => String(row[k.right])).join("|||")
          const leftMatches = buildMap.get(key)

          if (leftMatches) {
            matchedLeftKeys.add(key)
            for (const leftRow of leftMatches) {
              outRows.push({ ...leftRow, ...row })
            }
          } else if (joinType === "right" || joinType === "full") {
            outRows.push({ ...row })
          }
        }
        if (outRows.length > 0) {
          yield { columns: outCols, rows: outRows }
        }
      }

      // 3. 补全 Left/Full Join 的左侧未匹配行
      if (joinType === "left" || joinType === "full") {
        const unmatchedLeftRows = []
        for (const [key, rows] of buildMap.entries()) {
          if (!matchedLeftKeys.has(key)) {
            unmatchedLeftRows.push(...rows)
          }
        }
        if (unmatchedLeftRows.length > 0) {
          yield { columns: outCols, rows: unmatchedLeftRows }
        }
      }
    }

    return this.buildHandle(outCols, columnMapping, generator.bind(null, this))
  }
}
