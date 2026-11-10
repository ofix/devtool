const metaXlsxWriter = {
  type: "xlsxWriter",
  label: "XLSX Writer",
  icon: "IconFileExport",
  category: "output",
  inputPorts: 1,
  outputPorts: 0,
  inputMode: "static",
  inputRecordSetsSupport: ["table"],
  executePolicy: {
    canCompile: false,
    needAllInputReady: true,
  },
  supportedEngines: ["js"],
  schema: [
    { field: "filePath", label: "保存路径", component: "saveFile", extensions: ["xlsx"] },
    { field: "sheetName", label: "Sheet 名称", component: "input", defaultValue: "Sheet1" },
  ],
};

const metaDbWriter = {
  type: "dbWriter",
  label: "DB Writer",
  icon: "IconDatabase",
  category: "output",
  inputPorts: 1,
  outputPorts: 0,
  inputMode: "static",
  inputRecordSetsSupport: ["table"],
  executePolicy: {
    canCompile: false,
    needAllInputReady: true,
  },
  supportedEngines: ["js"],
  schema: [{ field: "dbConfig", label: "数据库配置", component: "dbWriterConfig" }],
};

const metaCsvWriter = {
  type: "csvWriter",
  label: "CSV Writer",
  icon: "IconFileExport",
  category: "output",
  inputPorts: 1,
  outputPorts: 0,
  inputMode: "static",
  inputRecordSetsSupport: ["table"],
  executePolicy: {
    canCompile: false,
    needAllInputReady: true,
  },
  supportedEngines: ["js", "duckdb"],
  schema: [
    { field: "filePath", label: "保存路径", component: "saveFile", extensions: ["csv"] },
    { field: "includeHeader", label: "包含列名", component: "switch", defaultValue: true },
  ],
};

const metaJsonWriter = {
  type: "jsonWriter",
  label: "JSON Writer",
  icon: "IconFileExport",
  category: "output",
  inputPorts: 1,
  outputPorts: 0,
  inputMode: "static",
  inputRecordSetsSupport: ["table", "json"],
  executePolicy: {
    canCompile: false,
    needAllInputReady: true,
  },
  supportedEngines: ["js"],
  schema: [
    { field: "filePath", label: "保存路径", component: "saveFile", extensions: ["json"] },
    { field: "minify", label: "压缩输出", component: "switch", defaultValue: false },
  ],
};

export const metaWriters = {
  xlsxWriter: metaXlsxWriter,
  dbWriter: metaDbWriter,
  csvWriter: metaCsvWriter,
  jsonWriter: metaJsonWriter,
};
