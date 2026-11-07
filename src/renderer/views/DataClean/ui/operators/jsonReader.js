export const meta = {
  type: "jsonReader",
  label: "JSON Reader",
  icon: "IconFile",
  category: "source",
  inputs: 0,
  outputs: 1,
  inputCategory: null,
  outputCategory: "json",
  supportedEngines: ["js"],
  schema: [{ field: "filePath", label: "文件", component: "file", extensions: ["json"] }],
}
