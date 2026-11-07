export const meta = {
  type: "jsonUnnest",
  label: "JSON Unnest",
  icon: "IconExpand",
  category: "json",
  inputs: 1,
  outputs: 1,
  inputCategory: "json",
  outputCategory: "table",
  supportedEngines: ["js"],
  schema: [{ field: "targetPath", label: "展开数组", component: "arrayPicker" }],
}
