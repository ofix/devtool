export const meta = {
  type: "unique",
  label: "Unique",
  icon: "IconListCheck",
  category: "prepare",
  inputs: 1,
  outputs: 1,
  inputCategory: "table",
  outputCategory: "table",
  supportedEngines: ["js", "duckdb"],
  schema: [{ field: "keyFields", label: "去重依据列", component: "fieldSelect", multiple: true }],
}
