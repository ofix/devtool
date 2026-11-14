// src/cpp-executor/src/EtlEngine.h
#pragma once
#include "EtlTask.h"
#include <string>

namespace dataclean {

class EtlEngine {
  public:
    EtlEngine();
    ~EtlEngine();

    // 执行编译好的 DAG
    bool Execute(const EtlTask &task, std::string &outError);

  private:
    // 实际的单节点执行逻辑（内部会调用 DuckDB）
    void ExecuteSingleNode(const NodeTask &node);

    // 这里可以放 DuckDB 的连接池、内存管理器等
    // DuckDBBridge dbBridge_;
};

} // namespace dataclean