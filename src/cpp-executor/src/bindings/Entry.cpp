// src/bindings/Entry.cpp
#include <mutex>
#include <napi.h>
#include <string>

// 引入你的核心引擎头文件
#include "core/DuckDBSession.h"
#include "core/MaterializedStore.h"
#include "engine/EtlEngine.h"
#include "engine/GraphCompiler.h"

// src/bindings/Entry.cpp（或 src/util/DuckDBJson.h）
#include "duckdb.hpp"
#include <nlohmann/json.hpp>

using json = nlohmann::json;

namespace dataclean {

// 全局引擎实例（保持常驻）
static EtlEngine *g_engine = nullptr;
static std::mutex g_engineMutex;

// =========================================================================
// 内部同步执行函数（在 Worker 线程中运行，绝不碰 V8 引擎）
// =========================================================================
struct ExecutePayload {
    std::string graphJson;
    std::string targetNodeId;
    bool success = false;
    std::string errorMsg;
};

// 根据 DuckDB C API 的物理类型，读取单元格值并转成 json
static json CellToJson(duckdb_result *res, idx_t col, idx_t row) {
    auto type = duckdb_column_type(res, col);
    if (duckdb_value_is_null(res, col, row)) return nullptr;

    switch (type) {
    case DUCKDB_TYPE_BOOLEAN:
        return duckdb_value_boolean(res, col, row);
    case DUCKDB_TYPE_TINYINT:
        return duckdb_value_int8(res, col, row);
    case DUCKDB_TYPE_SMALLINT:
        return duckdb_value_int16(res, col, row);
    case DUCKDB_TYPE_INTEGER:
        return duckdb_value_int32(res, col, row);
    case DUCKDB_TYPE_BIGINT:
        return duckdb_value_int64(res, col, row);
    case DUCKDB_TYPE_UTINYINT:
        return duckdb_value_uint8(res, col, row);
    case DUCKDB_TYPE_USMALLINT:
        return duckdb_value_uint16(res, col, row);
    case DUCKDB_TYPE_UINTEGER:
        return duckdb_value_uint32(res, col, row);
    case DUCKDB_TYPE_UBIGINT:
        return duckdb_value_uint64(res, col, row);
    case DUCKDB_TYPE_FLOAT:
        return duckdb_value_float(res, col, row);
    case DUCKDB_TYPE_DOUBLE:
        return duckdb_value_double(res, col, row);
    case DUCKDB_TYPE_VARCHAR: {
        char *s = duckdb_value_varchar(res, col, row);
        std::string result = s ? s : "";
        if (s) duckdb_free(s);
        return result;
    }
    case DUCKDB_TYPE_DATE: {
        duckdb_date d = duckdb_value_date(res, col, row);
        // 转字符串需要 duckdb_from_date，这里简化为数字
        return d.days;
    }
    case DUCKDB_TYPE_TIMESTAMP: {
        duckdb_timestamp ts = duckdb_value_timestamp(res, col, row);
        return ts.micros;
    }
    default: {
        // 兜底：尝试转字符串
        char *s = duckdb_value_varchar(res, col, row);
        std::string result = s ? s : "";
        if (s) duckdb_free(s);
        return result;
    }
    }
}

// 主函数：把 duckdb_result 转成 JSON 字符串
std::string DuckDBResultToJson(duckdb_result *res) {
    if (!res) return "[]";

    idx_t col_count = duckdb_column_count(res);
    idx_t row_count = duckdb_row_count(res);

    // 提取列名
    std::vector<std::string> columns;
    columns.reserve(col_count);
    for (idx_t c = 0; c < col_count; ++c) {
        const char *name = duckdb_column_name(res, c);
        columns.push_back(name ? name : ("col_" + std::to_string(c)));
    }

    json rows = json::array();
    for (idx_t r = 0; r < row_count; ++r) {
        json row = json::object();
        for (idx_t c = 0; c < col_count; ++c) { row[columns[c]] = CellToJson(res, c, r); }
        rows.push_back(std::move(row));
    }
    return rows.dump();
}

void ExecuteInternal(ExecutePayload *payload) {
    GraphCompiler compiler;
    EtlTask task;
    StepTraces traces;

    // 1. 编译阶段
    auto err = compiler.Compile(payload->graphJson, payload->targetNodeId, task, &traces);
    if (!err.ok) {
        payload->success = false;
        payload->errorMsg = "Compile Error [" + err.nodeId + "]: " + err.message;
        return;
    }

    // 2. 执行阶段
    std::string execError;
    if (!g_engine->Execute(task, execError)) {
        payload->success = false;
        payload->errorMsg = "Execution Error: " + execError;
        return;
    }

    payload->success = true;
}

// =========================================================================
// NAPI 异步任务：ExecuteAsyncWorker
// =========================================================================
class ExecuteAsyncWorker : public Napi::AsyncWorker {
  public:
    ExecuteAsyncWorker(Napi::Env env, ExecutePayload *payload)
        : Napi::AsyncWorker(env), payload_(payload), deferred_(Napi::Promise::Deferred::New(env)) {}

    // 在后台线程执行（执行重 CPU 逻辑）
    void Execute() override { ExecuteInternal(payload_); }

    // 在 Node.js 主线程执行（执行完毕后的回调）
    void OnOK() override {
        Napi::HandleScope scope(Env());
        Napi::Object result = Napi::Object::New(Env());

        if (payload_->success) {
            result.Set("success", Napi::Boolean::New(Env(), true));
            deferred_.Resolve(result);
        } else {
            result.Set("success", Napi::Boolean::New(Env(), false));
            result.Set("error", Napi::String::New(Env(), payload_->errorMsg));
            deferred_.Resolve(result);
        }

        delete payload_;
    }

    // 发生异常时的处理
    void OnError(const Napi::Error &e) override {
        Napi::HandleScope scope(Env());
        deferred_.Reject(e.Value());
        delete payload_;
    }

    Napi::Promise GetPromise() { return deferred_.Promise(); }

  private:
    ExecutePayload *payload_;
    Napi::Promise::Deferred deferred_;
};

// =========================================================================
// JS 调用的入口函数：ExecutePipeline
// =========================================================================
Napi::Value ExecutePipeline(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();

    // 解析 JS 传进来的参数：graphJson (string), targetNodeId (string, optional)
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "graphJson must be a string").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string graphJson = info[0].As<Napi::String>().Utf8Value();
    std::string targetNodeId = info.Length() > 1 && info[1].IsString() ? info[1].As<Napi::String>().Utf8Value() : "";

    auto *payload = new ExecutePayload{graphJson, targetNodeId};

    auto *worker = new ExecuteAsyncWorker(env, payload);
    auto promise = worker->GetPromise();
    worker->Queue(); // 将任务丢给 libuv 线程池

    return promise;
}

Napi::Value GetNodeDataPage(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    std::string nodeId = info[0].As<Napi::String>().Utf8Value();
    int64_t offset = info[1].As<Napi::Number>().Int64Value();
    int64_t limit = info[2].As<Napi::Number>().Int64Value();

    auto state = MaterializedStore::Instance().GetState(nodeId);

    if (state == MaterializedStore::State::kBuffering) {
        std::string json = MaterializedStore::Instance().ReadMemoryPageJson(nodeId, offset, limit);
        return Napi::String::New(env, json);
    } else if (state == MaterializedStore::State::kSpilled) {
        auto conn = DuckDBSession::Instance().Acquire();
        auto res = MaterializedStore::Instance().ReadSpilledPage(nodeId, offset, limit, conn.get());
        DuckDBSession::Instance().Release(conn);
        if (!res) return env.Null();
        // 你需要一个 helper：duckdb_result -> JSON 字符串
        return Napi::String::New(env, DuckDBResultToJson(res.get()));
    }
    return env.Null();
}

// =========================================================================
// 模块初始化：在 Node 加载 .node 文件时调用
// =========================================================================
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    // 初始化全局单例资源
    DuckDBSession::Instance().Initialize(":memory:", 4);

    g_engine = new EtlEngine();

    // 暴露给 JS 的方法
    exports.Set("executePipeline", Napi::Function::New(env, ExecutePipeline));

    return exports;
}

NODE_API_MODULE(dataclean_executor, Init)

} // namespace dataclean