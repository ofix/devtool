#include <napi.h>
#include <memory>
#include <unordered_map>
#include <vector>
#include <stdexcept>

// 自定义头文件（按模块划分，保持原有目录结构）
#include "./window-info/window_info.h"
#include "./file-compare/file_compare.h"
#include "./cursor/cursor.h"
#include "./screen-freeze/screen_freeze.h"
#include "./shm/GlobalShm.hpp"

// 平台检测 - 包含对应平台的窗口枚举器头文件
#ifdef _WIN32
#include "./window-info/windows/window_enumerator.cc"
#elif defined(__APPLE__)
#include "./window-info/macos/window_enumerator.cc"
#elif defined(__linux__)
#include "./window-info/linux/window_enumerator.cc"
#else
#pragma message("Unsupported platform for window-info module")
#endif

static GlobalShm g;
static ShmChannel chan;

///////////////////////////// window-info  窗口信息获取 /////////////////////////////////
Napi::Value GetAllWindows(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    try
    {
        std::unique_ptr<WindowEnumerator> enumerator;

#ifdef _WIN32
        enumerator = std::make_unique<WindowsWindowEnumerator>();
#elif defined(__APPLE__)
        enumerator = std::make_unique<MacOSWindowEnumerator>();
#elif defined(__linux__)
        enumerator = std::make_unique<LinuxWindowEnumerator>();
#else
        throw std::runtime_error("window-info module is not supported on current platform");
#endif

        auto windows = enumerator->GetAllWindows();
        Napi::Array result = Napi::Array::New(env, windows.size());

        for (size_t i = 0; i < windows.size(); i++)
        {
            const auto &win = windows[i];
            Napi::Object obj = Napi::Object::New(env);

            obj.Set(Napi::String::New(env, "handle"), Napi::Number::New(env, win.handle));
            obj.Set(Napi::String::New(env, "title"), Napi::String::New(env, win.title));
            obj.Set(Napi::String::New(env, "pid"), Napi::Number::New(env, win.pid));
            obj.Set(Napi::String::New(env, "x"), Napi::Number::New(env, win.x));
            obj.Set(Napi::String::New(env, "y"), Napi::Number::New(env, win.y));
            obj.Set(Napi::String::New(env, "width"), Napi::Number::New(env, win.width));
            obj.Set(Napi::String::New(env, "height"), Napi::Number::New(env, win.height));
            obj.Set(Napi::String::New(env, "isVisible"), Napi::Boolean::New(env, win.isVisible));
            obj.Set(Napi::String::New(env, "processName"), Napi::String::New(env, win.processName));
            obj.Set(Napi::String::New(env, "platform"), Napi::String::New(env, win.platform));
            obj.Set(Napi::String::New(env, "zOrder"), Napi::Number::New(env, win.zOrder));

            result.Set(i, obj);
        }

        return result;
    }
    catch (const std::exception &e)
    {
        Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        return env.Null();
    }
}

///////////////////////////// File Compare 文件/文件夹比对 /////////////////////////////////////

// 全局FileCompare实例（单例）
std::unique_ptr<FileCompare> g_file_compare = std::make_unique<FileCompare>();

// ---------------------- 1. 扫描文件夹：异步工作线程（适配旧版AsyncWorker） ----------------------
struct ScanFolderWorker : public Napi::AsyncWorker
{
    std::string folder_path;
    bool ignore_hidden;
    std::unordered_map<std::string, FileInfo> result;
    Napi::Function callback; // 手动保存回调

    // 适配版构造函数：仅传Env+资源名，回调手动赋值
    ScanFolderWorker(Napi::Env env, std::string p, bool ih, Napi::Function cb)
        : Napi::AsyncWorker(env, "scan-folder-worker"), // 构造：Env + 资源名（兼容旧版）
          folder_path(p), ignore_hidden(ih), callback(cb)
    {
        // 无需SetCallback，直接保存回调到成员变量
    }

    void Execute() override
    {
        try
        {
            result = g_file_compare->scan_folder(folder_path, ignore_hidden);
        }
        catch (const std::exception &e)
        {
            SetError(e.what());
        }
    }

    void OnOK() override
    {
        Napi::Env env = this->Env();
        Napi::Object res = Napi::Object::New(env);

        for (const auto &[rel_path, info] : result)
        {
            Napi::Object obj = Napi::Object::New(env);
            obj.Set(Napi::String::New(env, "fullPath"), Napi::String::New(env, info.full_path));
            obj.Set(Napi::String::New(env, "relPath"), Napi::String::New(env, info.rel_path));
            obj.Set(Napi::String::New(env, "size"), Napi::Number::New(env, (double)info.size));
            obj.Set(Napi::String::New(env, "crc32"), Napi::String::New(env, info.crc32));
            obj.Set(Napi::String::New(env, "isText"), Napi::Boolean::New(env, info.is_text));
            res.Set(Napi::String::New(env, rel_path), obj);
        }

        // 手动调用回调（替代父类的Callback()）
        callback.Call({env.Null(), res});
    }

    void OnError(const Napi::Error &e) override
    {
        // 错误时调用回调，传递错误信息
        callback.Call({e.Value()});
    }
};

// ---------------------- 2. 文件夹比对：异步工作线程（适配旧版AsyncWorker） ----------------------
struct FolderCompareWorker : public Napi::AsyncWorker
{
    std::string folder_a;
    std::string folder_b;
    bool ignore_hidden;
    FolderDiffResult result;
    Napi::Function callback; // 手动保存回调

    FolderCompareWorker(Napi::Env env, std::string a, std::string b, bool ih, Napi::Function cb)
        : Napi::AsyncWorker(env, "folder-compare-worker"),
          folder_a(a), folder_b(b), ignore_hidden(ih), callback(cb) {}

    void Execute() override
    {
        result = g_file_compare->compare_folders(folder_a, folder_b, ignore_hidden);
        if (!result.error.empty())
        {
            SetError(result.error);
        }
    }

    void OnOK() override
    {
        Napi::Env env = this->Env();
        Napi::Object res = Napi::Object::New(env);
        res.Set(Napi::String::New(env, "error"), Napi::String::New(env, result.error));
        res.Set(Napi::String::New(env, "totalFiles"), Napi::Number::New(env, (double)result.total_files));

        auto fileInfoToJs = [&](const std::vector<FileInfo> &infos) -> Napi::Array
        {
            Napi::Array arr = Napi::Array::New(env, infos.size());
            for (size_t i = 0; i < infos.size(); ++i)
            {
                Napi::Object obj = Napi::Object::New(env);
                obj.Set(Napi::String::New(env, "fullPath"), Napi::String::New(env, infos[i].full_path));
                obj.Set(Napi::String::New(env, "relPath"), Napi::String::New(env, infos[i].rel_path));
                obj.Set(Napi::String::New(env, "size"), Napi::Number::New(env, (double)infos[i].size));
                obj.Set(Napi::String::New(env, "crc32"), Napi::String::New(env, infos[i].crc32));
                obj.Set(Napi::String::New(env, "isText"), Napi::Boolean::New(env, infos[i].is_text));
                arr.Set(i, obj);
            }
            return arr;
        };

        Napi::Object diffs = Napi::Object::New(env);
        diffs.Set(Napi::String::New(env, "added"), fileInfoToJs(result.diffs.added));
        diffs.Set(Napi::String::New(env, "deleted"), fileInfoToJs(result.diffs.deleted));
        diffs.Set(Napi::String::New(env, "modified"), fileInfoToJs(result.diffs.modified));
        diffs.Set(Napi::String::New(env, "same"), fileInfoToJs(result.diffs.same));
        res.Set(Napi::String::New(env, "diffs"), diffs);

        callback.Call({env.Null(), res});
    }

    void OnError(const Napi::Error &e) override
    {
        callback.Call({e.Value()});
    }
};

// ---------------------- 3. 单文件比对：异步工作线程（适配旧版AsyncWorker） ----------------------
struct FileCompareWorker : public Napi::AsyncWorker
{
    std::string file_a;
    std::string file_b;
    FileDiffResult result;
    Napi::Function callback; // 手动保存回调

    FileCompareWorker(Napi::Env env, std::string a, std::string b, Napi::Function cb)
        : Napi::AsyncWorker(env, "file-compare-worker"),
          file_a(a), file_b(b), callback(cb) {}

    void Execute() override
    {
        result = g_file_compare->compare_files(file_a, file_b);
        if (!result.error.empty())
        {
            SetError(result.error);
        }
    }

    void OnOK() override
    {
        Napi::Env env = this->Env();
        Napi::Object res = Napi::Object::New(env);
        res.Set(Napi::String::New(env, "relPath"), Napi::String::New(env, result.rel_path));
        res.Set(Napi::String::New(env, "isText"), Napi::Boolean::New(env, result.is_text));
        res.Set(Napi::String::New(env, "error"), Napi::String::New(env, result.error));

        Napi::Array diffs = Napi::Array::New(env, result.diffs.size());
        for (size_t i = 0; i < result.diffs.size(); ++i)
        {
            Napi::Object obj = Napi::Object::New(env);
            obj.Set(Napi::String::New(env, "type"), Napi::Number::New(env, (double)result.diffs[i].first));
            obj.Set(Napi::String::New(env, "content"), Napi::String::New(env, result.diffs[i].second));
            diffs.Set(i, obj);
        }
        res.Set(Napi::String::New(env, "diffs"), diffs);

        callback.Call({env.Null(), res});
    }

    void OnError(const Napi::Error &e) override
    {
        callback.Call({e.Value()});
    }
};

// ---------------------- 注册N-API导出函数 ----------------------
Napi::Value ScanFolder(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 3 || !info[0].IsString() || !info[1].IsBoolean() || !info[2].IsFunction())
    {
        Napi::TypeError::New(env, "Params error: (string folderPath, bool ignoreHidden, function callback)").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string folder_path = info[0].As<Napi::String>().Utf8Value();
    bool ignore_hidden = info[1].As<Napi::Boolean>().Value();
    Napi::Function callback = info[2].As<Napi::Function>();

    auto worker = new ScanFolderWorker(env, folder_path, ignore_hidden, callback);
    worker->Queue();
    return env.Undefined();
}

Napi::Value CompareFolders(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 4 || !info[0].IsString() || !info[1].IsString() || !info[2].IsBoolean() || !info[3].IsFunction())
    {
        Napi::TypeError::New(env, "Params error: (string folderA, string folderB, bool ignoreHidden, function callback)").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string folder_a = info[0].As<Napi::String>().Utf8Value();
    std::string folder_b = info[1].As<Napi::String>().Utf8Value();
    bool ignore_hidden = info[2].As<Napi::Boolean>().Value();
    Napi::Function callback = info[3].As<Napi::Function>();

    auto worker = new FolderCompareWorker(env, folder_a, folder_b, ignore_hidden, callback);
    worker->Queue();
    return env.Undefined();
}

Napi::Value CompareFiles(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 3 || !info[0].IsString() || !info[1].IsString() || !info[2].IsFunction())
    {
        Napi::TypeError::New(env, "Params error: (string fileA, string fileB, function callback)").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string file_a = info[0].As<Napi::String>().Utf8Value();
    std::string file_b = info[1].As<Napi::String>().Utf8Value();
    Napi::Function callback = info[2].As<Napi::Function>();

    auto worker = new FileCompareWorker(env, file_a, file_b, callback);
    worker->Queue();
    return env.Undefined();
}

///////////////////////////// 新增：cursor鼠标坐标 N-API封装 /////////////////////////////////
// 修复：自定义TrackCursorWorker（适配旧版AsyncWorker，移除override，自己实现数据存储）
struct TrackCursorWorker : public Napi::AsyncWorker
{
    int interval_ms;
    Napi::Function callback;
    CursorManager &cursor_mgr;
    std::atomic<bool> stop_flag;
    // 自己实现数据存储（替代SetData/GetData）
    std::string x_data;
    std::string y_data;
    std::string error_data;
    // N-API线程安全回调
    Napi::ThreadSafeFunction tsfn;

    TrackCursorWorker(Napi::Env env, int interval, Napi::Function cb)
        : Napi::AsyncWorker(env, "track-cursor-worker"),
          interval_ms(interval), callback(cb),
          cursor_mgr(CursorManager::GetInstance()), stop_flag(false)
    {
        // 创建线程安全函数（用于跨线程调用JS回调）
        tsfn = Napi::ThreadSafeFunction::New(
            env,
            cb,
            "TrackCursorCallback",
            0,
            1);
    }

    ~TrackCursorWorker()
    {
        tsfn.Release();
    }

    // 修复：移除override，旧版AsyncWorker没有OnProgress
    void OnProgress()
    {
        Napi::Env env = this->Env();
        Napi::Object result = Napi::Object::New(env);
        result.Set("x", Napi::Number::New(env, std::stoi(x_data)));
        result.Set("y", Napi::Number::New(env, std::stoi(y_data)));
        result.Set("error", Napi::String::New(env, error_data));
        callback.Call({env.Null(), result});
    }

    // 修复：移除override，旧版AsyncWorker没有Cancel
    void Cancel()
    {
        stop_flag = true;
        cursor_mgr.StopTracking();
        Napi::AsyncWorker::Cancel();
    }

    void GlobalCleanup()
    {
        CursorManager::GetInstance().Cleanup();
    }

    void Execute() override
    {
        try
        {
            // 纯C++回调函数（不能用lambda，必须是普通函数）
            auto cursor_callback_func = [](const CursorPosition &pos, void *user_data)
            {
                TrackCursorWorker *worker = static_cast<TrackCursorWorker *>(user_data);
                if (worker->stop_flag)
                    return;

                // 存储数据（自己实现的SetData）
                worker->x_data = std::to_string(pos.x);
                worker->y_data = std::to_string(pos.y);
                worker->error_data = pos.error;

                // 跨线程调用JS回调
                auto callback = [](Napi::Env env, Napi::Function jsCallback, const CursorPosition *pos)
                {
                    Napi::Object result = Napi::Object::New(env);
                    result.Set("x", Napi::Number::New(env, pos->x));
                    result.Set("y", Napi::Number::New(env, pos->y));
                    result.Set("error", Napi::String::New(env, pos->error));
                    jsCallback.Call({env.Null(), result});
                };

                worker->tsfn.BlockingCall(const_cast<CursorPosition *>(&pos), callback);
            };

            // 构造回调结构体
            CursorManager::TrackCallback callback{cursor_callback_func, this};

            // 启动纯C++监听
            cursor_mgr.StartTracking(interval_ms, callback);

            // 等待停止信号（修复：移除IsCancelled，用stop_flag）
            while (!stop_flag)
            {
                std::this_thread::sleep_for(std::chrono::milliseconds(10));
            }
        }
        catch (const std::exception &e)
        {
            SetError(e.what());
        }
    }

    void OnOK() override
    {
        Napi::Env env = this->Env();
        callback.Call({env.Null(), Napi::String::New(env, "Tracking stopped")});
    }

    void OnError(const Napi::Error &e) override
    {
        callback.Call({e.Value()});
    }
};

// 同步获取鼠标坐标（N-API封装）
Napi::Value GetCursorPosition(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    Napi::Object result = Napi::Object::New(env);

    try
    {
        CursorManager &mgr = CursorManager::GetInstance();
        mgr.Init(); // 初始化X11
        CursorPosition pos = mgr.GetCursorPosition();

        result.Set("x", Napi::Number::New(env, pos.x));
        result.Set("y", Napi::Number::New(env, pos.y));
        result.Set("error", Napi::String::New(env, pos.error));
    }
    catch (const std::exception &e)
    {
        result.Set("x", Napi::Number::New(env, -1));
        result.Set("y", Napi::Number::New(env, -1));
        result.Set("error", Napi::String::New(env, e.what()));
    }

    return result;
}

// 异步监听鼠标坐标（N-API封装）
Napi::Value TrackCursorAsync(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsFunction())
    {
        Napi::TypeError::New(env, "Params error: (number intervalMs, function callback)").ThrowAsJavaScriptException();
        return env.Null();
    }

    int interval_ms = info[0].As<Napi::Number>().Int32Value();
    Napi::Function callback = info[1].As<Napi::Function>();

    try
    {
        // 初始化CursorManager
        CursorManager::GetInstance().Init();
        auto worker = new TrackCursorWorker(env, interval_ms, callback);
        worker->Queue();
    }
    catch (const std::exception &e)
    {
        Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    }

    return env.Undefined();
}

// 同步冻结屏幕
Napi::Value FreezeScreen(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    bool result = ScreenFreeze::GetInstance().FreezeScreen();
    return Napi::Boolean::New(env, result);
}

// 同步解冻屏幕
Napi::Value UnFreezeScreen(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    ScreenFreeze::GetInstance().UnFreezeScreen();
    // 修复1：替换env.Boolean(true)为标准写法
    return Napi::Boolean::New(env, true);
}

// 检查是否冻结
Napi::Value IsScreenFrozen(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    bool is_locked = ScreenFreeze::GetInstance().IsScreenFrozen();
    // 修复2：替换env.Boolean(is_locked)为标准写法
    return Napi::Boolean::New(env, is_locked);
}

// 共享内存
Napi::Value init(const Napi::CallbackInfo &i)
{
    Napi::Env env = i.Env();
    bool ok = g.open();
    return Napi::Boolean::New(env, ok);
}

Napi::Value openChannel(const Napi::CallbackInfo &i)
{
    Napi::Env env = i.Env();
    std::string name = i[0].As<Napi::String>();
    bool ok = chan.open(name.c_str());
    return Napi::Boolean::New(env, ok);
}

Napi::Value readBinary(const Napi::CallbackInfo &i)
{
    Napi::Env env = i.Env();
    Napi::Number num = i[0].As<Napi::Number>();
    uint8_t rid = static_cast<uint8_t>(num.Int32Value());  // 明确调用 Int32Value()
    ShmMessage msg;
    if (!chan.pop(rid, msg))
        return env.Null();

    Napi::Object o = Napi::Object::New(env);
    o.Set("id", (double)msg.id);
    o.Set("type", (int)msg.channel_type);
    o.Set("offset", (double)msg.file_offset);
    o.Set("len", (int)msg.data_len);
    return o;
}

////////////////////////////////// 模块初始化 /////////////////////////////////////
Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set(Napi::String::New(env, "getAllWindows"), Napi::Function::New(env, GetAllWindows));
    exports.Set(Napi::String::New(env, "scanFolder"), Napi::Function::New(env, ScanFolder));
    exports.Set(Napi::String::New(env, "compareFolders"), Napi::Function::New(env, CompareFolders));
    exports.Set(Napi::String::New(env, "compareFiles"), Napi::Function::New(env, CompareFiles));
    exports.Set(Napi::String::New(env, "getCursorPosition"), Napi::Function::New(env, GetCursorPosition));
    exports.Set(Napi::String::New(env, "trackCursorAsync"), Napi::Function::New(env, TrackCursorAsync));
    exports.Set(Napi::String::New(env, "freezeScreen"), Napi::Function::New(env, FreezeScreen));
    exports.Set(Napi::String::New(env, "unFreezeScreen"), Napi::Function::New(env, UnFreezeScreen));
    exports.Set(Napi::String::New(env, "isScreenFrozen"), Napi::Function::New(env, IsScreenFrozen));
    exports.Set(Napi::String::New(env, "init"), Napi::Function::New(env, init));
    exports.Set(Napi::String::New(env, "openChannel"), Napi::Function::New(env, openChannel));
    exports.Set(Napi::String::New(env, "read"), Napi::Function::New(env, readBinary));
    return exports;
}

NODE_API_MODULE(dev_tools_native, Init)