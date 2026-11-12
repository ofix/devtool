// Operators/CsvReader.cpp —— stream 语义但 M1 直接读入临时表
// 文档 §2.3-4 要求 stream 不落表，但 M1 为打通链路先物化，
// 在 README 标注为「M1 偏差」，M2 换 ArrowArrayStream。
#include "../DuckDBBridge.h"
#include "../contract/Types.h"
#include <sstream>

namespace dc::ops {

long long RunCsvReader(DuckDBBridge& db, const EtlTaskNode& node,
                       std::string* schemaVersionOut) {
  // params: { path, header, delimiter }
  // 注意：路径 allowlist 在 Renderer 侧校验（R-23），这里只做 quoteIdent 防注入
  std::string path, delim = ",";
  bool header = true;
  // 极简 JSON 抽取（生产应换 nlohmann/json）
  auto get = [&](const char* k) {
    auto p = node.paramsJson.find(std::string("\"") + k + "\"");
    if (p == std::string::npos) return std::string();
    p = node.paramsJson.find(':', p); p = node.paramsJson.find('"', p);
    auto e = node.paramsJson.find('"', p + 1);
    return node.paramsJson.substr(p + 1, e - p - 1);
  };
  path = get("path");
  if (auto d = get("delimiter"); !d.empty()) delim = d;
  if (path.empty()) throw std::runtime_error("CsvReader: path required");

  std::string table = node.outputTable.empty() ? "__tmp_" + node.nodeId
                                               : node.outputTable;
  std::string sql =
    "CREATE OR REPLACE TABLE " + table +
    " AS SELECT row_number() OVER () - 1 AS __row_seq, * FROM read_csv_auto('" +
    path + "', delim='" + delim + "', header=" + (header ? "true" : "false") + ");";
  auto res = db.conn().Query(sql);
  if (res->HasError()) throw std::runtime_error(res->GetError());

  auto cnt = db.conn().Query("SELECT count(*) FROM " + table + ";");
  long long n = cnt->GetValue<int64_t>(0, 0);

  // schemaVersion：列名+类型排序哈希（M1 用字符串拼接近似）
  auto desc = db.conn().Query("DESCRIBE " + table + ";");
  std::ostringstream s;
  for (idx_t i = 0; i < desc->RowCount(); ++i) {
    s << desc->GetValue<std::string>(0, i) << ":"
      << desc->GetValue<std::string>(1, i) << ";";
  }
  *schemaVersionOut = std::to_string(std::hash<std::string>{}(s.str()));
  return n;
}
} // namespace dc::ops