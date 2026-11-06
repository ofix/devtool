import { DATA_CATEGORY } from "../../constants/DataCategories.js"
import StreamDataset from "../runtime/StreamDataset.js"
import CsvStreamParser from "../runtime/CsvStreamParser.js"

export default {
  type: "csvReader",
  meta: {
    label: "CSV Reader",
    icon: "IconFileImport",
    color: "#10b981",
    category: "source",
    inputs: 0,
    outputs: 1,
    outputCategory: DATA_CATEGORY.TABLE,
  },
  schema: [
    { field: "filePath", label: "文件", component: "file", extensions: ["csv", "txt"] },
    { field: "encoding", label: "编码", component: "select", defaultValue: "UTF-8" },
  ],
  async execute(inputs, params, ctx) {
    const filePath = params.filePath
    if (!filePath) throw new Error("请选择文件路径")

    if (ctx?.log) ctx.log(`[CSV Reader] 准备启动流式引擎...`)

    const parser = new CsvStreamParser(filePath, params.encoding || "utf-8")
    
    // 1. 启动通道读取
    await parser.start()

    // 👇 核心修复：在这里阻塞等待表头解析完成
    // 保证 Engine 拿到 StreamDataset 时，columns 已经有值了
    await parser.headerReadyPromise

    // 2. 将解析引擎的迭代器喂给通用 Dataset，返回给 Engine
    return new StreamDataset({
        dataCategory: DATA_CATEGORY.TABLE,
        columns: parser.columns, // 👈 直接传已经就绪的数组
        generator: () => parser.createAsyncIterator()
    })
  },
}