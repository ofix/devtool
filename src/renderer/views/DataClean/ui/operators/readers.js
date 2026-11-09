const metaCsvReader = {
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

const metaJsonReader = {
  type: "jsonReader",
  label: "JSON Reader",
  icon: "IconFile",
  category: "source",
  inputs: 0,
  outputs: 1,
  inputCategory: null,
  outputCategory: "json",
  supportedEngines: ["js"],
  schema: [{ field: "filePath", label: "文件", component: "file", extensions: ["json"] }],
}

export const metaReaders = {
  csvReader: metaCsvReader,
  jsonReader: metaJsonReader,
}
