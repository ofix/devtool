export const meta = {
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
