#pragma once
#include <sqlite3.h>
#include <string>
#include <vector>
#include <cstdint>

namespace dc {

struct PreviewRow {
  int64_t seq;
  std::string payload;
};

class PreviewCache {
 public:
  explicit PreviewCache(const std::string& path);
  ~PreviewCache();

  void Write(const std::string& key, const std::string& ver,
             int64_t seq, const std::string& payload);
  // true: 版本匹配并填充 out；false: 版本不匹配（STALE_RESULT）
  bool Fetch(const std::string& key, const std::string& ver,
             bool forward, int64_t anchor, int limit,
             std::vector<PreviewRow>* out);
  int64_t Total(const std::string& key);
  void Release(const std::string& key);

 private:
  sqlite3* db_ = nullptr;
};

} // namespace dc