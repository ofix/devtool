export class SqlTranslator {
  async executeQuery(sql) {
    // 直接通过 preload 暴露的接口调用主进程
    return await window.api.dataClean.duckdb.query(sql)
  }

  async fetchPreview(tableName, limit = 1000) {
    if (!tableName) return []
    const rows = await this.executeQuery(`SELECT * FROM ${tableName} LIMIT ${limit}`)
    return rows || []
  }
}
