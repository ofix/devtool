const metaSample = {
  type: "sample",
  label: "Sample",
  icon: "IconFilter",
  category: "prepare",
  inputs: 1,
  outputs: 1,
  inputCategory: "table",
  outputCategory: "table",
  supportedEngines: ["js", "duckdb"],
  schema: [
    { field: "count", label: "行数", component: "input", defaultValue: "1000" },
    {
      field: "mode",
      label: "模式",
      component: "select",
      options: [
        { label: "前 N 行", value: "head" },
        { label: "随机 N 行", value: "random" },
      ],
    },
  ],
}

const metaSummarize = {
  type: "summarize",
  label: "Summarize",
  icon: "IconDataLine",
  category: "transform",
  inputs: 1,
  outputs: 1,
  inputCategory: "table",
  outputCategory: "table",
  supportedEngines: ["js", "duckdb"],
  schema: [
    { field: "groupFields", label: "分组字段", component: "fieldSelect", multiple: true },
    { field: "aggregations", label: "聚合配置", component: "input" },
  ],
}

const metaCrossTab = {
  type: "crossTab",
  label: "Cross Tab",
  icon: "IconGrid",
  category: "transform",
  inputs: 1,
  outputs: 1,
  inputCategory: "table",
  outputCategory: "table",
  supportedEngines: ["js"],
  schema: [
    { field: "rowField", label: "行字段", component: "fieldSelect" },
    { field: "colField", label: "列字段", component: "fieldSelect" },
    { field: "valField", label: "值字段", component: "fieldSelect" },
    {
      field: "aggFunc",
      label: "聚合函数",
      component: "select",
      options: [
        { label: "SUM", value: "SUM" },
        { label: "COUNT", value: "COUNT" },
      ],
    },
  ],
}

const metaCountRecords = {
  type: "countRecords",
  label: "Count Records",
  icon: "IconNumber",
  category: "transform",
  inputs: 1,
  outputs: 1,
  inputCategory: "table",
  outputCategory: "table",
  supportedEngines: ["js", "duckdb"],
  schema: [{ field: "newField", label: "计数字段名", component: "input", defaultValue: "count" }],
}

export const metaStatistics = {
  sample: metaSample,
  summarize: metaSummarize,
  crossTab: metaCrossTab,
  countRecords: metaCountRecords,
}
