#pragma once
#include "OperatorSpec.h"
#include <string_view>

namespace dataclean::types {
extern const OperatorSpec kSpecsReaders[];
extern const OperatorSpec kSpecsWorkflow[];
extern const OperatorSpec kSpecsTransform[];
extern const OperatorSpec kSpecsBarrier[];
extern const OperatorSpec kSpecsWriters[];
} // namespace dataclean::types

namespace dataclean {

inline const OperatorSpec *FindOperatorSpec(std::string_view typeName) {
    auto findInArray = [typeName](const OperatorSpec *arr) -> const OperatorSpec * {
        while (arr->typeName.size() > 0) { // 遇到哨兵就停
            if (arr->typeName == typeName) return arr;
            ++arr;
        }
        return nullptr;
    };

    if (auto *p = findInArray(types::kSpecsReaders)) return p;
    if (auto *p = findInArray(types::kSpecsWorkflow)) return p;
    if (auto *p = findInArray(types::kSpecsTransform)) return p;
    if (auto *p = findInArray(types::kSpecsBarrier)) return p;
    if (auto *p = findInArray(types::kSpecsWriters)) return p;

    return nullptr;
}

} // namespace dataclean