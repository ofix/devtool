import { BaseJsOperator } from "./BaseJsOperator.js"

/**
 * 递归拍平对象
 */
function flattenObject(obj, prefix = "", res = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      flattenObject(value, newKey, res)
    } else {
      res[newKey] = value
    }
  }
  return res
}

export class JsJsonFlatten extends BaseJsOperator {
  async execute(inputs, params, ctx) {
    const inputData = inputs[0]
    if (!inputData) throw new Error("未接收到 JSON 数据")

    // 核心修复 1：获取上游 JSON
    const inputJson = await this.getUpstreamJson(inputData)
    const dataArray = Array.isArray(inputJson) ? inputJson : [inputJson]
    const delimiter = params.delimiter || "."

    // 核心修复 2：使用生成器，边平铺边吐出
    const generator = async function* () {
      let currentColumns = []
      let currentMapping = {}
      let isFirstChunk = true

      const outRowsBuffer = []
      const MAX_BUFFER = 5000

      for (const item of dataArray) {
        if (ctx.signal.aborted) return

        let outRow = item
        if (item && typeof item === "object" && !Array.isArray(item)) {
          const flat = flattenObject(item)
          if (delimiter !== ".") {
            const newFlat = {}
            for (const [k, v] of Object.entries(flat)) {
              newFlat[k.replace(/\./g, delimiter)] = v
            }
            outRow = newFlat
          } else {
            outRow = flat
          }
        }
        outRowsBuffer.push(outRow)

        // 如果是第一波数据，顺便把表头和血缘推演出来
        if (isFirstChunk && outRowsBuffer.length > 0) {
          currentColumns = Object.keys(outRowsBuffer[0]).map(k => ({ name: k, type: "string" }))
          for (const col of currentColumns) {
            if (delimiter !== ".") {
              const originalPath = col.name.split(delimiter).join(".")
              currentMapping[col.name] = originalPath
            } else {
              currentMapping[col.name] = col.name
            }
          }
          isFirstChunk = false
        }

        // 达到缓冲上限，吐出
        if (outRowsBuffer.length >= MAX_BUFFER) {
          yield { columns: currentColumns, rows: outRowsBuffer.splice(0, MAX_BUFFER) }
          await new Promise(r => setTimeout(r, 0))
        }
      }

      // 吐出剩余数据
      if (outRowsBuffer.length > 0) {
        if (isFirstChunk) {
          currentColumns = Object.keys(outRowsBuffer[0]).map(k => ({ name: k, type: "string" }))
          for (const col of currentColumns) {
            if (delimiter !== ".") {
              const originalPath = col.name.split(delimiter).join(".")
              currentMapping[col.name] = originalPath
            } else {
              currentMapping[col.name] = col.name
            }
          }
        }
        yield { columns: currentColumns, rows: outRowsBuffer }
      }
    }

    if (ctx.log) ctx.log(`[JsJsonFlatten] 开始拍平 JSON...`)

    // 核心修复 3：返回标准的 Table 流句柄
    // 由于是动态推演 Schema，初始化时给一个空数组即可，下游 UI 在流开始消费时会自动收到真实列名
    return this.buildHandle([], {}, generator.bind(null, this))
  }
}
