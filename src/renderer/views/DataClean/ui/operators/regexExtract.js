export const meta = {
  type: "regexExtract",
  label: "Regex Extract",
  icon: "IconRegex",
  category: "transform",
  inputs: 1,
  outputs: 1,
  inputCategory: "table",
  outputCategory: "table",
  supportedEngines: ["js", "duckdb"],
  schema: [
    { field: "sourceField", label: "源列", component: "fieldSelect" },
    { field: "regex", label: "正则表达式", component: "input" },
    { field: "newField", label: "新列名", component: "input" },
  ],
}
