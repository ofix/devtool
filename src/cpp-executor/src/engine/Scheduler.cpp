// src/cpp-executor/src/Scheduler.cpp
#include "Scheduler.h"
#include <algorithm>
#include <condition_variable>
#include <mutex>
#include <queue>
#include <thread>
#include <unordered_map>

namespace dataclean {

namespace {
// 极简的全局线程池（也可以用 std::async，这里手写方便控制并发数）
class ThreadPool {
  public:
    explicit ThreadPool(size_t threads) : stop_(false) {
        for (size_t i = 0; i < threads; ++i) {
            workers_.emplace_back([this] {
                while (true) {
                    std::function<void()> task;
                    {
                        std::unique_lock<std::mutex> lock(queueMutex_);
                        cv_.wait(lock, [this] { return stop_ || !tasks_.empty(); });
                        if (stop_ && tasks_.empty()) return;
                        task = std::move(tasks_.front());
                        tasks_.pop();
                    }
                    task();
                }
            });
        }
    }
    void Enqueue(std::function<void()> task) {
        {
            std::unique_lock<std::mutex> lock(queueMutex_);
            tasks_.push(std::move(task));
        }
        cv_.notify_one();
    }
    ~ThreadPool() {
        {
            std::unique_lock<std::mutex> lock(queueMutex_);
            stop_ = true;
        }
        cv_.notify_all();
        for (auto &w : workers_)
            if (w.joinable()) w.join();
    }

  private:
    std::vector<std::thread> workers_;
    std::queue<std::function<void()>> tasks_;
    std::mutex queueMutex_;
    std::condition_variable cv_;
    bool stop_;
};
} // namespace

bool Scheduler::Run(const EtlTask &task, NodeExecFn executeNode, std::string &outError) {
    if (task.nodes.empty()) return true;

    size_t numNodes = task.nodes.size();
    std::vector<SchedNode> nodes(numNodes);
    std::unordered_map<std::string, uint32_t> idToIdx;
    idToIdx.reserve(numNodes);
    for (size_t i = 0; i < numNodes; ++i) idToIdx[task.nodes[i].nodeId] = i;

    // 1. 建立依赖关系
    for (size_t i = 0; i < numNodes; ++i) {
        for (const auto &in : task.nodes[i].inputs) {
            if (!in.upstreamNodeId.empty()) {
                uint32_t upIdx = idToIdx.at(in.upstreamNodeId);
                nodes[i].pendingDeps++;
                nodes[upIdx].downstream.push_back(i);
            }
        }
    }

    std::mutex mtx;
    std::condition_variable cv;
    bool hasError = false;
    std::string errorMsg;
    uint32_t activeTasks = 0;

    // 2. 控制并发度。
    // 注意：DuckDB 内部也会开线程，所以这里不能开太多，防止线程和内存爆炸。
    // 取 CPU 核数的一半，或者固定 4 个（根据你机器的内存决定）。
    size_t maxThreads = std::max(2u, std::thread::hardware_concurrency() / 2);
    ThreadPool pool(maxThreads);

    // 3. 任务派发闭包
    std::function<void(uint32_t)> dispatch = [&](uint32_t idx) {
        {
            std::lock_guard<std::mutex> lock(mtx);
            nodes[idx].state = NodeState::kRunning;
            activeTasks++;
        }

        pool.Enqueue([&, idx]() {
            bool success = true;
            try {
                executeNode(task.nodes[idx]);
            } catch (const std::exception &e) {
                success = false;
                std::lock_guard<std::mutex> lock(mtx);
                hasError = true;
                errorMsg = e.what();
                cv.notify_all();
            }
            if (!success) return;

            {
                std::lock_guard<std::mutex> lock(mtx);
                nodes[idx].state = NodeState::kCompleted;
                activeTasks--;

                // 推进下游节点
                for (uint32_t downIdx : nodes[idx].downstream) {
                    nodes[downIdx].pendingDeps--;
                    if (nodes[downIdx].pendingDeps == 0 && !hasError) { dispatch(downIdx); }
                }
                cv.notify_all();
            }
        });
    };

    // 4. 启动所有入度为 0 的节点
    {
        std::lock_guard<std::mutex> lock(mtx);
        for (size_t i = 0; i < numNodes; ++i) {
            if (nodes[i].pendingDeps == 0) { dispatch(i); }
        }
    }

    // 5. 主线程阻塞等待结束
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, [&]() { return hasError || activeTasks == 0; });

    if (hasError) {
        outError = errorMsg;
        return false;
    }
    return true;
}

} // namespace dataclean