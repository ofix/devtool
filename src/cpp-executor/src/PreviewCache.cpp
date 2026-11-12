#include "PreviewCache.h"
#include <stdexcept>

namespace dc {

static void Exec(sqlite3* db, const char* sql) {
  char* err = nullptr;
  if (sqlite3_exec(db, sql, nullptr, nullptr, &err) != SQLITE_OK) {
    std::string m = err ? err : "sqlite exec failed";
    sqlite3_free(err);
    throw std::runtime_error(m);
  }
}

PreviewCache::PreviewCache(const std::string& path) {
  if (sqlite3_open(path.c_str(), &db_) != SQLITE_OK)
    throw std::runtime_error("open sqlite failed");
  Exec(db_, "PRAGMA journal_mode=WAL;");
  Exec(db_, "PRAGMA synchronous=NORMAL;");
  Exec(db_, "PRAGMA busy_timeout=5000;");
  Exec(db_, "CREATE TABLE IF NOT EXISTS preview("
            " record_set_key TEXT NOT NULL,"
            " result_version TEXT NOT NULL,"
            " seq INTEGER NOT NULL,"
            " payload TEXT NOT NULL,"
            " PRIMARY KEY(record_set_key, seq));");
  Exec(db_, "CREATE INDEX IF NOT EXISTS idx_ver ON preview(record_set_key, result_version);");
}

PreviewCache::~PreviewCache() {
  if (db_) sqlite3_close(db_);
}

void PreviewCache::Write(const std::string& key, const std::string& ver,
                         int64_t seq, const std::string& payload) {
  sqlite3_stmt* st = nullptr;
  sqlite3_prepare_v2(db_,
    "INSERT OR REPLACE INTO preview(record_set_key,result_version,seq,payload)"
    " VALUES(?,?,?,?);", -1, &st, nullptr);
  if (!st) throw std::runtime_error("prepare write failed");
  sqlite3_bind_text(st,1,key.c_str(),-1,SQLITE_TRANSIENT);
  sqlite3_bind_text(st,2,ver.c_str(),-1,SQLITE_TRANSIENT);
  sqlite3_bind_int64(st,3,seq);
  sqlite3_bind_text(st,4,payload.c_str(),-1,SQLITE_TRANSIENT);
  int rc = sqlite3_step(st);
  sqlite3_finalize(st);
  if (rc != SQLITE_DONE) throw std::runtime_error("write step failed");
}

bool PreviewCache::Fetch(const std::string& key, const std::string& ver,
                         bool forward, int64_t anchor, int limit,
                         std::vector<PreviewRow>* out) {
  // 版本检查
  {
    sqlite3_stmt* st = nullptr;
    sqlite3_prepare_v2(db_,
      "SELECT result_version FROM preview WHERE record_set_key=? LIMIT 1;",
      -1, &st, nullptr);
    sqlite3_bind_text(st,1,key.c_str(),-1,SQLITE_TRANSIENT);
    bool ok = (sqlite3_step(st) == SQLITE_ROW) &&
              (ver == std::string((const char*)sqlite3_column_text(st,0)));
    sqlite3_finalize(st);
    if (!ok) return false;
  }
  const char* sql = forward
    ? "SELECT seq,payload FROM preview WHERE record_set_key=? AND seq>? ORDER BY seq ASC LIMIT ?;"
    : "SELECT seq,payload FROM preview WHERE record_set_key=? AND seq<? ORDER BY seq DESC LIMIT ?;";
  sqlite3_stmt* st = nullptr;
  sqlite3_prepare_v2(db_, sql, -1, &st, nullptr);
  sqlite3_bind_text(st,1,key.c_str(),-1,SQLITE_TRANSIENT);
  sqlite3_bind_int64(st,2,anchor);
  sqlite3_bind_int(st,3,limit);
  while (sqlite3_step(st) == SQLITE_ROW) {
    PreviewRow r;
    r.seq = sqlite3_column_int64(st,0);
    r.payload = std::string((const char*)sqlite3_column_text(st,1));
    out->push_back(std::move(r));
  }
  sqlite3_finalize(st);
  return true;
}

int64_t PreviewCache::Total(const std::string& key) {
  sqlite3_stmt* st = nullptr;
  sqlite3_prepare_v2(db_, "SELECT COUNT(*) FROM preview WHERE record_set_key=?;",
                     -1, &st, nullptr);
  sqlite3_bind_text(st,1,key.c_str(),-1,SQLITE_TRANSIENT);
  int64_t n = 0;
  if (sqlite3_step(st) == SQLITE_ROW) n = sqlite3_column_int64(st,0);
  sqlite3_finalize(st);
  return n;
}

void PreviewCache::Release(const std::string& key) {
  sqlite3_stmt* st = nullptr;
  sqlite3_prepare_v2(db_, "DELETE FROM preview WHERE record_set_key=?;", -1, &st, nullptr);
  sqlite3_bind_text(st,1,key.c_str(),-1,SQLITE_TRANSIENT);
  sqlite3_step(st);
  sqlite3_finalize(st);
}

} // namespace dc