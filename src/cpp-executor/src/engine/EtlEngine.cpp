// src/cpp-executor/src/EtlEngine.cpp
#include "EtlEngine.h"
#include "Scheduler.h"
#include <iostream>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <unordered_map>

// 假设你有这些头文件
#include "../core/RequestQueue.h" // 无锁队列，用于节点间传递数据
#include "DuckDBBridge.h"         // 提供 duckdb::Connection 获取
#include "OperatorBase.h"         // 算子基类和具体算子

namespace dataclean {

namespace {
// 节点间传递的数据块。上游写完，下游读走。
// 注意：这里用 shared_ptr 是必要的，因为可能有多个下游节点（一对多）。
struct DataPacket {
    PortDataKind kind;
    std::shared_ptr<void> payload; // 实际是 Arrow Table / Chunk / JSON
    bool isEos = false;            // End of Stream 标记
};

// 每一条边（上游节点 ID + 输出端口）对应一个队列
// 用 string 拼接 key 来简化代码：upNodeId + ":" + port
std::string EdgeKey(const std::string &nodeId, uint32_t port) { return nodeId + ":" + std::to_string(port); }
} // namespace

// ==========================================
// 内部资源池：连接池 + 节点间通信队列
// ==========================================
struct EngineContext {
    // DuckDB 连接池（每线程一个连接，避免锁竞争）
    std::mutex connMutex;
    std::vector<std::shared_ptr<duckdb::Connection>> connPool;

    // 节点间通信：key 是 "上游节点ID:输出端口"
    std::mutex queueMutex;
    std::unordered_map<std::string, std::shared_ptr<RequestQueue<DataPacket>>> queues;
};

// 全局/单例的上下文（也可以在 EtlEngine 成员里持有）
static EngineContext g_ctx;

EtlEngine::EtlEngine() {
    // 初始化 DuckDB 连接池，例如 4 个连接
    // auto db = DuckDBBridge::GetInstance().GetDB();
    // for (int i = 0; i < 4; ++i) {
    //     g_ctx.connPool.push_back(std::make_shared<duckdb::Connection>(*db));
    // }
}

EtlEngine::~EtlEngine() {}

bool EtlEngine::Execute(const EtlTask &task, std::string &outError) {
    // 1. 准备所有边的队列：根据 EtlTask 的连线关系，预先创建好队列
    for (const auto &node : task.nodes) {
        for (const auto &out : node.outputs) {
            std::string key = EdgeKey(node.nodeId, out.index);
            g_ctx.queues[key] = std::make_shared<RequestQueue<DataPacket>>();
        }
    }

    // 2. 启动调度
    Scheduler scheduler;
    auto execFn = [this](const NodeTask &node) { ExecuteSingleNode(node); };
    bool ok = scheduler.Run(task, execFn, outError);

    // 3. 清理队列
    g_ctx.queues.clear();
    return ok;
}

void EtlEngine::ExecuteSingleNode(const NodeTask &node) {
    // ========================================================
    // 第一部分：准备算子的输入数据
    // ========================================================
    // 对于每个输入端口，从对应的上游队列拿到数据。
    // 如果是 Barrier 算子（如 Sort），这里会阻塞直到所有上游发完；如果是 Stream 算子，则边读边处理。
    std::vector<std::shared_ptr<void>> inputBatches;
    for (const auto &inPort : node.inputs) {
        if (inPort.upstreamNodeId.empty()) continue; // 无上游连线的输入端口
        std::string key = EdgeKey(inPort.upstreamNodeId, inPort.upstreamOutputPortIndex);
        auto it = g_ctx.queues.find(key);
        if (it == g_ctx.queues.end()) { throw std::runtime_error("Missing queue for edge: " + key); }
        auto queue = it->second;

        // 从队列拉取数据，直到收到 EOS（这里简化了，可能需要循环）
        while (true) {
            DataPacket packet = queue->Pop();
            if (packet.isEos) break;
            inputBatches.push_back(packet.payload);
        }
    }

    // ========================================================
    // 第二部分：获取 DuckDB 连接，实例化算子，执行
    // ========================================================
    // 从池里借一个连接（这里用简单的轮询或者 thread_local）
    std::shared_ptr<duckdb::Connection> conn;
    {
        std::lock_guard<std::mutex> lock(g_ctx.connMutex);
        if (!g_ctx.connPool.empty()) {
            conn = g_ctx.connPool.back();
            g_ctx.connPool.pop_back();
        } else {
            // 如果池空了，临时新建（生产环境可能应该阻塞等待）
            // conn = std::make_shared<duckdb::Connection>(*DuckDBBridge::GetInstance().GetDB());
        }
    }

    // 根据 node.operatorType 实例化对应的算子
    // 这里假设你的 Operators.cpp 里有一个工厂函数
    std::unique_ptr<Operator> op = CreateOperator(node.operatorType, conn);
    if (!op) { throw std::runtime_error("Unknown operator: " + node.operatorType); }

    // 绑定参数（params 是编译期已经解析好的 json）
    op->BindParams(node.params);

    // 设定输入
    op->SetInputs(inputBatches);

    // 执行算子，产出结果
    std::vector<std::shared_ptr<void>> outputBatches = op->Execute();

    // 归还连接
    {
        std::lock_guard<std::mutex> lock(g_ctx.connMutex);
        if (conn) g_ctx.connPool.push_back(conn);
    }

    // ========================================================
    // 第三部分：把输出推到下游队列
    // ========================================================
    for (const auto &outPort : node.outputs) {
        std::string key = EdgeKey(node.nodeId, outPort.index);
        auto it = g_ctx.queues.find(key);
        if (it == g_ctx.queues.end()) continue;
        auto queue = it->second;

        // 把所有输出批次推入队列
        for (auto &batch : outputBatches) {
            DataPacket pkt;
            pkt.kind = outPort.resultKind;
            pkt.payload = batch;
            queue->Push(pkt);
        }

        // 发送 EOS 标记，告诉下游：我这边发完了
        DataPacket eos;
        eos.isEos = true;
        queue->Push(eos);
    }
}

} // namespace dataclean