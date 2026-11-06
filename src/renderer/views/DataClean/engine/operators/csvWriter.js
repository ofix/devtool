import { DATA_CATEGORY } from "../../constants/DataCategories.js"
import StreamController from "../runtime/StreamController.js"
import Papa from "papaparse"

export default {
  type: "csvWriter",
  meta: {
    label: "CSV Writer",
    icon: "IconFileExport",
    color: "#10b981",
    category: "output",
    inputs: 1,
    outputs: 0,
    inputCategory: DATA_CATEGORY.TABLE,
  },
  schema: [
    { field: "filePath", label: "保存路径", component: "saveFile", extensions: ["csv"] },
    { field: "includeHeader", label: "包含列名", component: "switch", defaultValue: true },
  ],
  async execute(inputs, params, ctx) {
    const data = inputs[0]
    if (!data) throw new Error("无输入数据")
    if (!params.filePath) throw new Error("请选择保存路径")

    const { filePath, includeHeader = true } = params

    // 因为 Writer 没有下游，必须在这里主动消费流
    const controller = new StreamController(data.controller.sourceGenerator, "rendezvous")
    const iterator = controller.createIterator("csv-writer", ctx.signal)

    let isFirstChunk = true
    let fileHandle = null // 假设主进程能提供一个基于流式的 append 接口

    try {
      for await (const chunk of iterator) {
        if (ctx.signal.aborted) break

        // 将 chunk 转为 CSV 字符串
        let csvString = ""
        if (isFirstChunk && includeHeader) {
          csvString += chunk.columns.map(c => c.name).join(",") + "\n"
          isFirstChunk = false
        }

        const rowsStr =
          chunk.rows
            .map(row => {
              return chunk.columns
                .map(c => {
                  let val = row[c.name]
                  if (val === null || val === undefined) return ""
                  let str = String(val)
                  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
                    str = `"${str.replace(/"/g, '""')}"`
                  }
                  return str
                })
                .join(",")
            })
            .join("\n") + "\n"

        csvString += rowsStr

        // 流式追加写入（调用主进程接口）
        await window.api.dataClean.fs.appendText(filePath, csvString)

        ctx.metrics.mainRows += chunk.rows.length
      }
    } finally {
      if (iterator.return) await iterator.return()
    }

    return null // Writer 返回空
  },
}
