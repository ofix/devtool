#pragma once
#include <stdexcept>
#include <string>

namespace dc {

enum class PortDataKind { kChunk, kTable, kSqlCte, kJson, kText };
enum class ExecuteMode { kStream, kBarrier };

inline const char* ToString(PortDataKind k) {
  switch (k) {
    case PortDataKind::kChunk:
      return "chunk";
    case PortDataKind::kTable:
      return "db_table";
    case PortDataKind::kSqlCte:
      return "sql_cte";
    case PortDataKind::kJson:
      return "json";
    case PortDataKind::kText:
      return "text";
  }
  return "?";
}
inline const char* ToString(ExecuteMode k) {
  return k == ExecuteMode::kStream ? "stream" : "barrier";
}

inline PortDataKind ParsePortDataKind(const std::string& s) {
  if (s == "chunk") return PortDataKind::kChunk;
  if (s == "db_table") return PortDataKind::kTable;
  if (s == "sql_cte") return PortDataKind::kSqlCte;
  if (s == "json") return PortDataKind::kJson;
  if (s == "text") return PortDataKind::kText;
  throw std::invalid_argument("PortDataKind: " + s);
}

inline ExecuteMode ParseExecuteMode(const std::string& s) {
  if (s == "stream") return ExecuteMode::kStream;
  if (s == "barrier") return ExecuteMode::kBarrier;
  throw std::invalid_argument("ExecuteMode: " + s);
}

enum class TransformKind {
  kNone = 0,
  kChunkToTable,
  kTableToChunk,
  kJsonToChunk,
  kChunkToJson,
  kTableToJson,
  kJsonToTable,
  kTextToJson,
  kJsonToText,
  kTableToText,
  kTextToChunk,
};

inline const char* ToString(TransformKind t) {
  switch (t) {
    case TransformKind::kNone:
      return "null";
    case TransformKind::kChunkToTable:
      return "chunk_to_table";
    case TransformKind::kTableToChunk:
      return "table_to_chunk";
    case TransformKind::kJsonToChunk:
      return "json_to_chunk";
    case TransformKind::kChunkToJson:
      return "chunk_to_json";
    case TransformKind::kTableToJson:
      return "table_to_json";
    case TransformKind::kJsonToTable:
      return "json_to_table";
    case TransformKind::kTextToJson:
      return "text_to_json";
    case TransformKind::kJsonToText:
      return "json_to_text";
    case TransformKind::kTableToText:
      return "table_to_text";
    case TransformKind::kTextToChunk:
      return "text_to_chunk";
  }
  return "?";
}
inline TransformKind ParseTransformKind(const std::string& s) {
  if (s == "null" || s == "none") return TransformKind::kNone;
  if (s == "chunk_to_table") return TransformKind::kChunkToTable;
  if (s == "table_to_chunk") return TransformKind::kTableToChunk;
  if (s == "json_to_chunk") return TransformKind::kJsonToChunk;
  if (s == "chunk_to_json") return TransformKind::kChunkToJson;
  if (s == "table_to_json") return TransformKind::kTableToJson;
  if (s == "json_to_table") return TransformKind::kJsonToTable;
  if (s == "text_to_json") return TransformKind::kTextToJson;
  if (s == "json_to_text") return TransformKind::kJsonToText;
  if (s == "table_to_text") return TransformKind::kTableToText;
  if (s == "text_to_chunk") return TransformKind::kTextToChunk;
  throw std::invalid_argument("TransformKind: " + s);
}

inline TransformKind ResolveTransform(PortDataKind src, PortDataKind dst) {
  if (src == dst) return TransformKind::kNone;
  struct Row {
    PortDataKind s, d;
    TransformKind t;
  };
  static const Row kRows[] = {
      {PortDataKind::kChunk, PortDataKind::kTable,
       TransformKind::kChunkToTable},
      {PortDataKind::kTable, PortDataKind::kChunk,
       TransformKind::kTableToChunk},
      {PortDataKind::kJson, PortDataKind::kChunk, TransformKind::kJsonToChunk},
      {PortDataKind::kChunk, PortDataKind::kJson, TransformKind::kChunkToJson},
      {PortDataKind::kTable, PortDataKind::kJson, TransformKind::kTableToJson},
      {PortDataKind::kJson, PortDataKind::kTable, TransformKind::kJsonToTable},
      {PortDataKind::kText, PortDataKind::kJson, TransformKind::kTextToJson},
      {PortDataKind::kJson, PortDataKind::kText, TransformKind::kJsonToText},
      {PortDataKind::kTable, PortDataKind::kText, TransformKind::kTableToText},
      {PortDataKind::kText, PortDataKind::kChunk, TransformKind::kTextToChunk},
  };
  for (auto& r : kRows)
    if (r.s == src && r.d == dst) return r.t;
  throw std::logic_error(std::string("no transform: ") + ToString(src) + "->" +
                         ToString(dst));
}

}  // namespace dc