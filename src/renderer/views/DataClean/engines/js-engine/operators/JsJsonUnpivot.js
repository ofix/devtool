import { BaseJsOperator } from "./BaseJsOperator.js"

export class JsJsonUnpivot extends BaseJsOperator {
  async execute(inputs, params, ctx) {
    const inputData = inputs[0]
    if (!inputData) throw new Error("未接收到 JSON 数据")

    // 核心修复 1：兼容两种 JSON 上游传递形态
    let inputJson = null
    if (inputData.dataCategory === "json") {
      // 如果上游返回了 payload.json
      inputJson = inputData.payload.json
    } else if (inputData.payload.streamDataset) {
      // 如果上游包装成了流，这里因为要转置需要全量数据，所以阻塞读取
      // 注意：真实生产中，如果 JSON 极大，这里需要分段处理
      throw new Error(
        "JSON Unpivot 暂不支持接收流式 JSON 数据，请先使用 JSON Reader 转换为内存 JSON",
      )
    }

    if (!inputJson) throw new Error("JSON 数据为空")

    const dataArray = Array.isArray(inputJson) ? inputJson : [inputJson]
    const keyName = params.keyName || "ip"

    // 使用生成器实现分块输出，防止 V8 堆内存爆炸
    const generator = async function* () {
      const outRows = []
      const MAX_BUFFER = 5000

      for (const item of dataArray) {
        if (ctx.signal.aborted) return
        if (item === null || typeof item !== "object" || Array.isArray(item)) continue

        for (const [k, v] of Object.entries(item)) {
          if (Array.isArray(v)) {
            for (const subItem of v) {
              if (subItem !== null && typeof subItem === "object") {
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

        // 分块吐出
        if (outRows.length >= MAX_BUFFER) {
          const cols = Object.keys(outRows[0]).map(k => ({ name: k, type: "string" }))
          yield { columns: cols, rows: outRows.splice(0, MAX_BUFFER) }
          await new Promise(r => setTimeout(r, 0)) // 让出主线程
        }
      }

      // 处理剩余数据
      if (outRows.length > 0) {
        const cols = Object.keys(outRows[0]).map(k => ({ name: k, type: "string" }))
        yield { columns: cols, rows: outRows }
      }
    }

    if (ctx.log) ctx.log(`[JsJsonUnpivot] 准备扁平化数据...`)

    // 核心修复 2：返回标准的 DataHandle
    const dummySchema = [{ name: keyName, type: "string" }]
    const columnMapping = { [keyName]: keyName }

    return this.buildHandle(dummySchema, columnMapping, generator.bind(null, this))
  }
}
