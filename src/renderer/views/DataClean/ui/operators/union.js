export const meta = {
  type: "union",
  label: "Union",
  icon: "IconMerge",
  category: "join",
  inputs: 2,
  outputs: 1,
  inputCategory: "table",
  outputCategory: "table",
  supportedEngines: ["js", "duckdb"],
  schema: [
    {
      field: "skipErrorStream",
      label: "跳过报错流(默认关闭)",
      component: "switch",
      defaultValue: false,
    },
  ],
}
