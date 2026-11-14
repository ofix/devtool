// src/cpp-executor/src/Scheduler.h
#pragma once
#include "EtlTask.h"
#include <functional>
#include <string>

namespace dataclean {

class Scheduler {
  public:
    // 执行单个节点的回调（由 EtlEngine 注入，里面包含真正的 DuckDB 逻辑）
    using NodeExecFn = std::function<void(const NodeTask &)>;

    // 返回 true 表示全部成功，false 表示失败（outError 会被填充）
    bool Run(const EtlTask &task, NodeExecFn executeNode, std::string &outError);

  private:
    // 内部状态定义
    enum class NodeState { kPending, kRunning, kCompleted, kFailed };
    struct SchedNode {
        NodeState state = NodeState::kPending;
        uint32_t pendingDeps = 0;
        std::vector<uint32_t> downstream;
    };
};

} // namespace dataclean