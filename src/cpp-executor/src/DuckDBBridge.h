#pragma once
#include <atomic>
#include <duckdb.hpp>
#include <string>

namespace dc {

class DuckDBBridge {
 public:
  explicit DuckDBBridge(const std::string& path = ":memory:")
      : db_(path), conn_(db_) {}

  duckdb::Connection& conn() { return conn_; }

  void Interrupt() { conn_.Interrupt(); }
  void MarkAborted() { aborted_.store(true); }
  bool IsAborted() const { return aborted_.load(); }
  void ResetAbort() { aborted_.store(false); }

 private:
  duckdb::DuckDB db_;
  duckdb::Connection conn_;
  std::atomic<bool> aborted_{false};
};

}  // namespace dc