const metaXlsxWriter = {
  type: "xlsxWriter",
  label: "XLSX Writer",
  icon: "IconFileExport",
  category: "output",
  inputs: 1,
  outputs: 0,
  inputCategory: "table",
  outputCategory: null,
  supportedEngines: ["js"],
  schema: [
    { field: "filePath", label: "保存路径", component: "saveFile", extensions: ["xlsx"] },
    { field: "sheetName", label: "Sheet 名称", component: "input", defaultValue: "Sheet1" },
  ],
}

const metaDbWriter = {
  type: "dbWriter",
  label: "DB Writer",
  icon: "IconDatabase",
  category: "output",
  inputs: 1,
  outputs: 0,
  inputCategory: "table",
  outputCategory: null,
  supportedEngines: ["js"],
  schema: [{ field: "dbConfig", label: "数据库配置", component: "dbWriterConfig" }],
}

const metaCsvWriter = {
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

export const metaJsonWriters = {
  type: "jsonWriter",
  label: "JSON Writer",
  icon: "IconFileExport",
  category: "output",
  inputs: 1,
  outputs: 0,
  inputCategory: ["table", "json"],
  outputCategory: null,
  supportedEngines: ["js"],
  schema: [
    { field: "filePath", label: "保存路径", component: "saveFile", extensions: ["json"] },
    { field: "minify", label: "压缩输出", component: "switch", defaultValue: false },
  ],
}

export const metaWriters = {
  xlsxWriter: metaXlsxWriter,
  dbWriter: metaDbWriter,
  csvWriter: metaCsvWriter,
  jsonWriter: metaJsonWriters,
}
