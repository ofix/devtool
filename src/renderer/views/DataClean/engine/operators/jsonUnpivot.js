// ==== FILE: src/renderer/views/DataClean/engine/operators/jsonUnpivot.js ====
import { DATA_CATEGORY } from "../../constants/DataCategories.js"
import { inferDataCategory } from "../runtime/InferCategory.js"

export default {
  type: "jsonUnpivot",
  meta: {
    label: "JSON Unpivot",
    icon: "IconGrid",
    color: "#f59e0b",
    category: "json",
    inputs: 1,
    outputs: 1,
    inputCategory: DATA_CATEGORY.JSON,
    outputCategory: "dynamic", // 动态输出：可能是 Table 也可能是 JSON
  },
  schema: [{ field: "keyName", label: "动态键列名", component: "input", defaultValue: "ip" }],
  execute(inputs, params, ctx) {
    const inputJson = inputs[0]?.json
    if (!inputJson) throw new Error("未接收到 JSON 数据")

    const dataArray = Array.isArray(inputJson) ? inputJson : [inputJson]
    const keyName = params.keyName || "ip"

    const outRows = []

    for (const item of dataArray) {
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        continue
      }

      for (const [k, v] of Object.entries(item)) {
        if (Array.isArray(v)) {
          for (const subItem of v) {
            if (subItem !== null && typeof subItem === "object") {
              // 展开数组元素，保留内部嵌套
              outRows.push({ [keyName]: k, ...subItem })
            } else {
              outRows.push({ [keyName]: k, value: subItem })
            }
          }
        } else if (v !== null && typeof v === "object") {
          outRows.push({ [keyName]: k, ...v })
        } else {
          outRows.push({ [keyName]: k, value: v })
        }
      }
    }

    if (ctx?.log) ctx.log(`[JSON Unpivot] 展开完成，共 ${outRows.length} 条记录`)

    // 核心修复：让引擎推断真实的数据形态
    const category = inferDataCategory(outRows)

    if (category === DATA_CATEGORY.TABLE) {
      // 如果是纯平铺结构，转为表格
      const columns = Object.keys(outRows[0] || {}).map(k => ({ name: k, type: "string" }))
      if (ctx?.log) ctx.log(`[JSON Unpivot] 数据已完全平铺，输出 Table`)
      return { dataCategory: DATA_CATEGORY.TABLE, rows: outRows, columns }
    }

    // 如果还含有嵌套对象（如 detail），保持 JSON 形态
    if (ctx?.log) ctx.log(`[JSON Unpivot] 数据仍包含嵌套结构，输出 JSON`)
    return { dataCategory: DATA_CATEGORY.JSON, json: outRows }
  },
}
