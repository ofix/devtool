export const meta = {
  type: "jsonFlatten",
  label: "JSON Flatten",
  icon: "IconLayers",
  category: "json",
  inputs: 1,
  outputs: 1,
  inputCategory: "json",
  outputCategory: "table",
  supportedEngines: ["js"],
  schema: [{ field: "delimiter", label: "路径分隔符", component: "input", defaultValue: "." }],
}
