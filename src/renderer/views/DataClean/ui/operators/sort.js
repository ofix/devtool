export const meta = {
  type: "sort",
  label: "Sort",
  icon: "IconSort",
  category: "transform",
  inputs: 1,
  outputs: 1,
  inputCategory: "table",
  outputCategory: "table",
  supportedEngines: ["js", "duckdb"], // 👈 重点：声明纯 JS 引擎和 DuckDB 引擎都支持
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
}
