export const meta = {
  type: "countRecords",
  label: "Count Records",
  icon: "IconNumber",
  category: "transform",
  inputs: 1,
  outputs: 1,
  inputCategory: "table",
  outputCategory: "table",
  supportedEngines: ["js", "duckdb"],
  schema: [{ field: "newField", label: "计数字段名", component: "input", defaultValue: "count" }],
}
