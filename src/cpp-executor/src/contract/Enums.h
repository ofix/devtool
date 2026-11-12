#pragma once
#include <stdexcept>
#include <string>

namespace dc {

enum class PortKind { kChunk, kTable, kJson, kText };
enum class ResultKind { kDbTable, kSqlCte, kJson, kText };
enum class ExecuteMode { kStream, kBarrier };

inline const char* ToString(PortKind k) {
  switch (k) {
    case PortKind::kChunk:
      return "chunk";
    case PortKind::kTable:
      return "table";
    case PortKind::kJson:
      return "json";
    case PortKind::kText:
      return "text";
  }
  return "?";
}
inline const char* ToString(ResultKind k) {
  switch (k) {
    case ResultKind::kDbTable:
      return "db_table";
    case ResultKind::kSqlCte:
      return "sql_cte";
    case ResultKind::kJson:
      return "json";
    case ResultKind::kText:
      return "text";
  }
  return "?";
}
inline const char* ToString(ExecuteMode k) {
  return k == ExecuteMode::kStream ? "stream" : "barrier";
}

inline PortKind ParsePortKind(const std::string& s) {
  if (s == "chunk") return PortKind::kChunk;
  if (s == "table") return PortKind::kTable;
  if (s == "json") return PortKind::kJson;
  if (s == "text") return PortKind::kText;
  throw std::invalid_argument("PortKind: " + s);
}
inline ResultKind ParseResultKind(const std::string& s) {
  if (s == "db_table") return ResultKind::kDbTable;
  if (s == "sql_cte") return ResultKind::kSqlCte;
  if (s == "json") return ResultKind::kJson;
  if (s == "text") return ResultKind::kText;
  throw std::invalid_argument("ResultKind: " + s);
}
inline ExecuteMode ParseExecuteMode(const std::string& s) {
  if (s == "stream") return ExecuteMode::kStream;
  if (s == "barrier") return ExecuteMode::kBarrier;
  throw std::invalid_argument("ExecuteMode: " + s);
}

// §6.1 唯一映射
inline ResultKind ToResultKind(PortKind pk) {
  switch (pk) {
    case PortKind::kChunk:
      return ResultKind::kDbTable;
    case PortKind::kTable:
      return ResultKind::kDbTable;
    case PortKind::kJson:
      return ResultKind::kJson;
    case PortKind::kText:
      return ResultKind::kText;
  }
  throw std::logic_error("unreachable PortKind");
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

inline TransformKind ResolveTransform(PortKind src, PortKind dst) {
  if (src == dst) return TransformKind::kNone;
  struct Row {
    PortKind s, d;
    TransformKind t;
  };
  static const Row kRows[] = {
      {PortKind::kChunk, PortKind::kTable, TransformKind::kChunkToTable},
      {PortKind::kTable, PortKind::kChunk, TransformKind::kTableToChunk},
      {PortKind::kJson, PortKind::kChunk, TransformKind::kJsonToChunk},
      {PortKind::kChunk, PortKind::kJson, TransformKind::kChunkToJson},
      {PortKind::kTable, PortKind::kJson, TransformKind::kTableToJson},
      {PortKind::kJson, PortKind::kTable, TransformKind::kJsonToTable},
      {PortKind::kText, PortKind::kJson, TransformKind::kTextToJson},
      {PortKind::kJson, PortKind::kText, TransformKind::kJsonToText},
      {PortKind::kTable, PortKind::kText, TransformKind::kTableToText},
      {PortKind::kText, PortKind::kChunk, TransformKind::kTextToChunk},
  };
  for (auto& r : kRows)
    if (r.s == src && r.d == dst) return r.t;
  throw std::logic_error(std::string("no transform: ") + ToString(src) + "->" +
                         ToString(dst));
}

}  // namespace dc