import { DATA_CATEGORY } from "../../constants/DataCategories.js"
import StreamController from "../runtime/StreamController.js"
import ExcelJS from "exceljs"

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
    { field: "sheetName", label: "Sheet 名称", component: "input", defaultValue: "Sheet1" },
  ],
  async execute(inputs, params, ctx) {
    const data = inputs[0]
    if (!data) throw new Error("无输入数据")
    if (!params.filePath) throw new Error("请选择保存路径")

    const { filePath, sheetName = "Sheet1" } = params

    // 使用 exceljs 的 Streaming Writer
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ useStyles: false })
    const worksheet = workbook.addWorksheet(sheetName)

    const controller = new StreamController(data.controller.sourceGenerator, "rendezvous")
    const iterator = controller.createIterator("xlsx-writer", ctx.signal)

    let isFirstChunk = true
    try {
      for await (const chunk of iterator) {
        if (ctx.signal.aborted) break

        if (isFirstChunk) {
          worksheet.columns = chunk.columns.map(c => ({ header: c.name, key: c.name, width: 15 }))
          isFirstChunk = false
        }

        for (const row of chunk.rows) {
          worksheet.addRow(row).commit()
        }
        ctx.metrics.mainRows += chunk.rows.length
      }
      await worksheet.commit()
      // 最后把 Streaming 产生的 buffer 写进真实文件
      await workbook.commit() // 假设主进程配合处理这个 commit，或者直接写本地
    } finally {
      if (iterator.return) await iterator.return()
    }

    return null
  },
}
