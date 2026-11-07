export const meta = {
  type: "csvWriter",
  label: "CSV Writer",
  icon: "IconFileExport",
  category: "output",
  inputs: 1,
  outputs: 0,
  inputCategory: "table",
  outputCategory: null,
  supportedEngines: ["js", "duckdb"],
  schema: [
    { field: "filePath", label: "保存路径", component: "saveFile", extensions: ["csv"] },
    { field: "includeHeader", label: "包含列名", component: "switch", defaultValue: true },
  ],
}
