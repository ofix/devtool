#include <napi.h>

#include "ExecThread.h"
#include "util/Json.h"

namespace {

std::unique_ptr<dc::ExecThread> g_exec;

// ── submitTask(task) → { taskAccepted, taskId } 或 { code, ... }
Napi::Value SubmitTask(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  try {
    auto obj = info[0].As<Napi::Object>();
    Napi::Object jsonObj = Napi::Object::New(env);
    // 直接 dumps：用 napi 的 object → JSON 需要一次转换
    // 简化：要求 Renderer 传 JSON 字符串，而非对象
    if (!obj.Has("__json")) {
      // 兼容：若传的是对象，用 napi_json 序列化（node-addon-api 无内置）
      // 方案：要求传字符串，见下方 fetchPreviewWindow 同样策略
      Napi::Object err = Napi::Object::New(env);
      err.Set("code", "NODE_PARAM_INVALID");
      err.Set("message", "submitTask expects { __json: string }");
      err.Set("retryable", false);
      return err;
    }
    dc::json j =
        dc::json::parse(obj.Get("__json").As<Napi::String>().Utf8Value());
    dc::EtlTask task = dc::ParseTask(j);

    if (task.protocolVersion != 1) {
      Napi::Object err = Napi::Object::New(env);
      err.Set("code", "PROTOCOL_MISMATCH");
      err.Set("message", "协议版本不一致");
      err.Set("retryable", false);
      return err;
    }
    g_exec->Submit(task);
    Napi::Object ack = Napi::Object::New(env);
    ack.Set("taskAccepted", true);
    ack.Set("taskId", Napi::String::New(env, task.taskId));
    return ack;
  } catch (const std::exception& e) {
    Napi::Object err = Napi::Object::New(env);
    err.Set("code", "NODE_PARAM_INVALID");
    err.Set("message", e.what());
    err.Set("retryable", false);
    return err;
  }
}

Napi::Value CancelTask(const Napi::CallbackInfo& info) {
  try {
    auto obj = info[0].As<Napi::Object>();
    std::string taskId = obj.Get("taskId").As<Napi::String>().Utf8Value();
    g_exec->Cancel(taskId);
  } catch (...) {
  }
  return info.Env().Undefined();
}

Napi::Value FetchPreviewWindow(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  try {
    auto obj = info[0].As<Napi::Object>();
    std::string key = obj.Get("recordSetKey").As<Napi::String>().Utf8Value();
    std::string ver = obj.Get("resultVersion").As<Napi::String>().Utf8Value();
    bool forward =
        obj.Get("direction").As<Napi::String>().Utf8Value() == "forward";
    int64_t anchor = obj.Get("anchorSeq").As<Napi::Number>().Int64Value();
    int limit = obj.Get("limit").As<Napi::Number>().Int32Value();
    if (limit > 500) limit = 500;  // R-14 clamp

    auto res = g_exec->FetchWindow(key, ver, forward, anchor, limit);
    Napi::Object out = Napi::Object::New(env);
    if (!res.has_value()) {
      out.Set("stale", true);
      out.Set("code", "STALE_RESULT");
      return out;
    }
    Napi::Array arr = Napi::Array::New(env, res->rows.size());
    for (size_t i = 0; i < res->rows.size(); ++i) {
      Napi::Object r = Napi::Object::New(env);
      r.Set("seq", Napi::Number::New(env, (double)res->rows[i].seq));
      r.Set("payload", Napi::String::New(env, res->rows[i].payload));
      arr.Set((uint32_t)i, r);
    }
    out.Set("rows", arr);
    out.Set("total", Napi::Number::New(env, (double)res->total));
    out.Set("done", res->rows.size() < (size_t)limit);
    return out;
  } catch (const std::exception& e) {
    Napi::Object err = Napi::Object::New(env);
    err.Set("code", "INTERNAL");
    err.Set("message", e.what());
    err.Set("retryable", false);
    return err;
  }
}

Napi::Value PollEvents(const Napi::CallbackInfo& info) {
  // M1：事件 sink 未接 MessagePort，返回空数组占位
  return Napi::Array::New(info.Env(), 0);
}

Napi::Value GetExecutorInfo(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  Napi::Object o = Napi::Object::New(env);
  o.Set("protocolVersion", Napi::Number::New(env, 1));
  o.Set("addonVersion", Napi::String::New(env, "0.1.0-mvc"));
  o.Set("duckdbVersion",
        Napi::String::New(env, duckdb::DuckDB::LibraryVersion()));
  o.Set("sqliteVersion", Napi::String::New(env, sqlite3_libversion()));
  return o;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  g_exec = std::make_unique<dc::ExecThread>(":memory:");
  exports.Set("submitTask", Napi::Function::New(env, SubmitTask));
  exports.Set("cancelTask", Napi::Function::New(env, CancelTask));
  exports.Set("fetchPreviewWindow",
              Napi::Function::New(env, FetchPreviewWindow));
  exports.Set("pollEvents", Napi::Function::New(env, PollEvents));
  exports.Set("getExecutorInfo", Napi::Function::New(env, GetExecutorInfo));
  return exports;
}

}  // namespace

NODE_API_MODULE(dataclean_executor, Init)