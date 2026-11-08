export const meta = {
  type: "jsonUnpivot",
  label: "JSON Unpivot",
  icon: "IconGrid",
  category: "json",
  inputs: 1,
  outputs: 1,
  inputCategory: "json",
  outputCategory: "table",
  supportedEngines: ["js"],
  schema: [{ field: "keyName", label: "动态键列名", component: "input", defaultValue: "ip" }],
}
