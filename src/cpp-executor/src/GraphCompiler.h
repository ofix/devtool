// src/cpp-executor/src/GraphCompiler.h
#pragma once
#include "EtlTask.h"
#include <string>
#include <string_view>

namespace dataclean {

struct CompileError {
    bool ok = true;
    std::string message;
    std::string nodeId; // 出错节点（可空）
};

class GraphCompiler {
  public:
    // graphJson: 原始 Graph JSON（nodes/edges）
    // targetNodeId: 空则全图；非空则裁剪到该节点上游子图
    CompileError Compile(std::string_view graphJson, std::string_view targetNodeId, EtlTask &outTask);
};

} // namespace dataclean