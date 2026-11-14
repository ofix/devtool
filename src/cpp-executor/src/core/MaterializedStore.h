// src/core/MaterializedStore.h
#pragma once
#include "ArrowAbi.h"
#include "DuckDBSession.h"
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

namespace dataclean {

class MaterializedStore {
  public:
    static MaterializedStore &Instance();

    enum class State { kUnknown, kBuffering, kSpilled };

    State
    Write(const std::string &nodeId, ArrowArray *array, ArrowSchema *schema, DuckDBSession::SessionConnection *conn);

    // 内存态：直接输出 JSON 页面（零 DuckDB 依赖）
    std::string ReadMemoryPageJson(const std::string &nodeId, int64_t offset, int64_t limit);

    // 落盘态：DuckDB 分页
    std::unique_ptr<duckdb_result>
    ReadSpilledPage(const std::string &nodeId, int64_t offset, int64_t limit, DuckDBSession::SessionConnection *conn);

    State GetState(const std::string &nodeId);
    int64_t GetTotalRows(const std::string &nodeId);
    void EvictNode(const std::string &nodeId, DuckDBSession::SessionConnection *conn);
    void EvictAll(DuckDBSession::SessionConnection *conn);

  private:
    MaterializedStore() = default;

    struct NodeData {
        State state = State::kUnknown;
        std::vector<std::shared_ptr<ArrowArrayHolder>> memoryArrays;
        int64_t memoryRows = 0;
        std::string tableName;
        int64_t totalRows = 0;
    };

    std::mutex mtx_;
    std::unordered_map<std::string, NodeData> nodes_;
    const int64_t kMaxMemoryRows = 5000;
};

} // namespace dataclean