import { DATA_CATEGORY } from "../../constants/DataCategories.js"
import StreamDataset from "../runtime/StreamDataset.js"
import StreamController from "../runtime/StreamController.js"

export default {
  type: "join",
  meta: {
    label: "Join",
    icon: "IconLink",
    color: "#6366f1",
    category: "join",
    inputs: 2,
    outputs: 1,
    inputCategory: DATA_CATEGORY.TABLE,
    outputCategory: DATA_CATEGORY.TABLE,
  },
  schema: [
    { field: "joinKeys", label: "连接键配置", component: "joinKeyList" },
    {
      field: "joinType",
      label: "连接方式",
      component: "select",
      options: [
        { label: "Inner", value: "inner" },
        { label: "Left", value: "left" },
        { label: "Right", value: "right" },
        { label: "Full", value: "full" },
      ],
    },
  ],

  async execute(inputs, params, ctx) {
    const [leftData, rightData] = inputs
    if (!leftData || !rightData) throw new Error("Join 必须有两个输入")

    const { joinKeys = [], joinType = "inner" } = params
    if (joinKeys.length === 0) throw new Error("请配置连接键")

    // 合并输出列结构
    const outCols = []
    const columnMapping = {}
    // 这里简化处理：假设用户在前端已经通过 Select 预处理了同名冲突，或者我们强制加后缀
    for (const c of leftData.columns) {
      outCols.push({ name: c.name, type: c.type })
      columnMapping[c.name] = c.name
    }
    for (const c of rightData.columns) {
      if (!outCols.some(x => x.name === c.name)) {
        outCols.push({ name: c.name, type: c.type })
        columnMapping[c.name] = c.name
      }
    }

    async function* joinGenerator() {
      // 1. 构建阶段（默认左侧 Build，实际生产中应根据行数/字节预估选小表）
      const buildMap = new Map()
      const buildController = new StreamController(
        leftData.controller.sourceGenerator,
        "rendezvous",
      )
      const buildIterator = buildController.createIterator("join-build", ctx.signal)

      for await (const chunk of buildIterator) {
        if (ctx.signal.aborted) return
        for (const row of chunk.rows) {
          const key = joinKeys.map(k => String(row[k.left])).join("|||")
          if (!buildMap.has(key)) buildMap.set(key, [])
          buildMap.get(key).push(row)
        }
        await new Promise(resolve => setTimeout(resolve, 0)) // 让出主线程
      }

      // 2. 探测阶段
      const probeController = new StreamController(
        rightData.controller.sourceGenerator,
        "rendezvous",
      )
      const probeIterator = probeController.createIterator("join-probe", ctx.signal)

      const matchedLeftKeys = new Set()

      for await (const chunk of probeIterator) {
        if (ctx.signal.aborted) return
        const outRows = []

        for (const row of chunk.rows) {
          const key = joinKeys.map(k => String(row[k.right])).join("|||")
          const leftMatches = buildMap.get(key)

          if (leftMatches) {
            matchedLeftKeys.add(key)
            for (const leftRow of leftMatches) {
              outRows.push({ ...leftRow, ...row }) // 合并数据
            }
          } else if (joinType === "right" || joinType === "full") {
            outRows.push({ ...row }) // 右表补空
          }
        }

        if (outRows.length > 0) {
          ctx.metrics.mainRows += outRows.length
          yield { columns: outCols, rows: outRows }
        }
        await new Promise(resolve => setTimeout(resolve, 0))
      }

      // 3. 补全 Left/Full Join 左侧未匹配的行
      if (joinType === "left" || joinType === "full") {
        const unmatchedLeftRows = []
        for (const [key, rows] of buildMap.entries()) {
          if (!matchedLeftKeys.has(key)) {
            unmatchedLeftRows.push(...rows)
          }
        }
        if (unmatchedLeftRows.length > 0) {
          ctx.metrics.mainRows += unmatchedLeftRows.length
          yield { columns: outCols, rows: unmatchedLeftRows }
        }
      }
    }

    const result = new StreamDataset({
      dataCategory: DATA_CATEGORY.TABLE,
      columns: outCols,
      controller: { sourceGenerator: joinGenerator, strategy: "rendezvous" },
    })
    result.columnMapping = columnMapping
    return result
  },
}
