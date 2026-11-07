import { BaseJsOperator } from "./BaseJsOperator.js"
import { DB_DRIVERS } from "../../../core/db/DBDrivers.js"
import { dbManager } from "../../../core/db/DbManager.js"

export class JsDbConnection extends BaseJsOperator {
  async execute(inputs, params, ctx) {
    const dialect = params.dialect
    const driver = DB_DRIVERS[dialect]
    if (!driver) throw new Error("未配置数据库类型")

    if (ctx.log) ctx.log(`[JsDbConnection] 正在连接 ${driver.label}...`)

    // 1. 建立连接
    await dbManager.createConnection(ctx.nodeId, params)

    // 2. 获取连接实例
    const db = dbManager.getConnection(ctx.nodeId)
    if (!db) throw new Error("数据库连接失败")

    // 3. 默认直接查表（如果 schema 里有 tableName 字段）
    // 注意：如果你后续加了“自定义 SQL”输入框，这里可以改成直接执行 SQL
    const tableName = params.tableName
    if (!tableName) {
      throw new Error("请先在节点配置中指定要读取的数据表名")
    }

    if (ctx.log) ctx.log(`[JsDbConnection] 开始读取表: ${tableName}`)

    // 4. 构建流式生成器
    const generator = async function* () {
      // 因为 dbManager 封装的底层是 Knex.js，我们可以用 stream 流式读取
      const stream = db.select("*").from(tableName).stream()

      let buffer = []
      const MAX_BUFFER = 5000
      let columns = []

      for await (const row of stream) {
        if (ctx.signal.aborted) {
          stream.destroy() // 中断流
          return
        }

        // 首次拿到数据时，推演表结构
        if (columns.length === 0) {
          columns = Object.keys(row).map(k => ({ name: k, type: "string" }))
        }

        buffer.push(row)

        if (buffer.length >= MAX_BUFFER) {
          yield { columns, rows: buffer.splice(0, MAX_BUFFER) }
          await new Promise(r => setTimeout(r, 0)) // 让出主线程
        }
      }

      if (buffer.length > 0) {
        yield { columns, rows: buffer }
      }
    }

    // 5. 返回标准的 DataHandle
    const dummySchema = [{ name: "pending", type: "string" }] // 初始为空
    return this.buildHandle(dummySchema, {}, generator.bind(null, this))
  }
}
