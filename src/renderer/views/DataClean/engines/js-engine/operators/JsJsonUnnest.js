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

export class JsJsonUnnest extends BaseJsOperator {
  async execute(inputs, params, ctx) {
    const inputData = inputs[0]
    if (!inputData) throw new Error("未接收到 JSON 数据")

    // 👇 核心修复：因为上游是 JSON 类型，payload 里的数据可能不是流，而是全量对象
    // 我们需要兼容两种可能：1. payload.json 是原始对象；2. payload.streamDataset 里包装了
    let inputJson = null
    if (inputData.dataCategory === "json") {
      inputJson = inputData.payload.json
    } else if (inputData.payload.streamDataset) {
      // 如果被包装成了流，需要先收集（但 JSON 通常走全量，不会流式）
      throw new Error("JSON Unnest 暂不支持接收流式 JSON 数据")
    }

    if (!inputJson) throw new Error("JSON 数据为空")

    const dataArray = Array.isArray(inputJson) ? inputJson : [inputJson]
    const path = params.targetPath
    if (!path) throw new Error("请配置需要展开的数组字段")

    // 注意：因为这是一次性全量展开，我们用一个假流来吐出结果
    const generator = async function* () {
      const outRowsBuffer = []
      const MAX_BUFFER = 5000
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

        if (outRowsBuffer.length >= MAX_BUFFER) {
          if (detectedCols.length === 0) {
            detectedCols = Object.keys(outRowsBuffer[0]).map(k => ({ name: k, type: "string" }))
          }
          yield { columns: detectedCols, rows: outRowsBuffer }
          outRowsBuffer.length = 0
        }
      }

      if (outRowsBuffer.length > 0) {
        if (detectedCols.length === 0) {
          detectedCols = Object.keys(outRowsBuffer[0]).map(k => ({ name: k, type: "string" }))
        }
        yield { columns: detectedCols, rows: outRowsBuffer }
      }
    }

    // 返回标准 DataHandle，沿用 inputData 的 schema 作为初始值
    // 真实运行的列会在流消费时由下游动态感知
    return this.buildHandle(inputData.schema || [], {}, generator.bind(null, this))
  }
}
