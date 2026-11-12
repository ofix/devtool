#include "ExecThread.h"
#include <chrono>
#include <stdexcept>

namespace dc {

ExecThread::ExecThread(const std::string& cachePath)
    : cache_(cachePath),
      runner_(db_, cache_, [](const std::string&, const std::string&) {
        // TODO(M1.1): 接入 MessagePort，用 TSFN NonBlockingCall 上报
      }) {
  th_ = std::thread([this]{ Loop(); });
}

ExecThread::~ExecThread() {
  stop_.store(true);
  if (th_.joinable()) th_.join();
}

void ExecThread::Submit(const EtlTask& t) { runQ_.Push(t); }
void ExecThread::Cancel(const std::string&) { runner_.Cancel(); }

void ExecThread::Loop() {
  while (!stop_.load()) {
    if (auto rt = readQ_.TryPop()) { (*rt)(); continue; }
    if (auto t  = runQ_.TryPop())  { runner_.RunTask(*t); continue; }
    std::this_thread::sleep_for(std::chrono::milliseconds(5));
  }
}

std::optional<WindowResult> ExecThread::FetchWindow(
    const std::string& key, const std::string& ver, bool forward,
    int64_t anchor, int limit) {
  {
    std::lock_guard<std::mutex> lk(fetchMu_);
    fetchDone_ = false;
    fetchResult_.reset();
  }
  // 拷贝一份参数给队列 lambda（避免悬垂引用）
  std::string k = key, v = ver;
  readQ_.Push([this, k, v, forward, anchor, limit] {
    WindowResult r;
    r.total = cache_.Total(k);
    std::vector<PreviewRow> rows;
    bool ok = cache_.Fetch(k, v, forward, anchor, limit, &rows);
    r.rows = std::move(rows);
    std::lock_guard<std::mutex> g(fetchMu_);
    if (ok) fetchResult_ = std::move(r);
    else    fetchResult_.reset();
    fetchDone_ = true;
    fetchCv_.notify_one();
  });
  std::unique_lock<std::mutex> lk(fetchMu_);
  fetchCv_.wait(lk, [this]{ return fetchDone_; });
  return fetchResult_;
}

} // namespace dc