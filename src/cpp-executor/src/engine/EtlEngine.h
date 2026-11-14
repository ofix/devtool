// src/engine/EtlEngine.h
#pragma once
#include "EtlTask.h"
#include <string>

namespace dataclean {

struct ExecutionContext; // 前向声明，仅在 cpp 内定义

class EtlEngine {
  public:
    EtlEngine();
    ~EtlEngine();

    bool Execute(const EtlTask &task, std::string &outError);

  private:
    void ExecuteSingleNode(const NodeTask &node, ExecutionContext &ctx);
};

} // namespace dataclean