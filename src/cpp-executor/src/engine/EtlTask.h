// src/cpp-executor/src/EtlTask.h
#pragma once
#include "OperatorSpec.h"
#include <cstdint>
#include <nlohmann/json.hpp>
#include <string>
#include <vector>

namespace dataclean {

struct PortTransform {
    std::string transformType;
    PortDataKind fromKind = PortDataKind::kChunk;
    PortDataKind toKind = PortDataKind::kChunk;
};

struct InputPort {
    uint32_t index = 0;
    std::string upstreamNodeId;
    uint32_t upstreamOutputPortIndex = 0;
    PortDataKind upstreamResultKind = PortDataKind::kChunk;
    PortDataKind recordSetKind = PortDataKind::kChunk;
    std::vector<PortTransform> transforms;
};

struct OutputPort {
    uint32_t index = 0;
    PortDataKind resultKind = PortDataKind::kChunk;
};

struct NodeTask {
    std::string nodeId;
    std::string operatorType;
    ExecuteMode executeMode = ExecuteMode::kStream;
    const OperatorSpec *spec = nullptr;
    std::vector<InputPort> inputs;
    std::vector<OutputPort> outputs;

    // 设计契约：
    // paramsRaw: 未经解析的原始 JSON 字符串，只读透传。
    // params:    在编译期统一解析并校验后的 JSON 对象。
    std::string paramsRaw;
    nlohmann::json params;
};

struct EtlTask {
    std::vector<NodeTask> nodes;
    std::vector<std::string> targetNodes;
};

struct CompileError {
    bool ok = true;
    std::string message;
    std::string nodeId;
};

} // namespace dataclean