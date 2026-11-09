const metaFilter = {
  type: "filter",
  label: "Filter",
  icon: "IconFilter",
  category: "prepare",
  inputs: 1,
  outputs: 1,
  inputCategory: "table",
  outputCategory: "table",
  supportedEngines: ["js", "duckdb"], // 目前先支持纯 JS 引擎
  schema: [{ field: "expression", label: "条件", component: "expression" }],
}

const metaFormula = {
  type: "formula",
  label: "Formula",
  icon: "IconCalculator",
  category: "prepare",
  inputs: 1,
  outputs: 1,
  inputCategory: "table",
  outputCategory: "table",
  supportedEngines: ["js", "duckdb"],
  schema: [
    { field: "newField", label: "输出列名", component: "input" },
    { field: "expression", label: "公式", component: "expression" },
  ],
}

const metaRegexExtract = {
  type: "regexExtract",
  label: "Regex Extract",
  icon: "IconRegex",
  category: "transform",
  inputs: 1,
  outputs: 1,
  inputCategory: "table",
  outputCategory: "table",
  supportedEngines: ["js", "duckdb"],
  schema: [
    { field: "sourceField", label: "源列", component: "fieldSelect" },
    { field: "regex", label: "正则表达式", component: "input" },
    { field: "newField", label: "新列名", component: "input" },
  ],
}

export const metaFilters = {
  filter: metaFilter,
  formula: metaFormula,
  regexExtract: metaRegexExtract,
}
