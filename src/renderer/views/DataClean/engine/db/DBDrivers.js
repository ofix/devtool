// 数据库驱动注册表：动态加载，统一接口
export const DB_DRIVERS = {
  postgres: {
    label: "PostgreSQL",
    knexClient: "pg",
    loadDriver: () => import("pg"),
    isFileBased: false,
    defaultPort: 5432,
  },
  mysql: {
    label: "MySQL",
    knexClient: "mysql2",
    loadDriver: () => import("mysql2"),
    isFileBased: false,
    defaultPort: 3306,
  },
  mariadb: {
    label: "MariaDB",
    knexClient: "mariadb",
    loadDriver: () => import("mariadb"),
    isFileBased: false,
    defaultPort: 3306,
  },
  mssql: {
    label: "SQL Server",
    knexClient: "tedious",
    loadDriver: () => import("tedious"),
    isFileBased: false,
    defaultPort: 1433,
  },
  sqlite: {
    label: "SQLite",
    knexClient: "better-sqlite3",
    loadDriver: () => import("better-sqlite3"),
    isFileBased: true,
    defaultPort: null,
  },
}
