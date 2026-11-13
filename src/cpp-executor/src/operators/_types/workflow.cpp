#include "OperatorSpec.h"

namespace dataclean::types::workflow {

using enum ExecuteMode;
using enum PortDataKind;
using enum ParamKind;

constinit const OperatorSpec kSpecs[] = {
    {.typeName = "FolderScan",
     .executeMode = kStream,
     .parallelSafe = true,
     .cteOptimize = false,
     .outputPorts = {PortContract{.index = 0, .possibleResultKinds = {kChunk}, .possibleResultKindsCount = 1}},
     .outputPortsCount = 1,
     .schema =
         {SchemaFieldContract{.name = "file_path", .arrowType = "LargeUtf8", .nullable = false, .inputPortIndex = -1},
          SchemaFieldContract{.name = "file_size", .arrowType = "Int64", .nullable = false, .inputPortIndex = -1},
          SchemaFieldContract{.name = "modified_at", .arrowType = "Int64", .nullable = false, .inputPortIndex = -1}},
     .schemaCount = 3,
     .params = {ParamContract{.key = "directory", .kind = kString, .required = true},
                ParamContract{.key = "pattern", .kind = kString, .required = false},
                ParamContract{.key = "recursive", .kind = kBoolean, .required = false}},
     .paramsCount = 3,
     .operatorImplVersion = "hash_folder_scan"},
    {.typeName = "HttpRequest",
     .executeMode = kBarrier,
     .parallelSafe = false,
     .cteOptimize = false,
     .outputPorts = {PortContract{.index = 0, .possibleResultKinds = {kJson}, .possibleResultKindsCount = 1}},
     .outputPortsCount = 1,
     .params = {ParamContract{.key = "url", .kind = kString, .required = true},
                ParamContract{.key = "method", .kind = kEnum, .required = false},
                ParamContract{.key = "headers", .kind = kObject, .required = false},
                ParamContract{.key = "body", .kind = kString, .required = false},
                ParamContract{.key = "timeoutMs", .kind = kNumber, .required = false}},
     .paramsCount = 5,
     .operatorImplVersion = "hash_http_request"},
    {.typeName = "Script",
     .executeMode = kBarrier,
     .parallelSafe = false,
     .cteOptimize = false,
     .inputPorts = {PortContract{.index = 0, .acceptedKinds = {kTable}, .acceptedKindsCount = 1}},
     .inputPortsCount = 1,
     .outputPorts = {PortContract{.index = 0, .possibleResultKinds = {kTable}, .possibleResultKindsCount = 1}},
     .outputPortsCount = 1,
     .params = {ParamContract{.key = "code", .kind = kString, .required = true},
                ParamContract{.key = "language", .kind = kEnum, .required = false}},
     .paramsCount = 2,
     .operatorImplVersion = "hash_script"},
    {.typeName = "Trigger",
     .executeMode = kStream,
     .parallelSafe = true,
     .cteOptimize = false,
     .outputPorts = {PortContract{.index = 0, .possibleResultKinds = {kText}, .possibleResultKindsCount = 1}},
     .outputPortsCount = 1,
     .schema = {SchemaFieldContract{
         .name = "event_path", .arrowType = "LargeUtf8", .nullable = false, .inputPortIndex = -1}},
     .schemaCount = 1,
     .params = {ParamContract{.key = "watchPath", .kind = kString, .required = true},
                ParamContract{.key = "events", .kind = kArray, .required = false}},
     .paramsCount = 2,
     .operatorImplVersion = "hash_trigger"}};

} // namespace dataclean::types::workflow