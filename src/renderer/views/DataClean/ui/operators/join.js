export const meta = {
  type: "join",
  label: "Join",
  icon: "IconLink",
  category: "join",
  inputs: 2,
  outputs: 1,
  inputCategory: "table",
  outputCategory: "table",
  supportedEngines: ["js", "duckdb"],
  schema: [
    { field: "joinKeys", label: "连接键配置", component: "joinKeyList" },
    {
      field: "joinType",
      label: "连接方式",
      component: "select",
      options: [
        { label: "Inner", value: "inner" },
        { label: "Left", value: "left" },
        { label: "Right", value: "right" },
        { label: "Full", value: "full" },
      ],
    },
  ],
}
