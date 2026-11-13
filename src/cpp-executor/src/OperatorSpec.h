#pragma once
#include <array>
#include <cstdint>
#include <string_view>

namespace dataclean {

enum class ExecuteMode { kStream, kBarrier };
enum class PortDataKind { 
  kChunk,   // 内存中的 Arrow 流
  kTable,   // DuckDB 中的物化表
  kCte,     // DuckDB 中的 CTE 片段（不落表，直接拼 SQL）
  kJson,    // JSON 数据
  kText     // 文本数据
};
enum class ParamKind {
  kString,
  kNumber,
  kBoolean,
  kEnum,
  kColumn,
  kExpression,
  kObject,
  kArray
};

struct PortContract {
  uint32_t index = 0;
  std::array<PortDataKind, 4> acceptedKinds{};
  uint8_t acceptedKindsCount = 0;
  std::array<PortDataKind, 4> possibleResultKinds{};
  uint8_t possibleResultKindsCount = 0;
};

struct SchemaFieldContract {
  std::string_view name;
  std::string_view arrowType;
  bool nullable = false;
  int32_t inputPortIndex = 0;
};

struct ParamContract {
  std::string_view key;
  ParamKind kind = ParamKind::kString;
  bool required = false;
};

struct OperatorSpec {
  std::string_view typeName;

  ExecuteMode executeMode = ExecuteMode::kStream;
  bool parallelSafe = true;
  bool cteOptimize = false;
  uint32_t minInputPorts = 0;
  uint32_t maxInputPorts = 0;

  std::array<PortContract, 8> inputPorts{};
  uint8_t inputPortsCount = 0;

  std::array<PortContract, 8> outputPorts{};
  uint8_t outputPortsCount = 0;

  std::array<SchemaFieldContract, 32> schema{};
  uint8_t schemaCount = 0;

  std::array<ParamContract, 16> params{};
  uint8_t paramsCount = 0;

  std::string_view operatorImplVersion;
};

}  // namespace dataclean