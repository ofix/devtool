// src/engine/OperatorBase.h
#pragma once
#include "../core/DuckDBSession.h"
#include "Enums.h"
#include "EtlTask.h"
#include <memory>
#include <nlohmann/json.hpp>
#include <string>
#include <vector>
namespace duckdb {
class Connection;
}

namespace dataclean {

// 节点执行上下文：封装了算子运行所需的一切外部依赖
// 由 EtlEngine 在 ExecuteSingleNode 里构造并传入
class OperatorContext {
  public:
    // 借一个 DuckDB 连接（线程安全，内部池化）
    virtual DuckDBSession::SessionConnection *GetSessionConnection() = 0;

    // 申请一个全局唯一的临时表名
    virtual std::string AllocateTempTableName(const std::string &prefix) = 0;

    // 上报进度（可选，CLI/UI 监听）
    virtual void ReportProgress(double percent) {}

    virtual ~OperatorContext() = default;
};

// 所有算子的统一基类
class OperatorBase {
  public:
    virtual ~OperatorBase() = default;

    // 绑定编译期解析好的参数 JSON
    virtual void BindParams(const nlohmann::json &params) = 0;

    // 设置输入数据（根据 InputPort::recordSetKind 决定是 Chunk 还是 Table 名）
    virtual void SetInputs(const std::vector<std::shared_ptr<void>> &inputs) = 0;

    // 执行算子，产出输出数据
    virtual std::vector<std::shared_ptr<void>> Execute(OperatorContext &ctx) = 0;
};

// 算子工厂：根据 typeName 创建实例
using OperatorFactoryFn = std::unique_ptr<OperatorBase> (*)();

class OperatorRegistry {
  public:
    static OperatorRegistry &Instance();

    void Register(const std::string &typeName, OperatorFactoryFn fn);
    std::unique_ptr<OperatorBase> Create(const std::string &typeName);

  private:
    OperatorRegistry() = default;
    std::unordered_map<std::string, OperatorFactoryFn> factories_;
};

// 注册宏：在算子 .cpp 文件末尾使用，零侵入
// 示例：REGISTER_OPERATOR("Filter", FilterOperator)
#define REGISTER_OPERATOR(typeName, ClassName)                                                                         \
    static bool _reg_op_##ClassName =                                                                                  \
        (OperatorRegistry::Instance().Register(                                                                        \
             typeName, []() -> std::unique_ptr<OperatorBase> { return std::make_unique<ClassName>(); }),               \
         true)

} // namespace dataclean