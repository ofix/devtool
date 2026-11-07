export const meta = {
  type: "filter",
  label: "Filter",
  icon: "IconFilter",
  category: "prepare",
  inputs: 1,
  outputs: 1,
  inputCategory: "table",
  outputCategory: "table",
  supportedEngines: ["js", "duckdb"], // 目前先支持纯 JS 引擎
  schema: [{ field: "expression", label: "条件", component: "expression" }],
}
