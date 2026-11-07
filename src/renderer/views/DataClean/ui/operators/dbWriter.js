export const meta = {
  type: "dbWriter",
  label: "DB Writer",
  icon: "IconDatabase",
  category: "output",
  inputs: 1,
  outputs: 0,
  inputCategory: "table",
  outputCategory: null,
  supportedEngines: ["js"],
  schema: [{ field: "dbConfig", label: "数据库配置", component: "dbWriterConfig" }],
}
