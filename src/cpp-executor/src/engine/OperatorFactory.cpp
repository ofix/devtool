// src/engine/OperatorFactory.cpp
#include "OperatorBase.h"
#include <mutex>

namespace dataclean {

OperatorRegistry &OperatorRegistry::Instance() {
    static OperatorRegistry inst;
    return inst;
}

void OperatorRegistry::Register(const std::string &typeName, OperatorFactoryFn fn) {
    static std::mutex mtx;
    std::lock_guard<std::mutex> lock(mtx);
    factories_[typeName] = fn;
}

std::unique_ptr<OperatorBase> OperatorRegistry::Create(const std::string &typeName) {
    auto it = factories_.find(typeName);
    if (it == factories_.end()) return nullptr;
    return it->second();
}

} // namespace dataclean