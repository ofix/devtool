export const meta = {
  type: "csvReader",
  label: "CSV Reader",
  icon: "IconFileImport",
  category: "source",
  inputs: 0,
  outputs: 1,
  inputCategory: null,
  outputCategory: "table",
  supportedEngines: ["js", "duckdb"],
  schema: [
    { field: "filePath", label: "文件", component: "file", extensions: ["csv", "txt"] },
    { field: "encoding", label: "编码", component: "select", defaultValue: "UTF-8" },
  ],
}
