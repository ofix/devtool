#include "Operators.h"
#include "DuckDBBridge.h"
#include "util/Json.h"
#include <sstream>
#include <stdexcept>

namespace dc::ops {

// 用 SQL 字符串字面量转义：单引号 → 两个单引号
static std::string Sq(const std::string& s) {
  std::string out; out.reserve(s.size() + 2);
  for (char c : s) { if (c == '\'') out += "''"; else out += c; }
  return out;
}

// 标识符引用：双引号包裹，内部双引号转义（R-23）
static std::string Qi(const std::string& id) {
  std::string out = "\""; 
  for (char c : id) { if (c == '"') out += "\"\""; else out += c; }
  out += "\"";
  return out;
}

static std::string ComputeSchemaVersion(duckdb::Connection& conn, const std::string& table) {
  auto r = conn.Query("DESCRIBE " + table + ";");
  if (r->HasError()) throw std::runtime_error(r->GetError());
  std::ostringstream s;
  for (duckdb::idx_t i = 0; i < r->RowCount(); ++i)
    s << r->GetValue<std::string>(0, i) << ":"
      << r->GetValue<std::string>(1, i) << ";";
  return std::to_string(std::hash<std::string>{}(s.str()));
}

OpResult RunCsvReader(DuckDBBridge& db, const EtlTaskNode& node) {
  json p = json::parse(node.paramsJson);
  std::string path = p.value("path", "");
  if (path.empty()) throw std::runtime_error("CsvReader: params.path required");
  std::string delim = p.value("delimiter", ",");
  bool header = p.value("header", true);

  std::string table = node.outputTable.empty() ? ("__tmp_" + node.nodeId)
                                               : node.outputTable;
  std::string sql =
    "CREATE OR REPLACE TABLE " + Qi(table) + " AS "
    "SELECT row_number() OVER () - 1 AS __row_seq, * FROM read_csv_auto('" +
    Sq(path) + "', delim='" + Sq(delim) + "', header=" + (header ? "true" : "false") + ");";

  auto res = db.conn().Query(sql);
  if (res->HasError()) throw std::runtime_error("CsvReader: " + res->GetError());

  auto cnt = db.conn().Query("SELECT count(*) FROM " + Qi(table) + ";");
  OpResult out;
  out.rowCount = cnt->GetValue<int64_t>(0, 0);
  out.schemaVersion = ComputeSchemaVersion(db.conn(), Qi(table));
  return out;
}

OpResult RunFilter(DuckDBBridge& db, const EtlTaskNode& node) {
  json p = json::parse(node.paramsJson);
  std::string expr = p.value("expression", "");
  std::string srcTable = p.value("_srcTable", "");
  if (expr.empty())    throw std::runtime_error("Filter: params.expression required");
  if (srcTable.empty())throw std::runtime_error("Filter: _srcTable required");

  std::string out = node.outputTable.empty() ? ("__tmp_" + node.nodeId)
                                             : node.outputTable;
  std::string sql = "CREATE OR REPLACE TABLE " + Qi(out) +
                    " AS SELECT * FROM " + Qi(srcTable) +
                    " WHERE " + expr + ";";
  auto res = db.conn().Query(sql);
  if (res->HasError()) throw std::runtime_error("Filter: " + res->GetError());

  auto cnt = db.conn().Query("SELECT count(*) FROM " + Qi(out) + ";");
  OpResult r;
  r.rowCount = cnt->GetValue<int64_t>(0, 0);
  r.schemaVersion = ComputeSchemaVersion(db.conn(), Qi(out));
  return r;
}

} // namespace dc::ops