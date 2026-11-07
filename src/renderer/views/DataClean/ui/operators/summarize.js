export const meta = {
  type: "summarize",
  label: "Summarize",
  icon: "IconDataLine",
  category: "transform",
  inputs: 1,
  outputs: 1,
  inputCategory: "table",
  outputCategory: "table",
  supportedEngines: ["js", "duckdb"],
  schema: [
    { field: "groupFields", label: "分组字段", component: "fieldSelect", multiple: true },
    { field: "aggregations", label: "聚合配置", component: "input" },
  ],
}
