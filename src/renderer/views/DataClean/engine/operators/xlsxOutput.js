// XLSX Output 算子：基于 ExcelJS
export default {
  type: "xlsxOutput",
  meta: {
    label: "XLSX Output",
    icon: "IconExcel",
    color: "#10b981",
    category: "output",
    inputs: 1,
    outputs: 0,
    inputPortType: "table",
    outputPortType: null,
  },
  schema: [
    { field: "filePath", label: "输出文件", component: "saveFile", extensions: ["xlsx"] },
    { field: "sheetName", label: "Sheet 名", component: "input", defaultValue: "Sheet1" },
    { field: "hasHeader", label: "写入表头", component: "switch", defaultValue: true },
    {
      field: "mode",
      label: "写入模式",
      component: "select",
      options: [
        { label: "覆盖原文件", value: "overwrite" },
        { label: "追加到末尾", value: "append" },
      ],
    },
  ],
  async execute(inputs, params, ctx) {
    const data = inputs[0]
    if (!data || !data.rows) return data

    const ExcelJS = (await import("exceljs")).default
    const workbook = new ExcelJS.Workbook()
    const { filePath, sheetName, hasHeader, mode } = params

    let sheet
    let fileExists = false

    try {
      const info = await window.api.dataClean.fs.exists(filePath)
      fileExists = info
    } catch (e) {}

    if (mode === "append" && fileExists) {
      await workbook.xlsx.readFile(filePath)
      sheet = workbook.getWorksheet(sheetName) || workbook.addWorksheet(sheetName)
    } else {
      sheet = workbook.addWorksheet(sheetName)
    }

    const startRow = mode === "append" ? sheet.actualRowCount + 1 : 1
    let currentRow = startRow

    if (hasHeader && data.columns.length > 0) {
      const headerRow = sheet.getRow(currentRow)
      data.columns.forEach((col, idx) => {
        headerRow.getCell(idx + 1).value = col.name
        headerRow.getCell(idx + 1).font = { bold: true }
      })
      currentRow++
    }

    for (const row of data.rows) {
      const newRow = sheet.getRow(currentRow)
      data.columns.forEach((col, idx) => {
        let val = row[col.name]
        if (val === null || val === undefined) {
          newRow.getCell(idx + 1).value = null
        } else if (typeof val === "string" && val.startsWith("=")) {
          newRow.getCell(idx + 1).value = { formula: val.substring(1) }
        } else {
          newRow.getCell(idx + 1).value = val
        }
      })
      currentRow++
    }

    const buffer = await workbook.xlsx.writeBuffer()
    await window.api.dataClean.fs.writeBuffer(filePath, buffer)

    if (ctx && typeof ctx.log === "function") {
      ctx.log(`[XLSX Output] 导出 ${data.rows.length} 行到 ${sheetName}`)
    }
    return data
  },
}
