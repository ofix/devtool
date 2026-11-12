#pragma once
#include "Enums.h"
#include <string>
#include <vector>
#include <optional>

namespace dc {

struct ExecutorError {
  std::string code;
  std::string message;
  std::optional<std::string> detail;
  bool retryable = false;
};

struct InputPort {
  std::string upstreamNodeId;
  std::string recordSetKey;
  PortKind    recordSetKind = PortKind::kChunk;
  ResultKind  upstreamResultKind = ResultKind::kDbTable;
  TransformKind incomingTransform = TransformKind::kNone;
  std::string upstreamResultVersion;
  int         inputPortIndex = 0;
};

struct EtlTaskNode {
  std::string nodeId;
  std::string nodeType;
  ExecuteMode executeMode = ExecuteMode::kStream;
  std::string paramsJson;
  std::string paramsHash;
  std::vector<InputPort> inputPorts;
  std::string recordSetKey;
  std::string resultVersion;
  std::string outputTable;
  PortKind    outputPortKind = PortKind::kChunk;
};

struct Edge {
  std::string id, source, target;
  TransformKind transformKind = TransformKind::kNone;
  int targetPortIndex = 0;
};

struct ExecutionOptions {
  std::string mode = "preview";
  std::string targetNodeId;
  int previewLimit = 5000;
  bool forceRematerialize = false;
  int maxParallel = 1;
  int timeoutMs = 0;
};

struct EtlTask {
  std::string taskId, graphId;
  int protocolVersion = 1;
  std::vector<EtlTaskNode> nodes;
  std::vector<Edge> edges;
  ExecutionOptions options;
};

} // namespace dc