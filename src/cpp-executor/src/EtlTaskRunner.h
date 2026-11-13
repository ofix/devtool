#pragma once
#include <functional>
#include <string>

#include "DuckDBBridge.h"
#include "PreviewCache.h"
#include "contract/Types.h"

namespace dc {

using EventSink = std::function<void(const std::string& eventType,
                                     const std::string& payloadJson)>;

class EtlTaskRunner {
 public:
  EtlTaskRunner(DuckDBBridge& db, PreviewCache& cache, EventSink sink);

  void RunTask(const EtlTask& task);
  void Cancel();

  // 供 ExecThread 在批次边界调用；返回 true 表示已取消
  bool CheckAbort() const { return db_.IsAborted(); }

 private:
  void RunStreamNode(const EtlTaskNode& node);
  void RunBarrierNode(const EtlTaskNode& node);
  void EmitError(const std::string& nodeId, const ExecutorError& e);
  void EmitNodeDone(const EtlTaskNode& node, int64_t rowCount,
                    const std::string& schemaVersion);

  DuckDBBridge& db_;
  PreviewCache& cache_;
  EventSink sink_;
};

}  // namespace dc