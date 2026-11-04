import { loadJq } from "jq-wasm"
import wasmUrl from "jq-wasm/jq.wasm?url"
import { DATA_CATEGORY } from "../../constants/DataCategories.js"
import { inferDataCategory } from "../runtime/InferCategory.js"

// 缓存 jq 实例，避免每次执行都重新加载 wasm
let jqInstancePromise = null

async function getJq() {
  if (!jqInstancePromise) {
    jqInstancePromise = loadJq({ wasmURL: wasmUrl })
  }
  return jqInstancePromise
}

export default {
  type: "jsonTransform",
  meta: {
    label: "JSON Transform",
    icon: "IconTransform",
    color: "#8b5cf6",
    category: "json",
    inputs: 1,
    outputs: 1,
    inputCategory: DATA_CATEGORY.JSON,
    outputCategory: "dynamic", // 动态输出，可能是 JSON 也可能是 Table
  },
  schema: [
    {
      field: "mode",
      label: "模式",
      component: "select",
      options: [
        { label: "可视化构建", value: "visual" },
        { label: "高级 JQ", value: "advanced" },
      ],
    },
    { field: "jqCode", label: "JQ 表达式", component: "jqEditor" },
  ],
  async execute(inputs, params, ctx) {
    const inputJson = inputs[0]?.json
    if (inputJson === undefined || inputJson === null) {
      throw new Error("未接收到有效的 JSON 数据")
    }

    const jqCode = params.jqCode || "."

    if (ctx?.log) ctx.log(`[JSON Transform] 开始执行 jq: ${jqCode}`)

    try {
      const jq = await getJq() // 获取已加载的实例
      const jqResult = jq.json(inputJson, jqCode) // 注意：loadJq 返回的实例方法是同步的
      let parsedResult

      if (typeof jqResult === "string") {
        try {
          // 如果返回的是单一合法 JSON 字符串
          parsedResult = JSON.parse(jqResult)
        } catch (e) {
          // 如果返回的是多行流（如 `.items[]`），按换行拆分解析
          const lines = jqResult.split("\n").filter(l => l.trim())
          parsedResult = lines.map(line => JSON.parse(line))
        }
      } else {
        // 如果 jq-wasm 已经帮我们解析成了对象或数组，直接用
        parsedResult = jqResult
      }

      // 自动推断输出形态
      const category = inferDataCategory(parsedResult)

      // 如果是一维对象数组（Table），自动降维
      if (category === DATA_CATEGORY.TABLE) {
        const columns = Object.keys(parsedResult[0] || {}).map(k => ({ name: k, type: "string" }))
        if (ctx?.log) ctx.log(`[JSON Transform] 输出降维为 Table，共 ${parsedResult.length} 行`)
        return {
          dataCategory: DATA_CATEGORY.TABLE,
          rows: parsedResult,
          columns: columns,
        }
      }

      // 如果依然包含嵌套（JSON），原样返回
      if (ctx?.log) ctx.log(`[JSON Transform] 输出保持为 JSON 结构`)
      return {
        dataCategory: DATA_CATEGORY.JSON,
        json: parsedResult,
      }
    } catch (err) {
      throw new Error(`JQ 执行失败: ${err.message}`)
    }
  },
}
