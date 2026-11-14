#pragma once
#include <nlohmann/json.hpp>

#include "contract/Enums.h"
#include "contract/Types.h"

namespace dc {
using json = nlohmann::json;

inline ExecutorError MakeError(const std::string& code, const std::string& msg,
                               bool retryable = false,
                               const std::string& detail = "") {
  ExecutorError e;
  e.code = code;
  e.message = msg;
  e.retryable = retryable;
  if (!detail.empty()) e.detail = detail;
  return e;
}

// ── Types ← JSON
inline InputPort ParseInputPort(const json& j) {
  InputPort p;
  p.upstreamNodeId = j.value("upstreamNodeId", "");
  p.recordSetKey = j.value("recordSetKey", "");
  p.recordSetKind = ParsePortKind(j.value("recordSetKind", "chunk"));
  p.upstreamResultKind =
      ParseResultKind(j.value("upstreamResultKind", "db_table"));
  p.incomingTransform =
      ParseTransformKind(j.value("incomingTransform", "null"));
  p.upstreamResultVersion = j.value("upstreamResultVersion", "");
  p.inputPortIndex = j.value("inputPortIndex", 0);
  return p;
}

inline EtlTaskNode ParseNode(const json& j) {
  EtlTaskNode n;
  n.nodeId = j.value("nodeId", "");
  n.nodeType = j.value("nodeType", "");
  n.executeMode = ParseExecuteMode(j.value("executeMode", "stream"));
  n.paramsJson = j.value("paramsJson", "{}");
  n.paramsHash = j.value("paramsHash", "");
  n.recordSetKey = j.value("recordSetKey", "");
  n.resultVersion = j.value("resultVersion", "");
  n.outputTable = j.value("outputTable", "");
  n.outputPortKind = ParsePortKind(j.value("outputPortKind", "chunk"));
  if (j.contains("inputPorts")) {
    for (auto& ip : j["inputPorts"]) n.inputPorts.push_back(ParseInputPort(ip));
  }
  return n;
}

inline Edge ParseEdge(const json& j) {
  Edge e;
  e.id = j.value("id", "");
  e.source = j.value("source", "");
  e.target = j.value("target", "");
  e.transformKind = ParseTransformKind(j.value("transformKind", "null"));
  e.targetPortIndex = j.value("targetPortIndex", 0);
  return e;
}

inline EtlTask ParseTask(const json& j) {
  EtlTask t;
  t.taskId = j.value("taskId", "");
  t.graphId = j.value("graphId", "");
  t.protocolVersion = j.value("protocolVersion", 0);
  if (j.contains("nodes"))
    for (auto& n : j["nodes"]) t.nodes.push_back(ParseNode(n));
  if (j.contains("edges"))
    for (auto& e : j["edges"]) t.edges.push_back(ParseEdge(e));
  if (j.contains("options")) {
    const auto& o = j["options"];
    t.options.mode = o.value("mode", "preview");
    t.options.targetNodeId = o.value("targetNodeId", "");
    t.options.previewLimit = o.value("previewLimit", 5000);
    t.options.forceRematerialize = o.value("forceRematerialize", false);
    t.options.maxParallel = o.value("maxParallel", 1);
    t.options.timeoutMs = o.value("timeoutMs", 0);
  }
  return t;
}

}  // namespace dc