const metaCsvReader = {
  type: "csvReader",
  label: "CSV Reader",
  icon: "IconFileImport",
  category: "source",
  inputPorts: 0,
  outputPorts: 1,
  inputMode: "static",
  inputRecordSetsSupport: [],
  executePolicy: {
    canCompile: false,
    needAllInputReady: false,
  },
  supportedEngines: ["js", "duckdb"],
  schema: [
    { field: "filePath", label: "文件", component: "file", extensions: ["csv", "txt"] },
    { field: "encoding", label: "编码", component: "select", defaultValue: "UTF-8" },
  ],
};

const metaJsonReader = {
  type: "jsonReader",
  label: "JSON Reader",
  icon: "IconFile",
  category: "source",
  inputPorts: 0,
  outputPorts: 1,
  inputMode: "static",
  inputRecordSetsSupport: [],
  executePolicy: {
    canCompile: false,
    needAllInputReady: false,
  },
  supportedEngines: ["js"],
  schema: [{ field: "filePath", label: "文件", component: "file", extensions: ["json"] }],
};

export const metaReaders = {
  csvReader: metaCsvReader,
  jsonReader: metaJsonReader,
};
