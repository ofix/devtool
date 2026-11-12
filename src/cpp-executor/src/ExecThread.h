#pragma once
#include "contract/Types.h"
#include "DuckDBBridge.h"
#include "PreviewCache.h"
#include "EtlTaskRunner.h"
#include "RequestQueue.h"
#include <atomic>
#include <condition_variable>
#include <functional>
#include <mutex>
#include <optional>
#include <thread>
#include <vector>

namespace dc {

struct WindowResult {
  std::vector<PreviewRow> rows;
  int64_t total = 0;
};

class ExecThread {
 public:
  explicit ExecThread(const std::string& cachePath = ":memory:");
  ~ExecThread();

  void Submit(const EtlTask& task);
  void Cancel(const std::string& taskId);

  // 同步阻塞：入队 → 等工作线程读 → 返回。STALE 返回 nullopt。
  std::optional<WindowResult> FetchWindow(
      const std::string& key, const std::string& ver, bool forward,
      int64_t anchor, int limit);

 private:
  void Loop();

  DuckDBBridge   db_;
  PreviewCache   cache_;
  EtlTaskRunner  runner_;
  RequestQueue<EtlTask>                  runQ_;
  RequestQueue<std::function<void()>>    readQ_;
  std::thread    th_;
  std::atomic<bool> stop_{false};

  // FetchWindow 的同步原语
  std::mutex              fetchMu_;
  std::condition_variable fetchCv_;
  std::optional<WindowResult> fetchResult_;
  bool                    fetchDone_ = false;
};

} // namespace dc