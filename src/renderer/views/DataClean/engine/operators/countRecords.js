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
    return {
      rows: [{ [fieldName]: count }],
      columns: [{ name: fieldName, type: "number" }],
    }
  },
}
