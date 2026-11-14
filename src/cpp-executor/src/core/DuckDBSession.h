// src/core/DuckDBSession.h
#pragma once
#include "ArrowAbi.h"
#include "duckdb.hpp"
#include <atomic>
#include <condition_variable>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

namespace dataclean {

class DuckDBSession {
  public:
    static DuckDBSession &Instance();

    bool Initialize(const std::string &dbPath = ":memory:", int maxConnections = 4);

    struct SessionConnection {
        duckdb_connection c_conn = nullptr;
    };

    std::shared_ptr<SessionConnection> Acquire();
    void Release(std::shared_ptr<SessionConnection> conn);

    std::string AllocateTempTableName(const std::string &prefix);

    // 核心：接收 ArrowArray，零拷贝写入 DuckDB 表
    bool AppendArrowToTable(SessionConnection *conn, const std::string &tableName, ArrowArray *array);

    void CleanupTables(SessionConnection *conn, const std::string &prefix);

  private:
    DuckDBSession() = default;
    ~DuckDBSession();

    duckdb_database db_ = nullptr;
    std::vector<std::shared_ptr<SessionConnection>> pool_;
    std::mutex poolMutex_;
    std::condition_variable poolCv_;
    size_t maxConnections_ = 4;
    bool initialized_ = false;
    std::atomic<uint64_t> tableCounter_{0};
};

} // namespace dataclean