export const meta = {
  type: "select",
  label: "Select",
  icon: "IconList",
  category: "prepare",
  inputs: 1,
  outputs: 1,
  inputCategory: "table",
  outputCategory: "table",
  supportedEngines: ["js", "duckdb"],
  schema: [
    { field: "columns", label: "保留列", component: "columnPicker" },
    { field: "renameMap", label: "重命名", component: "renamePanel" },
  ],
}
