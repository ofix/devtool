import { DATA_CATEGORY } from "../../constants/DataCategories.js"

export default {
  type: "xlsxWriter",
  meta: {
    label: "XLSX Writer",
    icon: "IconFileExport",
    color: "#10b981",
    category: "output",
    inputs: 1,
    outputs: 0,
    inputCategory: DATA_CATEGORY.TABLE,
  },
  schema: [
    { field: "filePath", label: "保存路径", component: "saveFile", extensions: ["xlsx"] },
    { field: "includeHeader", label: "包含列名", component: "switch", defaultValue: true },
    { field: "sheetName", label: "Sheet 名称", component: "input", defaultValue: "Sheet1" },
  ],
  async execute(inputs, params) {
    const table = inputs[0]
    if (!table || table.dataCategory !== "table") {
      throw new Error("XLSX Writer 仅接受表格数据")
    }
    if (!params.filePath) throw new Error("请选择保存路径")

    const ExcelJS = (await import("exceljs")).default
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet(params.sheetName || "Sheet1")

    if (params.includeHeader !== false) {
      worksheet.addRow(table.columns.map(c => c.name))
    }

    for (const row of table.rows) {
      worksheet.addRow(table.columns.map(c => row[c.name]))
    }

    const buffer = await workbook.xlsx.writeBuffer()

    if (!window.api.dataClean.fs.writeBuffer) {
      throw new Error("缺少主进程 writeBuffer IPC 接口")
    }
    await window.api.dataClean.fs.writeBuffer(params.filePath, buffer)
    return table
  },
}
