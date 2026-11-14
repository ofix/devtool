#include "OperatorSpec.h"

namespace dataclean::types::readers {

using enum ExecuteMode;
using enum PortDataKind;
using enum ParamKind;

constinit const OperatorSpec kSpecsReaders[] = {
    {.typeName = "CsvReader",
     .executeMode = kStream,
     .parallelSafe = true,
     .cteOptimize = false,
     .minInputPorts = 1,
     .maxInputPorts = 1,
     .inputPorts = {},
     .inputPortsCount = 0,
     .outputPorts = {PortContract{.index = 0,
                                  .acceptedKinds = {},
                                  .acceptedKindsCount = 0,
                                  .possibleResultKinds = {kChunk},
                                  .possibleResultKindsCount = 1}},
     .outputPortsCount = 1,
     // schema 和 schemaCount 跳过
     .params = {ParamContract{.key = "path", .kind = kString, .required = true},
                ParamContract{.key = "delimiter", .kind = kString, .required = false},
                ParamContract{.key = "hasHeader", .kind = kBoolean, .required = false},
                ParamContract{.key = "encoding", .kind = kEnum, .required = false}},
     .paramsCount = 4,
     .operatorImplVersion = "hash_csv_reader"},
    {.typeName = "ExcelReader",
     .executeMode = kBarrier,
     .parallelSafe = false,
     .cteOptimize = false,
     // 同上
     .outputPorts = {PortContract{.index = 0,
                                  .acceptedKinds = {},
                                  .acceptedKindsCount = 0,
                                  .possibleResultKinds = {kTable},
                                  .possibleResultKindsCount = 1}},
     .outputPortsCount = 1,
     .params = {ParamContract{.key = "path", .kind = kString, .required = true},
                ParamContract{.key = "sheetName", .kind = kString, .required = false},
                ParamContract{.key = "hasHeader", .kind = kBoolean, .required = false}},
     .paramsCount = 3,
     .operatorImplVersion = "hash_excel_reader"}};

} // namespace dataclean::types::readers