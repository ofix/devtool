export const meta = {
  type: "jsonFilter",
  label: "JSON Filter",
  icon: "IconFilter",
  category: "json",
  inputs: 1,
  outputs: 1,
  inputCategory: "json",
  outputCategory: "json",
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
}
