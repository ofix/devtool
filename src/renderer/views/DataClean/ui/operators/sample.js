export const meta = {
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
