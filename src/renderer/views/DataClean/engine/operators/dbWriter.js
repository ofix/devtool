import { DATA_CATEGORY } from "../../constants/DataCategories.js"
import { dbManager } from "../db/DbManager.js"

export default {
  type: "dbWriter",
  meta: {
    label: "DB Writer",
    icon: "IconDatabase",
    color: "#10b981",
    category: "output",
    inputs: 1,
    outputs: 0,
    inputCategory: DATA_CATEGORY.TABLE,
  },
  schema: [{ field: "dbConfig", label: "数据库配置", component: "dbWriterConfig" }],
  async execute(inputs, params) {
    const table = inputs[0]
    if (!table || table.dataCategory !== "table") {
      throw new Error("DB Writer 仅接受表格数据")
    }

    const cfg = params.dbConfig
    if (!cfg || !cfg.tableName) {
      throw new Error("请先配置数据库连接和目标表")
    }

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
      if (cfg.autoCreate) {
        const columnsToCreate = table.columns.map(c => {
          const userMapping = (cfg.columnMappings || []).find(m => m.source === c.name)
          return {
            name: userMapping ? userMapping.target : c.name,
            dbType: userMapping ? userMapping.dbType : "text",
          }
        })
        await dbManager.createTable(cfg.nodeId, cfg.tableName, columnsToCreate)
      }

      const insertRows = table.rows.map(row => {
        const newRow = {}
        for (const m of cfg.columnMappings || []) {
          if (m.source && m.target) {
            newRow[m.target] = row[m.source]
          }
        }
        return newRow
      })

      await dbManager.insertBatch(
        cfg.nodeId,
        cfg.tableName,
        insertRows,
        cfg.writeMode,
        cfg.batchSize || 500,
      )
    } finally {
      await dbManager.destroyConnection(cfg.nodeId)
    }

    return table
  },
}
