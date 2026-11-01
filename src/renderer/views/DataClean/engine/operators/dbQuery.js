import { dbManager } from "../db/DbManager.js"

export default {
  type: "dbQuery",
  meta: {
    label: "DB Query",
    icon: "IconDatabase",
    color: "#06b6d4",
    category: "source",
    inputs: 1,
    outputs: 1,
    inputPortType: "table",
    outputPortType: "table",
  },
  schema: [{ field: "sql", label: "SQL 查询", component: "expression" }],
  async execute(inputs, params, ctx) {
    const sql = params.sql ? params.sql.trim() : ""
    if (!sql) {
      throw new Error("未配置 SQL 查询语句")
    }

    const incoming = ctx.graphStore.getIncomingEdges(ctx.nodeId)
    if (incoming.length === 0) throw new Error("请先连接 DB Connection 节点")

    const connNodeId = incoming[0].source
    const instance = dbManager.getConnection(connNodeId)

    if (!instance) {
      throw new Error("上游数据库连接尚未建立或已失效，请重新运行上游节点")
    }

    if (ctx && typeof ctx.log === "function") {
      ctx.log(`正在执行 SQL: ${sql.substring(0, 50)}${sql.length > 50 ? "..." : ""}`)
    }

    try {
      const result = await instance.raw(sql)

      let rows = []
      if (Array.isArray(result)) {
        rows = Array.isArray(result[0]) ? result[0] : result
      } else if (result && result.rows) {
        rows = result.rows
      } else if (result && result.recordset) {
        rows = result.recordset
      }

      const columns = []
      if (rows.length > 0) {
        const keys = Object.keys(rows[0])
        keys.forEach(k => {
          const val = rows[0][k]
          let type = "string"
          if (typeof val === "number") type = "number"
          else if (typeof val === "boolean") type = "boolean"
          else if (val instanceof Date) type = "date"
          columns.push({ name: k, type })
        })
      }

      if (ctx && typeof ctx.log === "function") {
        ctx.log(`查询完成，返回 ${rows.length} 行`)
      }

      return { rows, columns }
    } catch (err) {
      throw new Error(`SQL 执行失败: ${err.message}`)
    }
  },
}
