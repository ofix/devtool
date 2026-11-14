// src/core/MaterializedStore.cpp
#include "MaterializedStore.h"
#include <algorithm>
#include <iostream>
#include <nlohmann/json.hpp>

namespace dataclean {

using json = nlohmann::json;
using State = MaterializedStore::State; // 加这一行

MaterializedStore &MaterializedStore::Instance() {
    static MaterializedStore inst;
    return inst;
}

State MaterializedStore::Write(const std::string &nodeId,
                               ArrowArray *array,
                               ArrowSchema *schema,
                               DuckDBSession::SessionConnection *conn) {
    // 先判断是否已落盘
    std::string spillTable;
    {
        std::lock_guard<std::mutex> lock(mtx_);
        auto it = nodes_.find(nodeId);
        if (it != nodes_.end() && it->second.state == State::kSpilled) {
            spillTable = it->second.tableName;
            it->second.totalRows += array->length;
        }
    }
    if (!spillTable.empty()) {
        // 落盘态：直接追加到 DuckDB
        // 注意：这里需要传 stream，暂时使用 placeholder，实际调用方需保证传的是 stream
        DuckDBSession::Instance().AppendArrowToTable(conn, spillTable, array);
        return State::kSpilled;
    }

    std::lock_guard<std::mutex> lock(mtx_);
    auto &state = nodes_[nodeId];
    if (state.state == State::kUnknown) state.state = State::kBuffering;

    int64_t batchRows = array->length;
    if (state.memoryRows + batchRows > kMaxMemoryRows) {
        // 熔断：刷入 DuckDB
        state.state = State::kSpilled;
        state.tableName = "node_result_" + nodeId;

        for (auto &holder : state.memoryArrays) {
            DuckDBSession::Instance().AppendArrowToTable(conn, state.tableName, holder->array);
            state.totalRows += holder->array->length;
        }
        state.memoryArrays.clear();
        state.memoryRows = 0;

        DuckDBSession::Instance().AppendArrowToTable(conn, state.tableName, array);
        state.totalRows += batchRows;
        return State::kSpilled;
    }

    // 内存态：转移所有权到 holder
    auto holder = std::make_shared<ArrowArrayHolder>();
    holder->array = array;
    holder->schema = schema;
    state.memoryArrays.push_back(holder);
    state.memoryRows += batchRows;
    state.totalRows += batchRows;
    return State::kBuffering;
}

// ---------------- 内存态 JSON 分页 ----------------
static json
ExtractRowsFromArray(const ArrowArray *array, const ArrowSchema *schema, int64_t startRow, int64_t numRows) {
    json rows = json::array();
    if (!array || !schema || startRow >= array->length) return rows;

    int64_t actualRows = std::min(numRows, array->length - startRow);
    // 假设单列（简化），实际需按 schema->n_children 遍历
    // 这里以 int64 和 string 为例
    if (std::string(schema->format) == "l") {
        const int64_t *data = static_cast<const int64_t *>(array->buffers[1]);
        for (int64_t i = 0; i < actualRows; ++i) {
            json row = json::array();
            row.push_back(data[startRow + i]);
            rows.push_back(row);
        }
    } else if (std::string(schema->format) == "u") {
        const int32_t *offsets = static_cast<const int32_t *>(array->buffers[1]);
        const char *stringData = static_cast<const char *>(array->buffers[2]);
        for (int64_t i = 0; i < actualRows; ++i) {
            int32_t start = offsets[startRow + i];
            int32_t end = offsets[startRow + i + 1];
            rows.push_back(std::string(stringData + start, end - start));
        }
    }
    return rows;
}

std::string MaterializedStore::ReadMemoryPageJson(const std::string &nodeId, int64_t offset, int64_t limit) {
    std::lock_guard<std::mutex> lock(mtx_);
    auto it = nodes_.find(nodeId);
    if (it == nodes_.end() || it->second.state != State::kBuffering) return "[]";

    json finalRows = json::array();
    int64_t skip = offset;
    int64_t take = limit;

    for (auto &holder : it->second.memoryArrays) {
        int64_t len = holder->array->length;
        if (skip >= len) {
            skip -= len;
            continue;
        }
        int64_t cnt = std::min(take, len - skip);
        if (cnt > 0) {
            auto partial = ExtractRowsFromArray(holder->array, holder->schema, skip, cnt);
            for (auto &r : partial) finalRows.push_back(r);
            take -= cnt;
            if (take <= 0) break;
        }
        skip = 0;
    }
    return finalRows.dump();
}

// ---------------- 落盘态 DuckDB 分页 ----------------
std::unique_ptr<duckdb_result> MaterializedStore::ReadSpilledPage(const std::string &nodeId,
                                                                  int64_t offset,
                                                                  int64_t limit,
                                                                  DuckDBSession::SessionConnection *conn) {
    std::string tableName;
    {
        std::lock_guard<std::mutex> lock(mtx_);
        auto it = nodes_.find(nodeId);
        if (it == nodes_.end() || it->second.state != State::kSpilled) return nullptr;
        tableName = it->second.tableName;
    }
    auto res = std::make_unique<duckdb_result>();
    std::string sql =
        "SELECT * FROM " + tableName + " LIMIT " + std::to_string(limit) + " OFFSET " + std::to_string(offset);
    if (duckdb_query(conn->c_conn, sql.c_str(), res.get()) != DuckDBSuccess) return nullptr;
    return res;
}

State MaterializedStore::GetState(const std::string &nodeId) {
    std::lock_guard<std::mutex> lock(mtx_);
    auto it = nodes_.find(nodeId);
    return it == nodes_.end() ? State::kUnknown : it->second.state;
}

int64_t MaterializedStore::GetTotalRows(const std::string &nodeId) {
    std::lock_guard<std::mutex> lock(mtx_);
    auto it = nodes_.find(nodeId);
    return it == nodes_.end() ? 0 : it->second.totalRows;
}

void MaterializedStore::EvictNode(const std::string &nodeId, DuckDBSession::SessionConnection *conn) {
    std::string tableName;
    {
        std::lock_guard<std::mutex> lock(mtx_);
        auto it = nodes_.find(nodeId);
        if (it == nodes_.end()) return;
        if (it->second.state == State::kSpilled) tableName = it->second.tableName;
        nodes_.erase(it);
    }
    if (!tableName.empty() && conn) {
        duckdb_query(conn->c_conn, ("DROP TABLE IF EXISTS " + tableName).c_str(), nullptr);
    }
}

void MaterializedStore::EvictAll(DuckDBSession::SessionConnection *conn) {
    std::vector<std::string> tables;
    {
        std::lock_guard<std::mutex> lock(mtx_);
        for (auto &[id, data] : nodes_)
            if (data.state == State::kSpilled) tables.push_back(data.tableName);
        nodes_.clear();
    }
    if (conn) {
        for (auto &t : tables) duckdb_query(conn->c_conn, ("DROP TABLE IF EXISTS " + t).c_str(), nullptr);
    }
}

} // namespace dataclean