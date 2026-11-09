const metaUnion = {
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

const metaJoin = {
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

export const metaJoinUnion = {
  union: metaUnion,
  join: metaJoin,
}
