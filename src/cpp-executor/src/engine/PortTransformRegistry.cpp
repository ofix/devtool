// src/cpp-executor/src/PortTransformRegistry.cpp
#include "PortTransformRegistry.h"
#include <cstdio>

namespace dataclean {

PortTransformRegistry &PortTransformRegistry::Instance() {
    static PortTransformRegistry inst;
    return inst;
}

void PortTransformRegistry::Register(PortDataKind from, PortDataKind to, const std::string &transformType) {
    std::lock_guard<std::mutex> lock(mtx_);
    for (auto &r : rules_) {
        if (r.from == from && r.to == to && r.transformType == transformType) return;
    }
    rules_.push_back({from, to, transformType});
}

const std::vector<TransformRule> &PortTransformRegistry::Rules() const { return rules_; }

void PortTransformRegistry::PrintAll() const {
    std::lock_guard<std::mutex> lock(mtx_);
    std::printf("[PortTransformRegistry] %zu rules:\n", rules_.size());
    for (auto &r : rules_) {
        std::printf("  %d -> %d via %s\n", static_cast<int>(r.from), static_cast<int>(r.to), r.transformType.c_str());
    }
}

} // namespace dataclean