// src/cpp-executor/src/GraphCompiler.h
#pragma once
#include "EtlTask.h"
#include "StepTrace.h"
#include <string_view>

namespace dataclean {

class GraphCompiler {
  public:
    CompileError
    Compile(std::string_view graphJson, std::string_view targetNodeId, EtlTask &outTask, StepTraces *traces = nullptr);
};

} // namespace dataclean