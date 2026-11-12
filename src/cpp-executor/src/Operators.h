#pragma once
#include "contract/Types.h"
#include <string>

namespace dc
{
    class DuckDBBridge;
}

namespace dc::ops
{

    struct OpResult
    {
        int64_t rowCount = 0;
        std::string schemaVersion;
    };

    // CsvReader: 读 CSV → 建临时表（M1 偏差：stream 段物化）
    OpResult RunCsvReader(DuckDBBridge &db, const EtlTaskNode &node);

    // Filter: WHERE 过滤 → 建输出表
    OpResult RunFilter(DuckDBBridge &db, const EtlTaskNode &node);

} // namespace dc::ops