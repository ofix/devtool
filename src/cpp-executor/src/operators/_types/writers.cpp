#include "OperatorSpec.h"

namespace dataclean::types::writers {

using enum ExecuteMode;
using enum PortDataKind;
using enum ParamKind;

constinit const OperatorSpec kSpecs[] = {
    {.typeName = "CsvWriter",
     .executeMode = kBarrier,
     .parallelSafe = false,
     .cteOptimize = false,
     .inputPorts = {PortContract{.index = 0, .acceptedKinds = {kTable}, .acceptedKindsCount = 1}},
     .inputPortsCount = 1,
     .outputPorts = {PortContract{.index = 0, .possibleResultKinds = {kText}, .possibleResultKindsCount = 1}},
     .outputPortsCount = 1,
     .params = {ParamContract{.key = "path", .kind = kString, .required = true},
                ParamContract{.key = "delimiter", .kind = kString, .required = false},
                ParamContract{.key = "overwrite", .kind = kBoolean, .required = false}},
     .paramsCount = 3,
     .operatorImplVersion = "b302bb65b7930c00"},
    {.typeName = "ParquetWriter",
     .executeMode = kBarrier,
     .parallelSafe = false,
     .cteOptimize = false,
     .inputPorts = {PortContract{.index = 0, .acceptedKinds = {kTable}, .acceptedKindsCount = 1}},
     .inputPortsCount = 1,
     .outputPorts = {PortContract{.index = 0, .possibleResultKinds = {kText}, .possibleResultKindsCount = 1}},
     .outputPortsCount = 1,
     .params = {ParamContract{.key = "path", .kind = kString, .required = true},
                ParamContract{.key = "compression", .kind = kEnum, .required = false},
                ParamContract{.key = "overwrite", .kind = kBoolean, .required = false}},
     .paramsCount = 3,
     .operatorImplVersion = "hash_parquet_writer"}};

} // namespace dataclean::types::writers