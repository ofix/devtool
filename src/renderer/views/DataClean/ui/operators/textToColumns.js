export const meta = {
  type: "textToColumns",
  label: "Text to Columns",
  icon: "IconCut",
  category: "parse",
  inputs: 1,
  outputs: 1,
  inputCategory: "table",
  outputCategory: "table",
  supportedEngines: ["js"],
  schema: [
    { field: "sourceField", label: "拆分列", component: "fieldSelect" },
    { field: "delimiter", label: "分隔符", component: "input", defaultValue: "," },
    { field: "newFieldPrefix", label: "新列前缀", component: "input", defaultValue: "split" },
  ],
}
