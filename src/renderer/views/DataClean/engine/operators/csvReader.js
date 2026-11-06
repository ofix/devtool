import Papa from "papaparse"
import { DATA_CATEGORY } from "../../constants/DataCategories.js"
import StreamDataset from "../runtime/StreamDataset.js"
import CsvStreamParser from "../runtime/CsvStreamParser.js"

const SMALL_FILE_THRESHOLD = 100 * 1024 * 1024 // 100MB 以下走全量内存

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

    const encoding = params.encoding || "utf-8"
    const cacheKey = `${filePath}::${encoding}`

    // ================== 1. 尝试命中全量快照缓存 ==================
    if (ctx.snapshotCache && ctx.snapshotCache.has(cacheKey)) {
      const cached = ctx.snapshotCache.get(cacheKey)
      if (ctx.log) ctx.log(`[CSV Reader] 命中全量快照缓存，极速响应...`)

      async function* cachedGenerator() {
        const CHUNK_SIZE = 100000
        for (let i = 0; i < cached.rows.length; i += CHUNK_SIZE) {
          if (ctx.signal.aborted) return
          const chunkRows = cached.rows.slice(i, i + CHUNK_SIZE)
          if (ctx.metrics) ctx.metrics.mainRows += chunkRows.length
          yield { columns: cached.columns, rows: chunkRows }
          await new Promise(resolve => setTimeout(resolve, 0))
        }
      }

      return new StreamDataset({
        dataCategory: DATA_CATEGORY.TABLE,
        columns: cached.columns,
        controller: { sourceGenerator: cachedGenerator, strategy: "rendezvous" },
      })
    }

    // ================== 2. 无缓存，开始读取文件 ==================
    const stat = await window.api.dataClean.fs.stat(filePath)
    if (!stat || !stat.isFile) throw new Error("文件不存在")

    // ------- 2.1 小文件模式（全量内存极速解析） -------
    if (stat.size < SMALL_FILE_THRESHOLD) {
      if (ctx.log)
        ctx.log(
          `[CSV Reader] 小文件模式 (${(stat.size / 1024 / 1024).toFixed(2)} MB)，启动极速解析...`,
        )

      const text = await window.api.dataClean.fs.readFile(filePath)
      const results = Papa.parse(text, { header: true, skipEmptyLines: true, encoding })

      const columns = results.meta.fields
        ? results.meta.fields.map(name => ({ name, type: "string" }))
        : []
      const allRows = results.data

      // 👇 核心：将全量解析结果写入 Engine 的全局快照缓存
      if (ctx.snapshotCache) {
        ctx.snapshotCache.set(cacheKey, { rows: allRows, columns })
      }

      async function* memoryStreamGenerator() {
        const CHUNK_SIZE = 5000
        for (let i = 0; i < allRows.length; i += CHUNK_SIZE) {
          if (ctx.signal.aborted) return
          const chunkRows = allRows.slice(i, i + CHUNK_SIZE)
          if (ctx.metrics) ctx.metrics.mainRows += chunkRows.length
          yield { columns, rows: chunkRows }
          await new Promise(resolve => setTimeout(resolve, 0))
        }
      }

      return new StreamDataset({
        dataCategory: DATA_CATEGORY.TABLE,
        columns,
        controller: { sourceGenerator: memoryStreamGenerator, strategy: "rendezvous" },
      })
    }

    // ------- 2.2 大文件模式（分块流式读取） -------
    if (ctx.log)
      ctx.log(
        `[CSV Reader] 大文件模式 (${(stat.size / 1024 / 1024).toFixed(2)} MB)，启动流式解析...`,
      )

    // 先探测表头
    const headerParser = new CsvStreamParser(filePath, ctx, { encoding })
    await headerParser.start()
    await headerParser.headerReadyPromise
    const detectedColumns = headerParser.columns
    headerParser.stop()

    const generatorFactory = () => {
      return (async function* () {
        const freshParser = new CsvStreamParser(filePath, ctx, { encoding })
        await freshParser.start()
        await freshParser.headerReadyPromise
        try {
          yield* freshParser.createIterator()
        } finally {
          freshParser.stop()
        }
      })()
    }

    return new StreamDataset({
      dataCategory: DATA_CATEGORY.TABLE,
      columns: detectedColumns,
      controller: { sourceGenerator: generatorFactory, strategy: "rendezvous" },
    })
  },
}
