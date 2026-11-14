// src/operators/transform/PortConverters.cpp
#include "../../engine/EtlTask.h"
#include "../../engine/OperatorBase.h"
#include "../../engine/PortTransformRegistry.h"
#include <iostream>

namespace dataclean {

// =========================================================================
// 1. ChunkToTable 转换算子
// =========================================================================
class ChunkToTableOperator : public OperatorBase {
  public:
    void BindParams(const nlohmann::json &params) override {
        // 转换算子通常不需要参数
    }

    void SetInputs(const std::vector<std::shared_ptr<void>> &inputs) override {
        // inputs 里面装的是上游吐出来的 Arrow Chunk
        chunks_ = inputs;
    }

    std::vector<std::shared_ptr<void>> Execute(OperatorContext &ctx) override {
        // 1. 申请一个全局唯一的临时表名
        std::string tableName = ctx.AllocateTempTableName("tmp_chunk_to_table");

        // 2. 获取 DuckDB 连接
        // auto conn = static_cast<duckdb::Connection*>(ctx.GetDuckDBConnection());

        // 3. TODO: 在这里把 chunks_ 里的 Arrow 数据，通过 DuckDB 的 Append API 零拷贝写入 tableName
        // 伪代码：conn->Append(tableName, *chunk);

        // 4. 返回包含表名的 shared_ptr（下游算子会把它当成 kTable 接收）
        auto tableNamePtr = std::make_shared<std::string>(tableName);
        return {tableNamePtr};
    }

  private:
    std::vector<std::shared_ptr<void>> chunks_;
};

// =========================================================================
// 2. JsonToTable 转换算子
// =========================================================================
class JsonToTableOperator : public OperatorBase {
  public:
    void BindParams(const nlohmann::json &params) override {}

    void SetInputs(const std::vector<std::shared_ptr<void>> &inputs) override {
        // inputs 里面装的是 JSON 字符串数据
        jsonChunks_ = inputs;
    }

    std::vector<std::shared_ptr<void>> Execute(OperatorContext &ctx) override {
        std::string tableName = ctx.AllocateTempTableName("tmp_json_to_table");

        // 2. 获取 DuckDB 连接
        // auto conn = static_cast<duckdb::Connection*>(ctx.GetDuckDBConnection());

        // 3. TODO: 解析 JSON 数据，通过 DuckDB 的 read_json 或 Append 写入 tableName
        // 伪代码：conn->Query("CREATE TABLE " + tableName + " AS SELECT * FROM read_json_auto(...)");

        auto tableNamePtr = std::make_shared<std::string>(tableName);
        return {tableNamePtr};
    }

  private:
    std::vector<std::shared_ptr<void>> jsonChunks_;
};

// =========================================================================
// 3. 工厂注册（让 EtlEngine 能根据字符串找到对应的类）
// =========================================================================
REGISTER_OPERATOR("ChunkToTable", ChunkToTableOperator);
REGISTER_OPERATOR("JsonToTable", JsonToTableOperator);

// =========================================================================
// 4. 规则注册（让 GraphCompiler 知道什么时候插入这些算子）
// =========================================================================
// 当上游输出 kChunk，而下游要求 kTable 时，插入 ChunkToTable
REGISTER_PORT_TRANSFORM(PortDataKind::kChunk, PortDataKind::kTable, "ChunkToTable");

// 当上游输出 kJson，而下游要求 kTable 时，插入 JsonToTable
REGISTER_PORT_TRANSFORM(PortDataKind::kJson, PortDataKind::kTable, "JsonToTable");

// 如果以后有反向转换，也可以直接加：
// REGISTER_PORT_TRANSFORM(PortDataKind::kTable, PortDataKind::kChunk, "TableToChunk");

} // namespace dataclean