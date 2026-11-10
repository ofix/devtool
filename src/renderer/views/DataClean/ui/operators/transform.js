const metaSort = {
  type: "sort",
  label: "Sort",
  icon: "IconSort",
  category: "transform",
  inputPorts: 1,
  outputPorts: 1,
  inputMode: "static",
  inputRecordSetsSupport: ["table"],
  executePolicy: {
    canCompile: true,
    needAllInputReady: true,
  },
  supportedEngines: ["js", "duckdb"],
  schema: [
    { field: "sortField", label: "排序列", component: "fieldSelect", multiple: false },
    {
      field: "order",
      label: "排序方向",
      component: "select",
      options: [
        { label: "升序", value: "asc" },
        { label: "降序", value: "desc" },
      ],
      defaultValue: "asc",
    },
    {
      field: "nullPosition",
      label: "空值位置",
      component: "select",
      options: [
        { label: "排在最前", value: "first" },
        { label: "排在最后", value: "last" },
      ],
      defaultValue: "last",
    },
    { field: "stable", label: "稳定排序", component: "switch", defaultValue: false },
  ],
};

const metaTranspose = {
  type: "transpose",
  label: "Transpose",
  icon: "IconSwitch",
  category: "transform",
  inputPorts: 1,
  outputPorts: 1,
  inputMode: "static",
  inputRecordSetsSupport: ["table"],
  executePolicy: {
    canCompile: true,
    needAllInputReady: true,
  },
  supportedEngines: ["js", "duckdb"],
  schema: [
    { field: "keepFields", label: "保留列", component: "fieldSelect", multiple: true },
    { field: "unpivotFields", label: "转置列", component: "fieldSelect", multiple: true },
  ],
};

const metaUnique = {
  type: "unique",
  label: "Unique",
  icon: "IconListCheck",
  category: "prepare",
  inputPorts: 1,
  outputPorts: 1,
  inputMode: "static",
  inputRecordSetsSupport: ["table"],
  executePolicy: {
    canCompile: true,
    needAllInputReady: true,
  },
  supportedEngines: ["js", "duckdb"],
  schema: [{ field: "keyFields", label: "去重依据列", component: "fieldSelect", multiple: true }],
};

const metaSelect = {
  type: "select",
  label: "Select",
  icon: "IconList",
  category: "prepare",
  inputPorts: 1,
  outputPorts: 1,
  inputMode: "static",
  inputRecordSetsSupport: ["table"],
  executePolicy: {
    canCompile: true,
    needAllInputReady: false,
  },
  supportedEngines: ["js", "duckdb"],
  schema: [
    { field: "columns", label: "保留列", component: "columnPicker" },
    { field: "renameMap", label: "重命名", component: "renamePanel" },
  ],
};

const metaDynamicRename = {
  type: "dynamicRename",
  label: "Dynamic Rename",
  icon: "IconTextRecognition",
  category: "develop",
  inputPorts: 1,
  outputPorts: 1,
  inputMode: "static",
  inputRecordSetsSupport: ["table"],
  executePolicy: {
    canCompile: true,
    needAllInputReady: false,
  },
  supportedEngines: ["js", "duckdb"],
  schema: [
    { field: "renameMap", label: "映射表(旧:新,)", component: "input" },
    { field: "prefix", label: "统一前缀", component: "input" },
    { field: "suffix", label: "统一后缀", component: "input" },
  ],
};

const metaTextToColumns = {
  type: "textToColumns",
  label: "Text to Columns",
  icon: "IconCut",
  category: "parse",
  inputPorts: 1,
  outputPorts: 1,
  inputMode: "static",
  inputRecordSetsSupport: ["table"],
  executePolicy: {
    canCompile: false,
    needAllInputReady: false,
  },
  supportedEngines: ["js"],
  schema: [
    { field: "sourceField", label: "拆分列", component: "fieldSelect" },
    { field: "delimiter", label: "分隔符", component: "input", defaultValue: "," },
    { field: "newFieldPrefix", label: "新列前缀", component: "input", defaultValue: "split" },
  ],
};

export const metaTransform = {
  sort: metaSort,
  transpose: metaTranspose,
  unique: metaUnique,
  select: metaSelect,
  dynamicRename: metaDynamicRename,
  textToColumns: metaTextToColumns,
};
