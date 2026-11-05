// Count Records 算子：输出单行单列
import { DATA_CATEGORY } from "../../constants/DataCategories.js"

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
  execute(inputs, params) {
    const data = inputs[0]
    const count = data && data.rows ? data.rows.length : 0
    const fieldName = params.newField || "count"

    // 构建血缘映射字典
    const columnMapping = {}
    // 聚合统计列不对应上游的任何单一列，所以它的来源为空数组（阻断向上溯源）
    columnMapping[fieldName] = []

    return {
      rows: [{ [fieldName]: count }],
      columns: [{ name: fieldName, type: "number" }],
      columnMapping,
    }
  },
}
