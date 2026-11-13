// src/cpp-executor/src/EtlTask.h
#pragma once
#include <string>
#include <vector>
#include <cstdint>
#include "OperatorSpec.h"

namespace dataclean {

// ---------- 编译期推导出的"插入转换算子" ----------
struct PortTransform {
    std::string transformType;   // 例如 "ChunkToTable"
    PortDataKind fromKind = PortDataKind::kChunk;
    PortDataKind toKind   = PortDataKind::kChunk;
};

// ---------- 运行态输入端口 ----------
struct InputPort {
    uint32_t index = 0;
    std::string upstreamNodeId;
    uint32_t upstreamOutputPortIndex = 0;
    PortDataKind upstreamResultKind = PortDataKind::kChunk; // 上游实际产出
    PortDataKind recordSetKind     = PortDataKind::kChunk;  // 本端口消费时统一后的形态
    std::vector<PortTransform> transforms;                  // 需要插入的转换链（可为空）
};

// ---------- 运行态输出端口 ----------
struct OutputPort {
    uint32_t index = 0;
    PortDataKind resultKind = PortDataKind::kChunk;
};

// ---------- 单个节点任务 ----------
struct NodeTask {
    std::string nodeId;
    std::string operatorType;
    ExecuteMode executeMode = ExecuteMode::kStream;
    const OperatorSpec* spec = nullptr;   // 指向静态契约，不拥有
    std::vector<InputPort> inputs;
    std::vector<OutputPort> outputs;
    std::string paramsJson;               // 原始参数 JSON，算子自行解析
};

// ---------- 编译产物 ----------
struct EtlTask {
    std::vector<NodeTask> nodes;          // 已拓扑排序
    std::vector<std::string> targetNodes; // 裁剪后的输出节点
};

// ---------- 编译错误 ----------
struct CompileError {
    bool ok = true;
    std::string message;
    std::string nodeId;   // 出错节点（可空）
};

}  // namespace dataclean