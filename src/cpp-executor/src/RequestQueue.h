#pragma once
#include <cstddef>
#include <mutex>
#include <optional>
#include <queue>

namespace dc {

template <class T>
class RequestQueue {
 public:
  void Push(T v) {
    std::lock_guard<std::mutex> g(m_);
    q_.push(std::move(v));
  }
  std::optional<T> TryPop() {
    std::lock_guard<std::mutex> g(m_);
    if (q_.empty()) return std::nullopt;
    T v = std::move(q_.front());
    q_.pop();
    return v;
  }
  std::size_t Size() const {
    std::lock_guard<std::mutex> g(m_);
    return q_.size();
  }

 private:
  mutable std::mutex m_;
  std::queue<T> q_;
};

}  // namespace dc