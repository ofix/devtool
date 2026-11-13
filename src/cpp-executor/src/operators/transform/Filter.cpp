// Operators/Filter.cpp —— 用 DuckDB WHERE 实现，输出仍落表
#include "../DuckDBBridge.h"
#include "../contract/Types.h"
#include <sstream>

namespace dc::ops {
long long RunFilter(DuckDBBridge& db, const EtlTaskNode& node,
                    const EtlTask& task, std::string* schemaVersionOut) {
  if (node.inputPorts.empty()) throw std::runtime_error("Filter: no input");
  const auto& in = node.inputPorts[0];

  // M1：incomingTransform 恒为 chunk_to_table/None，因为上游已物化
  std::string srcTable = in.recordSetKey;   // M1 约定 recordSetKey == 表名
  // 生产应从 MetaStore 取；此处由 Scheduler 写进 paramsJson 的 _srcTable
  auto p = node.paramsJson.find("\"_srcTable\"");
  if (p != std::string::npos) {
    p = node.paramsJson.find('"', node.paramsJson.find(':', p));
    auto e = node.paramsJson.find('"', p + 1);
    srcTable = node.paramsJson.substr(p + 1, e - p - 1);
  }

  std::string expr;
  auto ep = node.paramsJson.find("\"expression\"");
  if (ep == std::string::npos) throw std::runtime_error("Filter: expression required");
  ep = node.paramsJson.find('"', node.paramsJson.find(':', ep));
  auto ee = node.paramsJson.find('"', ep + 1);
  expr = node.paramsJson.substr(ep + 1, ee - ep - 1);

  std::string out = node.outputTable.empty() ? "__tmp_" + node.nodeId : node.outputTable;
  std::string sql = "CREATE OR REPLACE TABLE " + out +
                    " AS SELECT * FROM " + srcTable + " WHERE " + expr + ";";
  auto res = db.conn().Query(sql);
  if (res->HasError()) throw std::runtime_error(res->GetError());

  auto cnt = db.conn().Query("SELECT count(*) FROM " + out + ";");
  long long n = cnt->GetValue<int64_t>(0, 0);

  auto desc = db.conn().Query("DESCRIBE " + out + ";");
  std::ostringstream s;
  for (idx_t i = 0; i < desc->RowCount(); ++i)
    s << desc->GetValue<std::string>(0, i) << ":"
      << desc->GetValue<std::string>(1, i) << ";";
  *schemaVersionOut = std::to_string(std::hash<std::string>{}(s.str()));
  return n;
}
} // namespace dc::ops