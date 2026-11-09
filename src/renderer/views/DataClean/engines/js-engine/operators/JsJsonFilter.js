import { BaseJsOperator } from "./BaseJsOperator.js"
import { DATA_CATEGORY } from "../../../constants/DataCategories.js"
import { inferDataCategory } from "../../../engine/runtime/InferCategory.js"

/**
 * 根据路径获取深层值
 */
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

export class JsJsonFilter extends BaseJsOperator {
  async execute(inputs, params, ctx) {
    const inputData = inputs[0]
    if (!inputData) throw new Error("未接收到 JSON 数据")

    // 核心修复 1：获取上游的 JSON 数据
    const inputJson = await this.getUpstreamJson(inputData)
    const dataArray = Array.isArray(inputJson) ? inputJson : [inputJson]

    const { field, operator, value } = params
    if (!field) throw new Error("请配置过滤字段")

    // 使用生成器处理，防止大数组阻塞主线程
    const generator = async function* () {
      const outRows = []
      const MAX_BUFFER = 5000

      for (const item of dataArray) {
        if (ctx.signal.aborted) return

        const targetVal = getValueByPath(item, field)
        let isMatch = false

        switch (operator) {
          case "=":
            isMatch = String(targetVal) === String(value)
            break
          case "!=":
            isMatch = String(targetVal) !== String(value)
            break
          case ">":
            isMatch = Number(targetVal) > Number(value)
            break
          case "<":
            isMatch = Number(targetVal) < Number(value)
            break
          case "CONTAINS":
            isMatch = String(targetVal).includes(String(value))
            break
          case "IS NULL":
            isMatch = targetVal === null || targetVal === undefined || targetVal === ""
            break
        }

        if (isMatch) {
          outRows.push(item)
        }

        // 分批输出，防止内存堆积
        if (outRows.length >= MAX_BUFFER) {
          yield { json: outRows.splice(0, MAX_BUFFER) }
          await new Promise(r => setTimeout(r, 0))
        }
      }

      // 吐出剩余数据
      if (outRows.length > 0) {
        yield { json: outRows }
      }
    }

    if (ctx.log) {
      ctx.log(`[JsJsonFilter] 开始过滤字段: ${field}`)
    }

    // 核心修复 2：使用 buildJsonHandle 返回标准的 JSON 句柄
    // 这里为了兼容 UI 的预览，我们可以先把过滤结果同步算出来，如果数据量极大，UI 预览会交由上游/下游截断
    // 但为了接口契约，我们依然返回一个流式的 DataHandle
    return this.buildJsonHandle(
      // 为了满足下游能直接预览，这里可以预执行一次；但在真正的流式架构下，应当延迟求值
      // 鉴于 JSON 过滤通常不会改变结构，我们暂时可以用同步方式跑一遍
      (function syncFilter() {
        const res = []
        for (const item of dataArray) {
          const targetVal = getValueByPath(item, field)
          let isMatch = false
          switch (operator) {
            case "=":
              isMatch = String(targetVal) === String(value)
              break
            case "!=":
              isMatch = String(targetVal) !== String(value)
              break
            case ">":
              isMatch = Number(targetVal) > Number(value)
              break
            case "<":
              isMatch = Number(targetVal) < Number(value)
              break
            case "CONTAINS":
              isMatch = String(targetVal).includes(String(value))
              break
            case "IS NULL":
              isMatch = targetVal === null || targetVal === undefined || targetVal === ""
              break
          }
          if (isMatch) res.push(item)
        }
        return res
      })(),
    )
  }
}
