export const meta = {
  type: "jsonWriter",
  label: "JSON Writer",
  icon: "IconFileExport",
  category: "output",
  inputs: 1,
  outputs: 0,
  inputCategory: ["table", "json"],
  outputCategory: null,
  supportedEngines: ["js"],
  schema: [
    { field: "filePath", label: "保存路径", component: "saveFile", extensions: ["json"] },
    { field: "minify", label: "压缩输出", component: "switch", defaultValue: false },
  ],
}
