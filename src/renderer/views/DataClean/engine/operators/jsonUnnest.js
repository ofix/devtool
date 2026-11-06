import { DATA_CATEGORY } from "../../constants/DataCategories.js"
import { inferDataCategory } from "../runtime/InferCategory.js"
import StreamDataset from "../runtime/StreamDataset.js"
import StreamController from "../runtime/StreamController.js"

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

export default {
  type: "jsonUnnest",
  meta: {
    label: "JSON Unnest",
    icon: "IconExpand",
    color: "#06b6d4",
    category: "json",
    inputs: 1,
    outputs: 1,
    inputCategory: DATA_CATEGORY.JSON,
    outputCategory: "dynamic",
  },
  schema: [{ field: "targetPath", label: "展开数组", component: "arrayPicker" }],
  async execute(inputs, params, ctx) {
    const inputJson = inputs[0]?.json
    if (!inputJson) throw new Error("未接收到 JSON 数据")

    const dataArray = Array.isArray(inputJson) ? inputJson : [inputJson]
    const path = params.targetPath
    if (!path) throw new Error("请配置需要展开的数组字段")

    async function* unnestGenerator() {
      const outRowsBuffer = []
      const MAX_BUFFER = 5000 // 防止单次 yield 数据量过大
      let detectedCols = []

      for (const item of dataArray) {
        if (ctx.signal.aborted) return

        if (!item || typeof item !== "object") {
          outRowsBuffer.push({ value: item })
          continue
        }

        const targetArray = getValueByPath(item, path)
        if (Array.isArray(targetArray)) {
          const parentObj = { ...item }
          delete parentObj[path]

          for (const subItem of targetArray) {
            if (subItem !== null && typeof subItem === "object" && !Array.isArray(subItem)) {
              outRowsBuffer.push({ ...parentObj, ...subItem })
            } else {
              outRowsBuffer.push({ ...parentObj, value: subItem })
            }
          }
        } else {
          outRowsBuffer.push(item)
        }

        // 缓冲达到阈值，推断列名并吐出
        if (outRowsBuffer.length >= MAX_BUFFER) {
          if (detectedCols.length === 0) {
            detectedCols = Object.keys(outRowsBuffer[0]).map(k => ({ name: k, type: "string" }))
          }
          yield { columns: detectedCols, rows: outRowsBuffer }
          outRowsBuffer.length = 0 // 清空
        }
      }

      // 处理剩余数据
      if (outRowsBuffer.length > 0) {
        if (detectedCols.length === 0) {
          detectedCols = Object.keys(outRowsBuffer[0]).map(k => ({ name: k, type: "string" }))
        }
        yield { columns: detectedCols, rows: outRowsBuffer }
      }
    }

    // 注意：此处返回的是 Table 类型的流
    return new StreamDataset({
      dataCategory: DATA_CATEGORY.TABLE,
      columns: [], // 动态推断
      controller: { sourceGenerator: unnestGenerator, strategy: "rendezvous" },
      columnMapping: {}, // 简化版，真实业务需按路径映射
    })
  },
}
