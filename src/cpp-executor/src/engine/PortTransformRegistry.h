// src/cpp-executor/src/PortTransformRegistry.h
#pragma once
#include "OperatorSpec.h"
#include <mutex>
#include <string>
#include <vector>

namespace dataclean {

struct TransformRule {
    PortDataKind from;
    PortDataKind to;
    std::string transformType;
};

class PortTransformRegistry {
  public:
    static PortTransformRegistry &Instance();
    void Register(PortDataKind from, PortDataKind to, const std::string &transformType);
    const std::vector<TransformRule> &Rules() const;
    void PrintAll() const;

  private:
    PortTransformRegistry() = default;
    std::vector<TransformRule> rules_;
    mutable std::mutex mtx_;
};

// 辅助宏：用来静态注册转换规则
#define REGISTER_PORT_TRANSFORM(from, to, type)                                                                        \
    static bool _reg_##__LINE__ = (PortTransformRegistry::Instance().Register(from, to, type), true)

} // namespace dataclean