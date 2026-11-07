import { DB_DRIVERS } from "../../core/db/DBDrivers.js"

export const meta = {
  type: "dbConnection",
  label: "DB Connection",
  icon: "IconDatabase",
  category: "source",
  inputs: 0,
  outputs: 1,
  inputCategory: null,
  outputCategory: "table",
  supportedEngines: ["js"],
  schema: [
    {
      field: "dialect",
      label: "数据库",
      component: "select",
      options: Object.keys(DB_DRIVERS).map(k => ({ label: DB_DRIVERS[k].label, value: k })),
    },
    { field: "host", label: "主机", component: "input", defaultValue: "localhost" },
    { field: "port", label: "端口", component: "input" },
    { field: "database", label: "数据库", component: "input" },
    { field: "user", label: "用户", component: "input" },
    { field: "password", label: "密码", component: "password" },
  ],
}
