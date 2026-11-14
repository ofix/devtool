// src/engine/EtlEngine.cpp
#include "EtlEngine.h"
#include "../core/MaterializedStore.h"
#include "../core/RequestQueue.h"
#include "DuckDBSession.h"
#include "OperatorBase.h"
#include "Scheduler.h"

#include <atomic>
#include <iostream>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <unordered_map>

namespace dataclean {

namespace {

// 节点间传递的数据块
struct DataPacket {
    PortDataKind kind = PortDataKind::kChunk;
    std::shared_ptr<void> payload; // Arrow Chunk 或 std::string (表名)
};

// 边 key：upNodeId + ":" + port
inline std::string EdgeKey(const std::string &nodeId, uint32_t port) { return nodeId + ":" + std::to_string(port); }

// 每个 EngineContextImpl 生命周期内持有一个会话连接
class EngineContextImpl : public OperatorContext {
  public:
    EngineContextImpl() { conn_ = DuckDBSession::Instance().Acquire(); }
    ~EngineContextImpl() override {
        if (conn_) DuckDBSession::Instance().Release(conn_);
    }

    // 必须与 OperatorContext 基类的纯虚函数签名完全一致
    DuckDBSession::SessionConnection *GetSessionConnection() override { return conn_.get(); }

    std::string AllocateTempTableName(const std::string &prefix) override {
        return DuckDBSession::Instance().AllocateTempTableName(prefix);
    }

  private:
    std::shared_ptr<DuckDBSession::SessionConnection> conn_;
};

} // namespace

// =========================================================================
// 引擎执行上下文：队列集合（按每次 Execute 独立）
// =========================================================================
struct ExecutionContext {
    std::mutex queueMutex;
    std::unordered_map<std::string, std::shared_ptr<RequestQueue<DataPacket>>> queues;
};

bool EtlEngine::Execute(const EtlTask &task, std::string &outError) {
    auto ctx = std::make_shared<ExecutionContext>();

    // 0. 每次执行前，先清空上一轮所有物化数据
    {
        auto conn = DuckDBSession::Instance().Acquire();
        MaterializedStore::Instance().EvictAll(conn.get());
        DuckDBSession::Instance().Release(conn);
    }

    // 1. 预创建所有边的队列（容量 100，超出则阻塞上游，实现背压）
    {
        std::lock_guard<std::mutex> lock(ctx->queueMutex);
        for (const auto &node : task.nodes) {
            for (const auto &out : node.outputs) {
                std::string key = EdgeKey(node.nodeId, out.index);
                ctx->queues[key] = std::make_shared<RequestQueue<DataPacket>>(100);
            }
        }
    }

    // 2. 启动调度
    Scheduler scheduler;
    auto execFn = [this, ctx](const NodeTask &node) { ExecuteSingleNode(node, *ctx); };
    bool ok = scheduler.Run(task, execFn, outError);

    return ok;
}

void EtlEngine::ExecuteSingleNode(const NodeTask &node, ExecutionContext &ctx) {
    // ========================================================
    // 第一部分：从上游队列拉取输入
    // ========================================================
    std::vector<std::shared_ptr<void>> inputBatches;

    for (const auto &inPort : node.inputs) {
        if (inPort.upstreamNodeId.empty()) continue;

        std::string key = EdgeKey(inPort.upstreamNodeId, inPort.upstreamOutputPortIndex);
        std::shared_ptr<RequestQueue<DataPacket>> queue;
        {
            std::lock_guard<std::mutex> lock(ctx.queueMutex);
            auto it = ctx.queues.find(key);
            if (it == ctx.queues.end()) { throw std::runtime_error("Missing queue for edge: " + key); }
            queue = it->second;
        }

        // 阻塞拉取，直到队列被上游 Close()
        while (true) {
            auto opt = queue->Pop();
            if (!opt.has_value()) break; // 上游已 Close 且数据取完
            inputBatches.push_back(std::move(opt->payload));
        }
    }

    // ========================================================
    // 第二部分：创建上下文、实例化算子、执行
    // ========================================================
    EngineContextImpl operatorCtx;

    auto op = OperatorRegistry::Instance().Create(node.operatorType);
    if (!op) { throw std::runtime_error("Unknown operator: " + node.operatorType); }

    op->BindParams(node.params);
    op->SetInputs(inputBatches);

    std::vector<std::shared_ptr<void>> outputBatches = op->Execute(operatorCtx);
    auto conn = operatorCtx.GetSessionConnection();

    for (auto &rawBatch : outputBatches) {
        // 假设 rawBatch 是 std::shared_ptr<ArrowArrayHolder>（由算子产出）
        auto holder = std::static_pointer_cast<ArrowArrayHolder>(rawBatch);
        MaterializedStore::Instance().Write(node.nodeId, holder->array, holder->schema, conn);
    }
    // 之后推给下游队列的依旧是 outputBatches，不额外拷贝

    // ========================================================
    // 第三部分：结果推给下游队列
    // ========================================================
    for (const auto &outPort : node.outputs) {
        std::string key = EdgeKey(node.nodeId, outPort.index);

        std::shared_ptr<RequestQueue<DataPacket>> queue;
        {
            std::lock_guard<std::mutex> lock(ctx.queueMutex);
            auto it = ctx.queues.find(key);
            if (it == ctx.queues.end()) continue;
            queue = it->second;
        }

        for (auto &batch : outputBatches) {
            DataPacket pkt;
            pkt.kind = outPort.resultKind;
            pkt.payload = std::move(batch);
            // Push 只接受右值引用，必须 std::move
            if (!queue->Push(std::move(pkt))) break;
        }

        // 数据推完，关闭队列，通知下游没有更多数据了
        queue->Close();
    }
}

} // namespace dataclean