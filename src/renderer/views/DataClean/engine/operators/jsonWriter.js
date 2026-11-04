import { DATA_CATEGORY } from "../../constants/DataCategories.js"

export default {
  type: "jsonWriter",
  meta: {
    label: "JSON Writer",
    icon: "IconFileExport",
    color: "#10b981",
    category: "output",
    inputs: 1,
    outputs: 0,
    inputCategory: [DATA_CATEGORY.TABLE, DATA_CATEGORY.JSON],
  },
  schema: [
    { field: "filePath", label: "保存路径", component: "saveFile", extensions: ["json"] },
    { field: "minify", label: "压缩输出", component: "switch", defaultValue: false },
    {
      field: "indent",
      label: "缩进空格 (2 或 4)",
      component: "select",
      defaultValue: "2",
      options: [
        { label: "2", value: "2" },
        { label: "4", value: "4" },
      ],
      showWhen: p => !p.minify,
    },
  ],
  async execute(inputs, params) {
    const input = inputs[0]
    if (!input) throw new Error("无输入数据")
    if (!params.filePath) throw new Error("请选择保存路径")

    let dataToExport = null

    if (input.dataCategory === "table") {
      dataToExport = input.rows
    } else if (input.dataCategory === "json") {
      dataToExport = input.json
    } else {
      throw new Error("不支持的数据类型")
    }

    let content = ""
    if (params.minify) {
      content = JSON.stringify(dataToExport)
    } else {
      const space = params.indent === "4" ? 4 : 2
      content = JSON.stringify(dataToExport, null, space)
    }

    if (!window.api.dataClean.fs.writeFile) {
      throw new Error("缺少主进程 writeFile IPC 接口")
    }
    await window.api.dataClean.fs.writeFile(params.filePath, content)
    return input
  },
}
