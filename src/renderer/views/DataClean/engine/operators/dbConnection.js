import { DB_DRIVERS } from "../db/DBDrivers.js"
import { dbManager } from "../db/DbManager.js"

export default {
  type: "dbConnection",
  meta: {
    label: "DB Connection",
    icon: "IconDatabase",
    color: "#0891b2",
    category: "source",
    inputs: 0,
    outputs: 1,
    inputPortType: null,
    outputPortType: "table",
  },
  schema: [
    {
      field: "dialect",
      label: "数据库",
      component: "select",
      options: Object.keys(DB_DRIVERS).map(k => ({ label: DB_DRIVERS[k].label, value: k })),
    },
    {
      field: "filePath",
      label: "文件",
      component: "file",
      showWhen: p => DB_DRIVERS[p.dialect]?.isFileBased,
    },
    {
      field: "host",
      label: "主机",
      component: "input",
      showWhen: p => !DB_DRIVERS[p.dialect]?.isFileBased,
      defaultValue: "localhost",
    },
    {
      field: "port",
      label: "端口",
      component: "input",
      showWhen: p => !DB_DRIVERS[p.dialect]?.isFileBased,
    },
    {
      field: "database",
      label: "数据库",
      component: "input",
      showWhen: p => !DB_DRIVERS[p.dialect]?.isFileBased,
    },
    {
      field: "user",
      label: "用户",
      component: "input",
      showWhen: p => !DB_DRIVERS[p.dialect]?.isFileBased,
    },
    {
      field: "password",
      label: "密码",
      component: "password",
      showWhen: p => !DB_DRIVERS[p.dialect]?.isFileBased,
    },
  ],
  async execute(_inputs, params, ctx) {
    if (ctx && typeof ctx.log === "function") {
      ctx.log(`正在连接 ${DB_DRIVERS[params.dialect]?.label || params.dialect}...`)
    }

    await dbManager.createConnection(ctx.nodeId, params)

    if (ctx && typeof ctx.log === "function") {
      ctx.log(`连接成功`)
    }

    return { rows: [], columns: [] }
  },
}
