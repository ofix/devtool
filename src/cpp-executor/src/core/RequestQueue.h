// src/core/RequestQueue.h
#pragma once
#include <condition_variable>
#include <cstddef>
#include <mutex>
#include <optional>
#include <queue>

namespace dataclean {

template <typename T> class RequestQueue {
  public:
    // 默认容量，防止无限堆积导致 OOM。可根据算子特性调整。
    explicit RequestQueue(size_t maxCapacity = 100) : maxCapacity_(maxCapacity), isClosed_(false) {}

    // 禁止拷贝
    RequestQueue(const RequestQueue &) = delete;
    RequestQueue &operator=(const RequestQueue &) = delete;

    /**
     * 推入数据（阻塞版）。
     * 如果队列已满，当前线程会阻塞等待，直到有空位（实现背压）。
     * 如果队列已被关闭，返回 false。
     */
    bool Push(T &&item) {
        std::unique_lock<std::mutex> lock(mutex_);
        // 等待队列有空间或者队列被关闭
        notFullCv_.wait(lock, [this]() { return queue_.size() < maxCapacity_ || isClosed_; });

        if (isClosed_) return false; // 已经关闭，不再接收新数据

        queue_.push(std::move(item));
        notEmptyCv_.notify_one(); // 唤醒消费者
        return true;
    }

    /**
     * 拉取数据（阻塞版）。
     * 如果队列为空，当前线程会阻塞等待。
     * 如果队列被关闭且数据已取完，返回 std::nullopt。
     */
    std::optional<T> Pop() {
        std::unique_lock<std::mutex> lock(mutex_);
        // 等待队列非空或者队列被关闭
        notEmptyCv_.wait(lock, [this]() { return !queue_.empty() || isClosed_; });

        if (queue_.empty() && isClosed_) {
            return std::nullopt; // 数据取完且队列已关闭，通知调用方结束
        }

        T item = std::move(queue_.front());
        queue_.pop();
        notFullCv_.notify_one(); // 唤醒生产者
        return item;
    }

    /**
     * 拉取数据（非阻塞版）。
     * 如果队列为空，立即返回 std::nullopt。
     */
    std::optional<T> TryPop() {
        std::lock_guard<std::mutex> lock(mutex_);
        if (queue_.empty()) return std::nullopt;

        T item = std::move(queue_.front());
        queue_.pop();
        notFullCv_.notify_one();
        return item;
    }

    /**
     * 关闭队列。
     * 广播通知所有阻塞在 Push 和 Pop 的线程。
     * 通常在生产者（上游）节点执行完毕时调用。
     */
    void Close() {
        std::lock_guard<std::mutex> lock(mutex_);
        isClosed_ = true;
        notFullCv_.notify_all();
        notEmptyCv_.notify_all();
    }

    /**
     * 检查队列是否已关闭且为空。
     */
    bool IsDrained() {
        std::lock_guard<std::mutex> lock(mutex_);
        return isClosed_ && queue_.empty();
    }

    // 获取当前队列大小（用于监控/调试）
    size_t Size() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return queue_.size();
    }

  private:
    std::queue<T> queue_;
    size_t maxCapacity_;
    bool isClosed_;

    mutable std::mutex mutex_;
    std::condition_variable notEmptyCv_;
    std::condition_variable notFullCv_;
};

} // namespace dataclean