export const meta = {
  type: "formula",
  label: "Formula",
  icon: "IconCalculator",
  category: "prepare",
  inputs: 1,
  outputs: 1,
  inputCategory: "table",
  outputCategory: "table",
  supportedEngines: ["js", "duckdb"],
  schema: [
    { field: "newField", label: "输出列名", component: "input" },
    { field: "expression", label: "公式", component: "expression" },
  ],
}
