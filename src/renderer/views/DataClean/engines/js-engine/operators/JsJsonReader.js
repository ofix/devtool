import { BaseJsOperator } from "./BaseJsOperator.js"
import { DataHandle } from "../../../core/contract/DataHandle.js"

const MAX_JSON_SIZE = 50 * 1024 * 1024 // 50MB 硬上限
const TRUNCATE_SIZE = 4 * 1024 * 1024 // 4MB 截断保护

export class JsJsonReader extends BaseJsOperator {
  async execute(inputs, params, ctx) {
    const filePath = params.filePath
    if (!filePath) throw new Error("未配置文件路径")

    // 1. 获取文件属性，做大小保护
    const stat = await window.api.dataClean.fs.stat(filePath)
    if (!stat || !stat.isFile) throw new Error("文件不存在")

    if (stat.size > MAX_JSON_SIZE) {
      throw new Error(`文件过大 (${(stat.size / 1024 / 1024).toFixed(2)} MB)，超过 50MB 上限。`)
    }

    let text = await window.api.dataClean.fs.readFile(filePath)
    let isTruncated = false

    if (stat.size > TRUNCATE_SIZE) {
      isTruncated = true
      text = text.slice(0, TRUNCATE_SIZE)
      if (ctx.log) ctx.log(`[JsJsonReader] 文件过大，仅解析前 4MB`, "warn")
    }

    let parsedData = null
    try {
      parsedData = JSON.parse(text)
    } catch (err) {
      throw new Error(`JSON 解析失败: ${err.message}`)
    }

    // 2. 生成标准化的 DataHandle
    return DataHandle.jsStream({
      // JSON 类型的数据，schema 不适用，这里给个空
      schema: [],
      columnMapping: {},
      streamDataset: {
        // 👇 使用一个假的生成器，让下游 JSON 算子能够兼容
        controller: {
          sourceGenerator: async function* () {
            yield { json: parsedData } // 把完整的 JSON 对象放在特殊字段里吐出
          },
          strategy: "rendezvous",
        },
        // 强制标识当前是 JSON 流
        dataCategory: "json",
      },
    })
  }
}
