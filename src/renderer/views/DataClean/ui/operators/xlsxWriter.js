export const meta = {
  type: "xlsxWriter",
  label: "XLSX Writer",
  icon: "IconFileExport",
  category: "output",
  inputs: 1,
  outputs: 0,
  inputCategory: "table",
  outputCategory: null,
  supportedEngines: ["js"],
  schema: [
    { field: "filePath", label: "保存路径", component: "saveFile", extensions: ["xlsx"] },
    { field: "sheetName", label: "Sheet 名称", component: "input", defaultValue: "Sheet1" },
  ],
}
