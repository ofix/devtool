export const meta = {
  type: "jsonExtract",
  label: "JSON Extract",
  icon: "IconExtract",
  category: "json",
  inputs: 1,
  outputs: 1,
  inputCategory: "json",
  outputCategory: "table",
  supportedEngines: ["js"],
  schema: [{ field: "fields", label: "提取字段", component: "jsonFieldPicker" }],
}
