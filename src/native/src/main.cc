#include <napi.h>
#include <memory>
#include <unordered_map>
#include <vector>
#include <stdexcept>

// 自定义头文件（按模块划分，保持原有目录结构）
#include "./window-info/window_info.h"
#include "./file-compare/file_compare.h"

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

///////////////////////////// window-info  窗口信息获取 /////////////////////////////////
Napi::Value GetAllWindows(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  
  try {
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
    
    for (size_t i = 0; i < windows.size(); i++) {
      const auto& win = windows[i];
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
  } catch (const std::exception& e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Null();
  }
}

///////////////////////////// File Compare 文件/文件夹比对 /////////////////////////////////////

// 全局FileCompare实例（单例）
std::unique_ptr<FileCompare> g_file_compare = std::make_unique<FileCompare>();

// ---------------------- 1. 扫描文件夹：异步工作线程（适配旧版AsyncWorker） ----------------------
struct ScanFolderWorker : public Napi::AsyncWorker {
    std::string folder_path;
    bool ignore_hidden;
    std::unordered_map<std::string, FileInfo> result;
    Napi::Function callback;  // 手动保存回调

    // 适配版构造函数：仅传Env+资源名，回调手动赋值
    ScanFolderWorker(Napi::Env env, std::string p, bool ih, Napi::Function cb)
        : Napi::AsyncWorker(env, "scan-folder-worker"),  // 构造：Env + 资源名（兼容旧版）
          folder_path(p), ignore_hidden(ih), callback(cb) {
        // 无需SetCallback，直接保存回调到成员变量
    }

    void Execute() override {
        try {
            result = g_file_compare->scan_folder(folder_path, ignore_hidden);
        } catch (const std::exception& e) {
            SetError(e.what());
        }
    }

    void OnOK() override {
        Napi::Env env = this->Env();
        Napi::Object res = Napi::Object::New(env);
        
        for (const auto& [rel_path, info] : result) {
            Napi::Object obj = Napi::Object::New(env);
            obj.Set(Napi::String::New(env, "fullPath"), Napi::String::New(env, info.full_path));
            obj.Set(Napi::String::New(env, "relPath"), Napi::String::New(env, info.rel_path));
            obj.Set(Napi::String::New(env, "size"), Napi::Number::New(env, (double)info.size));
            obj.Set(Napi::String::New(env, "crc32"), Napi::String::New(env, info.crc32));
            obj.Set(Napi::String::New(env, "isText"), Napi::Boolean::New(env, info.is_text));
            res.Set(Napi::String::New(env, rel_path), obj);
        }
        
        // 手动调用回调（替代父类的Callback()）
        callback.Call({ env.Null(), res });
    }

    void OnError(const Napi::Error& e) override {
        // 错误时调用回调，传递错误信息
        callback.Call({ e.Value() });
    }
};

// ---------------------- 2. 文件夹比对：异步工作线程（适配旧版AsyncWorker） ----------------------
struct FolderCompareWorker : public Napi::AsyncWorker {
    std::string folder_a;
    std::string folder_b;
    bool ignore_hidden;
    FolderDiffResult result;
    Napi::Function callback;  // 手动保存回调

    FolderCompareWorker(Napi::Env env, std::string a, std::string b, bool ih, Napi::Function cb)
        : Napi::AsyncWorker(env, "folder-compare-worker"),
          folder_a(a), folder_b(b), ignore_hidden(ih), callback(cb) {}

    void Execute() override {
        result = g_file_compare->compare_folders(folder_a, folder_b, ignore_hidden);
        if (!result.error.empty()) {
            SetError(result.error);
        }
    }

    void OnOK() override {
        Napi::Env env = this->Env();
        Napi::Object res = Napi::Object::New(env);
        res.Set(Napi::String::New(env, "error"), Napi::String::New(env, result.error));
        res.Set(Napi::String::New(env, "totalFiles"), Napi::Number::New(env, (double)result.total_files));

        auto fileInfoToJs = [&](const std::vector<FileInfo>& infos) -> Napi::Array {
            Napi::Array arr = Napi::Array::New(env, infos.size());
            for (size_t i = 0; i < infos.size(); ++i) {
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

        callback.Call({ env.Null(), res });
    }

    void OnError(const Napi::Error& e) override {
        callback.Call({ e.Value() });
    }
};

// ---------------------- 3. 单文件比对：异步工作线程（适配旧版AsyncWorker） ----------------------
struct FileCompareWorker : public Napi::AsyncWorker {
    std::string file_a;
    std::string file_b;
    FileDiffResult result;
    Napi::Function callback;  // 手动保存回调

    FileCompareWorker(Napi::Env env, std::string a, std::string b, Napi::Function cb)
        : Napi::AsyncWorker(env, "file-compare-worker"),
          file_a(a), file_b(b), callback(cb) {}

    void Execute() override {
        result = g_file_compare->compare_files(file_a, file_b);
        if (!result.error.empty()) {
            SetError(result.error);
        }
    }

    void OnOK() override {
        Napi::Env env = this->Env();
        Napi::Object res = Napi::Object::New(env);
        res.Set(Napi::String::New(env, "relPath"), Napi::String::New(env, result.rel_path));
        res.Set(Napi::String::New(env, "isText"), Napi::Boolean::New(env, result.is_text));
        res.Set(Napi::String::New(env, "error"), Napi::String::New(env, result.error));

        Napi::Array diffs = Napi::Array::New(env, result.diffs.size());
        for (size_t i = 0; i < result.diffs.size(); ++i) {
            Napi::Object obj = Napi::Object::New(env);
            obj.Set(Napi::String::New(env, "type"), Napi::Number::New(env, (double)result.diffs[i].first));
            obj.Set(Napi::String::New(env, "content"), Napi::String::New(env, result.diffs[i].second));
            diffs.Set(i, obj);
        }
        res.Set(Napi::String::New(env, "diffs"), diffs);

        callback.Call({ env.Null(), res });
    }

    void OnError(const Napi::Error& e) override {
        callback.Call({ e.Value() });
    }
};

// ---------------------- 注册N-API导出函数 ----------------------
Napi::Value ScanFolder(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 3 || !info[0].IsString() || !info[1].IsBoolean() || !info[2].IsFunction()) {
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

Napi::Value CompareFolders(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 4 || !info[0].IsString() || !info[1].IsString() || !info[2].IsBoolean() || !info[3].IsFunction()) {
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

Napi::Value CompareFiles(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 3 || !info[0].IsString() || !info[1].IsString() || !info[2].IsFunction()) {
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

////////////////////////////////// 模块初始化 /////////////////////////////////////
Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set(Napi::String::New(env, "getAllWindows"), Napi::Function::New(env, GetAllWindows));
  exports.Set(Napi::String::New(env, "scanFolder"), Napi::Function::New(env, ScanFolder));
  exports.Set(Napi::String::New(env, "compareFolders"), Napi::Function::New(env, CompareFolders));
  exports.Set(Napi::String::New(env, "compareFiles"), Napi::Function::New(env, CompareFiles));
  
  return exports;
}

NODE_API_MODULE(dev_tools_native, Init)