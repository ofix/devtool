import { DATA_CATEGORY } from "../../constants/DataCategories.js"
import StreamDataset from "../runtime/StreamDataset.js"
import StreamController from "../runtime/StreamController.js"

export default {
  type: "union",
  meta: {
    label: "Union",
    icon: "IconMerge",
    color: "#06b6d4",
    category: "join",
    inputs: 2,
    outputs: 1,
    inputCategory: DATA_CATEGORY.TABLE,
    outputCategory: DATA_CATEGORY.TABLE,
  },
  schema: [
    { 
      field: "skipErrorStream", 
      label: "跳过报错流(默认关闭)", 
      component: "switch", 
      defaultValue: false 
    }
  ],
  
  async execute(inputs, params, ctx) {
    if (!inputs || inputs.length === 0) return null

    const skipError = params.skipErrorStream === true
    const baseColumns = inputs[0].columns || []
    
    // 血缘合并：多个输入的字段映射到同一个输出字段
    const columnMapping = {}
    for (const col of baseColumns) {
        columnMapping[col.name] = []
        for (const input of inputs) {
            if (input.columnMapping && input.columnMapping[col.name]) {
                const mapping = input.columnMapping[col.name]
                if (Array.isArray(mapping)) {
                    columnMapping[col.name].push(...mapping)
                } else {
                    columnMapping[col.name].push(mapping)
                }
            }
        }
    }

    async function* unionGenerator() {
      // 严格按照输入顺序串行拉取
      for (let i = 0; i < inputs.length; i++) {
        const input = inputs[i]
        if (!input || !input.controller) continue

        if (ctx.signal.aborted) return

        const controller = new StreamController(input.controller.sourceGenerator, "rendezvous")
        const iterator = controller.createIterator(`union-input-${i}`, ctx.signal)

        try {
          for await (const chunk of iterator) {
            if (ctx.signal.aborted) return
            yield chunk
          }
        } catch (err) {
          ctx.metrics.errorRows++ // 记录异常
          console.error(`[Union] 第 ${i} 路流读取失败:`, err)
          
          if (!skipError) {
            // 默认策略：一路失败，全盘终止
            throw new Error(`Union 输入流 ${i} 异常终止: ${err.message}`)
          } else {
            // 容错策略：记录日志，跳过当前流，继续下一个
            if (ctx.log) ctx.log(`[Union] 忽略异常流 ${i}，继续执行后续流`, "warn")
          }
        }
      }
    }

    const result = new StreamDataset({
      dataCategory: DATA_CATEGORY.TABLE,
      columns: baseColumns,
      controller: { sourceGenerator: unionGenerator, strategy: "rendezvous" }
    })
    result.columnMapping = columnMapping
    return result
  }
}