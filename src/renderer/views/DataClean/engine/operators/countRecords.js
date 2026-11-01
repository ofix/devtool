// Count Records 算子：输出单行单列
export default {
  type: "countRecords",
  meta: {
    label: "Count Records",
    icon: "IconNumber",
    color: "#8b5cf6",
    category: "transform",
    inputs: 1,
    outputs: 1,
    inputPortType: "table",
    outputPortType: "table",
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
