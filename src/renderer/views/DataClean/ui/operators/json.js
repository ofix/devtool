const metaJsonExtract = {
  type: "jsonExtract",
  label: "JSON Extract",
  icon: "IconExtract",
  category: "json",
  inputPorts: 1,
  outputPorts: 1,
  inputMode: "static",
  inputRecordSetsSupport: ["json"],
  executePolicy: {
    canCompile: false,
    needAllInputReady: false,
  },
  supportedEngines: ["js"],
  schema: [{ field: "fields", label: "提取字段", component: "jsonFieldPicker" }],
};

const metaJsonFilter = {
  type: "jsonFilter",
  label: "JSON Filter",
  icon: "IconFilter",
  category: "json",
  inputPorts: 1,
  outputPorts: 1,
  inputMode: "static",
  inputRecordSetsSupport: ["json"],
  executePolicy: {
    canCompile: false,
    needAllInputReady: false,
  },
  supportedEngines: ["js"],
  schema: [
    { field: "field", label: "过滤字段", component: "jsonFieldPicker" },
    {
      field: "operator",
      label: "操作符",
      component: "select",
      options: [
        { label: "等于", value: "=" },
        { label: "不等于", value: "!=" },
        { label: "大于", value: ">" },
        { label: "小于", value: "<" },
        { label: "包含", value: "CONTAINS" },
        { label: "为空", value: "IS NULL" },
      ],
    },
    { field: "value", label: "值", component: "input" },
  ],
};

const metaJsonFlatten = {
  type: "jsonFlatten",
  label: "JSON Flatten",
  icon: "IconLayers",
  category: "json",
  inputPorts: 1,
  outputPorts: 1,
  inputMode: "static",
  inputRecordSetsSupport: ["json"],
  executePolicy: {
    canCompile: false,
    needAllInputReady: false,
  },
  supportedEngines: ["js"],
  schema: [{ field: "delimiter", label: "路径分隔符", component: "input", defaultValue: "." }],
};

const metaJsonUnnest = {
  type: "jsonUnnest",
  label: "JSON Unnest",
  icon: "IconExpand",
  category: "json",
  inputPorts: 1,
  outputPorts: 1,
  inputMode: "static",
  inputRecordSetsSupport: ["json"],
  executePolicy: {
    canCompile: false,
    needAllInputReady: false,
  },
  supportedEngines: ["js"],
  schema: [{ field: "targetPath", label: "展开数组", component: "arrayPicker" }],
};

const metaJsonUnpivot = {
  type: "jsonUnpivot",
  label: "JSON Unpivot",
  icon: "IconGrid",
  category: "json",
  inputPorts: 1,
  outputPorts: 1,
  inputMode: "static",
  inputRecordSetsSupport: ["json"],
  executePolicy: {
    canCompile: false,
    needAllInputReady: false,
  },
  supportedEngines: ["js"],
  schema: [{ field: "keyName", label: "动态键列名", component: "input", defaultValue: "ip" }],
};

const metaJqExpression = {
  type: "jqExpression",
  label: "JQ Expression",
  icon: "IconCode",
  category: "json",
  inputPorts: 1,
  outputPorts: 1,
  inputMode: "static",
  inputRecordSetsSupport: ["json"],
  executePolicy: {
    canCompile: false,
    needAllInputReady: false,
  },
  supportedEngines: ["js"],
  schema: [{ field: "jqCode", label: "JQ 表达式", component: "jqEditor" }],
};

export const metaJson = {
  jsonExtract: metaJsonExtract,
  jsonFilter: metaJsonFilter,
  jsonFlatten: metaJsonFlatten,
  jsonUnnest: metaJsonUnnest,
  jsonUnpivot: metaJsonUnpivot,
  jqExpression: metaJqExpression,
};
