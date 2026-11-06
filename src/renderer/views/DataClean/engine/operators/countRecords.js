import { DATA_CATEGORY } from "../../constants/DataCategories.js"
import StreamDataset from "../runtime/StreamDataset.js"
import StreamController from "../runtime/StreamController.js"

export default {
  type: "countRecords",
  meta: {
    label: "Count Records",
    icon: "IconNumber",
    color: "#8b5cf6",
    category: "transform",
    inputs: 1,
    outputs: 1,
    inputCategory: DATA_CATEGORY.TABLE,
    outputCategory: DATA_CATEGORY.TABLE,
  },
  schema: [{ field: "newField", label: "计数字段名", component: "input", defaultValue: "count" }],
  async execute(inputs, params, ctx) {
    const data = inputs[0]
    if (!data) return null

    const fieldName = params.newField || "count"

    async function* countGenerator() {
      let count = 0
      const controller = new StreamController(data.controller.sourceGenerator, "rendezvous")
      const iterator = controller.createIterator("count-node", ctx.signal)

      for await (const chunk of iterator) {
        if (ctx.signal.aborted) return
        count += chunk.rows.length
        // 这里不需要 yield 中间数据，直到结束
        await new Promise(resolve => setTimeout(resolve, 0))
      }

      // 输出最终结果
      yield {
        columns: [{ name: fieldName, type: "number" }],
        rows: [{ [fieldName]: count }],
      }
    }

    return new StreamDataset({
      dataCategory: DATA_CATEGORY.TABLE,
      columns: [{ name: fieldName, type: "number" }],
      controller: { sourceGenerator: countGenerator, strategy: "rendezvous" },
      columnMapping: { [fieldName]: [] }, // 聚合列不继承单一血脉
    })
  },
}
