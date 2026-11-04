import { DATA_CATEGORY } from "../../constants/DataCategories.js"

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
    { field: "delimiter", label: "分隔符", component: "input", defaultValue: "," },
  ],
  async execute(inputs, params) {
    const table = inputs[0]
    if (!table || table.dataCategory !== "table") {
      throw new Error("CSV Writer 仅接受表格数据")
    }
    if (!params.filePath) throw new Error("请选择保存路径")

    const delimiter = params.delimiter || ","
    const lines = []

    if (params.includeHeader !== false) {
      lines.push(table.columns.map(c => c.name).join(delimiter))
    }

    for (const row of table.rows) {
      const line = table.columns
        .map(c => {
          let val = row[c.name]
          if (val === null || val === undefined) return ""
          let str = String(val)
          if (str.includes(delimiter) || str.includes('"') || str.includes("\n")) {
            str = `"${str.replace(/"/g, '""')}"`
          }
          return str
        })
        .join(delimiter)
      lines.push(line)
    }

    const content = lines.join("\n")
    // 假设你有 writeFile 接口
    if (!window.api.dataClean.fs.writeFile) {
      throw new Error("缺少主进程 writeFile IPC 接口")
    }
    await window.api.dataClean.fs.writeFile(params.filePath, content)
    return table
  },
}
