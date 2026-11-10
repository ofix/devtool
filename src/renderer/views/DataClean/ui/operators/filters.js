const metaFilter = {
  type: "filter",
  label: "Filter",
  icon: "IconFilter",
  category: "prepare",
  inputPorts: 1,
  outputPorts: 1,
  inputMode: "static",
  inputRecordSetsSupport: ["table", "json"],
  executePolicy: {
    canCompile: true,
    needAllInputReady: false,
  },
  supportedEngines: ["js", "duckdb"],
  schema: [{ field: "expression", label: "条件", component: "expression" }],
};

const metaFormula = {
  type: "formula",
  label: "Formula",
  icon: "IconCalculator",
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
    { field: "newField", label: "输出列名", component: "input" },
    { field: "expression", label: "公式", component: "expression" },
  ],
};

const metaRegexExtract = {
  type: "regexExtract",
  label: "Regex Extract",
  icon: "IconRegex",
  category: "transform",
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
    { field: "sourceField", label: "源列", component: "fieldSelect" },
    { field: "regex", label: "正则表达式", component: "input" },
    { field: "newField", label: "新列名", component: "input" },
  ],
};

export const metaFilters = {
  filter: metaFilter,
  formula: metaFormula,
  regexExtract: metaRegexExtract,
};
