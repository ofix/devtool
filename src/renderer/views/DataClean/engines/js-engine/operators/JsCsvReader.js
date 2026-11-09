import { BaseJsOperator } from "./BaseJsOperator.js"
import StreamDataset from "../runtime/StreamDataset.js"
import CsvStreamParser from "../runtime/CsvStreamParser.js"
import Papa from "papaparse"

const SMALL_FILE_THRESHOLD = 20 * 1024 * 1024 // 20MB 以下走全量极速模式

export class JsCsvReader extends BaseJsOperator {
  async execute(inputs, params, ctx) {
    console.log("[JsCsvReader] 开始执行，参数:", params)
    const filePath = params.filePath
    if (!filePath) throw new Error("请选择文件路径")

    const encoding = params.encoding || "utf-8"
    const cacheKey = `${filePath}::${encoding}`

    // 1. 尝试命中内存快照缓存
    if (ctx.snapshotCache && ctx.snapshotCache.has(cacheKey)) {
      const cached = ctx.snapshotCache.get(cacheKey)
      if (ctx.log) ctx.log(`[JsCsvReader] 命中内存缓存...`)

      async function* cachedGenerator() {
        const CHUNK_SIZE = 5000
        for (let i = 0; i < cached.rows.length; i += CHUNK_SIZE) {
          if (ctx.signal.aborted) return
          const chunkRows = cached.rows.slice(i, i + CHUNK_SIZE)
          if (ctx.metrics) ctx.metrics.mainRows += chunkRows.length
          yield { columns: cached.columns, rows: chunkRows }
          await new Promise(resolve => setTimeout(resolve, 0))
        }
      }

      const columnMapping = cached.columns.reduce(
        (acc, col) => ({ ...acc, [col.name]: col.name }),
        {},
      )
      console.log("[JsCsvReader] 准备返回 DataHandle，列数:", columns.length)
      // 核心改造：通过 buildHandle 返回标准 DataHandle
      return this.buildHandle(cached.columns, columnMapping, cachedGenerator)
    }

    // 2. 读取文件属性
    const stat = await window.api.dataClean.fs.stat(filePath)
    if (!stat || !stat.isFile) throw new Error("文件不存在")
    console.log("[JsCsvReader] 准备获取文件属性...")
    // 3. 小文件模式
    if (stat.size < SMALL_FILE_THRESHOLD) {
      console.log("[JsCsvReader] 走小文件模式，准备读文件...")
      if (ctx.log)
        ctx.log(
          `[JsCsvReader] 小文件模式 (${(stat.size / 1024 / 1024).toFixed(2)} MB)，启动极速解析...`,
        )

      const text = await window.api.dataClean.fs.readFile(filePath)
      console.log("[JsCsvReader] 读文件成功，准备解析...")
      const results = Papa.parse(text, { header: true, skipEmptyLines: true, encoding })
      console.log("[JsCsvReader] 解析成功，行数:", results.data.length)
      const columns = results.meta.fields
        ? results.meta.fields.map(name => ({ name, type: "string" }))
        : []
      const allRows = results.data

      // 写入快照缓存
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

      const columnMapping = columns.reduce((acc, col) => ({ ...acc, [col.name]: col.name }), {})
      return this.buildHandle(columns, columnMapping, memoryStreamGenerator)
    }

    // 4. 大文件模式
    if (ctx.log)
      ctx.log(
        `[JsCsvReader] 大文件模式 (${(stat.size / 1024 / 1024).toFixed(2)} MB)，启动流式解析...`,
      )
    console.log("[JsCsvReader] 走大文件模式，准备流式解析...")

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
      console.log("[JsCsvReader] generatorFactory 流式解析生成器创建成功")
    }

    console.log("[JsCsvReader] 流式解析准备就绪，列数:", detectedColumns.length)

    const columnMapping = detectedColumns.reduce(
      (acc, col) => ({ ...acc, [col.name]: col.name }),
      {},
    )
    return this.buildHandle(detectedColumns, columnMapping, generatorFactory)
  }
}
