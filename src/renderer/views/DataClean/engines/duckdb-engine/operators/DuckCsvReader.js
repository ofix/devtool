import { IExecutor } from "../../../core/contract/IExecutor.js"

export class DuckCsvReader extends IExecutor {
  constructor(translator) {
    super()
    this.translator = translator
  }

  async execute(inputs, params, ctx) {
    const filePath = params.filePath
    if (!filePath) throw new Error("请选择文件路径")

    const outTable = `tbl_${ctx.nodeId}`

    // 主进程和 Runner 在同一个文件系统下，路径直接可用
    const safePath = filePath.replace(/\\/g, "/")
    const sql = `CREATE TABLE ${outTable} AS SELECT * FROM read_csv_auto('${safePath}', HEADER=TRUE)`
    await this.translator.executeQuery(sql)

    const schemaRows = await this.translator.executeQuery(`DESCRIBE ${outTable}`)
    const schema = schemaRows.map(row => ({
      name: row.column_name,
      type: row.column_type,
    }))

    const columnMapping = schema.reduce((acc, col) => ({ ...acc, [col.name]: col.name }), {})

    return {
      dataCategory: "table",
      schema,
      columnMapping,
      payload: { tableName: outTable },
    }
  }
}
