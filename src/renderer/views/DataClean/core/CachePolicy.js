export const STORE_TYPE = {
  MEMORY: "memory",
  SQLITE: "sqlite",
  DUCKDB: "duckdb",
};

export const EXECUTE_MODE = {
  EAGER: "eager",
  LAZY: "lazy",
};

export const OUTPUT_RECORDS_KIND = {
  DB_TABLE: "db_table",
  SQL_CTE: "sql_cte",
  JSON: "json",
  TEXT: "text",
};
