export const meta = {
  type: "transpose",
  label: "Transpose",
  icon: "IconSwitch",
  category: "transform",
  inputs: 1,
  outputs: 1,
  inputCategory: "table",
  outputCategory: "table",
  supportedEngines: ["js", "duckdb"],
  schema: [
    { field: "keepFields", label: "保留列", component: "fieldSelect", multiple: true },
    { field: "unpivotFields", label: "转置列", component: "fieldSelect", multiple: true },
  ],
}
