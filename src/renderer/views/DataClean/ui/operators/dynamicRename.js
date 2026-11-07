export const meta = {
  type: "dynamicRename",
  label: "Dynamic Rename",
  icon: "IconTextRecognition",
  category: "develop",
  inputs: 1,
  outputs: 1,
  inputCategory: "table",
  outputCategory: "table",
  supportedEngines: ["js", "duckdb"],
  schema: [
    { field: "renameMap", label: "映射表(旧:新,)", component: "input" },
    { field: "prefix", label: "统一前缀", component: "input" },
    { field: "suffix", label: "统一后缀", component: "input" },
  ],
}
