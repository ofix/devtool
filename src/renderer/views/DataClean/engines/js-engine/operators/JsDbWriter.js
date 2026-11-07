import { BaseJsOperator } from "./BaseJsOperator.js"
import { dbManager } from "../../../core/db/DbManager.js"

export class JsDbWriter extends BaseJsOperator {
  async execute(inputs, params, ctx) {
    const inputData = inputs[0]
    if (!inputData) throw new Error("无输入数据")
    if (inputData.dataCategory !== "table") throw new Error("DB Writer 仅接受表格数据")

    const cfg = params.dbConfig
    if (!cfg || !cfg.tableName) throw new Error("请先配置数据库连接和目标表")

    // 👇 核心修复 1：提取真实的流和 schema
    const streamDataset = inputData.payload.streamDataset
    const schema = inputData.schema

    // 1. 建立数据库连接
    await dbManager.createConnection(cfg.nodeId, {
      dialect: cfg.dialect,
      host: cfg.host,
      port: cfg.port,
      database: cfg.database,
      user: cfg.user,
      password: cfg.password,
      filePath: cfg.filePath,
    })

    try {
      // 2. 自动建表
      if (cfg.autoCreate) {
        const columnsToCreate = schema.map(c => {
          const userMapping = (cfg.columnMappings || []).find(m => m.source === c.name)
          return {
            name: userMapping ? userMapping.target : c.name,
            dbType: userMapping ? userMapping.dbType : "text",
          }
        })
        await dbManager.createTable(cfg.nodeId, cfg.tableName, columnsToCreate)
      }

      // 3. 流式消费并写入
      const generator = async function* (self) {
        let batchBuffer = []
        const BATCH_SIZE = cfg.batchSize || 500

        for await (const chunk of self.pullStream(streamDataset, ctx.nodeId, ctx)) {
          if (ctx.signal.aborted) break

          for (const row of chunk.rows) {
            const newRow = {}
            for (const m of cfg.columnMappings || []) {
              if (m.source && m.target) {
                newRow[m.target] = row[m.source]
              }
            }
            batchBuffer.push(newRow)

            // 攒够一批，写入数据库并清空缓存
            if (batchBuffer.length >= BATCH_SIZE) {
              await dbManager.insertBatch(
                cfg.nodeId,
                cfg.tableName,
                batchBuffer,
                "append",
                BATCH_SIZE,
              )
              batchBuffer = []
              await new Promise(r => setTimeout(r, 0)) // 让出主线程
            }
          }
        }

        // 写入最后残余的一批
        if (batchBuffer.length > 0) {
          await dbManager.insertBatch(cfg.nodeId, cfg.tableName, batchBuffer, "append", BATCH_SIZE)
        }
      }

      if (ctx.log) ctx.log(`[JsDbWriter] 开始流式写入数据库: ${cfg.tableName}`)

      // 启动流消费
      const iterator = generator.bind(null, this)()
      await iterator.next()

      if (ctx.log) ctx.log(`[JsDbWriter] 写入完成`)
    } finally {
      // 4. 确保断开连接
      await dbManager.destroyConnection(cfg.nodeId)
    }

    return inputData
  }
}
