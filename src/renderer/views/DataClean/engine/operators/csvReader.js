import Papa from "papaparse"
import { DATA_CATEGORY } from "../../constants/DataCategories.js"
import StreamDataset from "../runtime/StreamDataset.js"

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

    let detectedColumns = []
    let resolveFirstHeader
    const headerPromise = new Promise(r => (resolveFirstHeader = r))

    async function* streamGenerator() {
      let chunksQueue = [] // 存放已经解析好的数据块
      let isDone = false
      let textBuffer = ""
      let streamId = null
      let cleanupListeners = []

      const decoder = new TextDecoder(params.encoding || "utf-8")

      // 全局的 Papa 解析引擎
      const parser = Papa.parse(Papa.NODE_STREAM_INPUT, {
        header: true,
        skipEmptyLines: true,
      })

      parser.on("data", row => {
        chunksQueue.push(row)
      })

      parser.on("end", () => {
        isDone = true
      })

      function processText(text) {
        textBuffer += text
        const lastNewlineIndex = textBuffer.lastIndexOf("\n")
        if (lastNewlineIndex === -1) return

        const completeText = textBuffer.slice(0, lastNewlineIndex + 1)
        textBuffer = textBuffer.slice(lastNewlineIndex + 1)

        // 解析当前完整的文本块
        Papa.parse(completeText, {
          header: true,
          skipEmptyLines: true,
          step: results => {
            if (detectedColumns.length === 0 && results.meta.fields) {
              detectedColumns = results.meta.fields.map(name => ({ name, type: "string" }))
              resolveFirstHeader()
            }
            chunksQueue.push(results.data)
          },
        })
      }

      // 1. 启动读取
      streamId = await window.api.dataClean.fs.startStream(filePath)

      const removeData = window.api.dataClean.fs.onStreamData(streamId, chunk => {
        const text = decoder.decode(chunk, { stream: true })
        if (text) processText(text)
      })

      const removeEnd = window.api.dataClean.fs.onStreamEnd(streamId, () => {
        if (textBuffer.trim()) {
          Papa.parse(textBuffer, {
            header: true,
            skipEmptyLines: true,
            step: results => {
              chunksQueue.push(results.data)
            },
          })
        }
        isDone = true
      })

      const removeErr = window.api.dataClean.fs.onStreamError(streamId, err => {
        console.error("流式异常", err)
        isDone = true
      })

      cleanupListeners = [removeData, removeEnd, removeErr]

      await headerPromise // 等待表头就绪，UI 才能显示列

      try {
        while (true) {
          if (chunksQueue.length > 0) {
            // 把当前攒下的行全取出来，打包成一个 Chunk 给下游
            const batch = chunksQueue
            chunksQueue = []
            yield batch
          } else if (isDone) {
            break
          } else {
            // 队列空，等一小会儿再检查（简单微任务轮询，比闭包 Promise 稳 100 倍）
            await new Promise(r => setTimeout(r, 10))
          }
        }
      } finally {
        if (streamId) {
          window.api.dataClean.fs.abortStream(streamId)
        }
        cleanupListeners.forEach(fn => fn())
      }
    }

    return new StreamDataset({
      dataCategory: DATA_CATEGORY.TABLE,
      columns: detectedColumns,
      generator: streamGenerator,
    })
  },
}
