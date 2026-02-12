#ifndef CURSOR_H
#define CURSOR_H

#include <string>
#include <mutex>
#include <atomic>
#include <thread>

// 鼠标坐标结构体（纯C++类型，无N-API依赖）
struct CursorPosition {
    int x;
    int y;
    std::string error;  // 错误信息（空字符串表示成功）
};

// 纯C++鼠标坐标管理器（线程安全，适配麒麟系统X11）
class CursorManager {
public:
    // 单例模式（和你现有FileCompare单例保持一致）
    static CursorManager& GetInstance() {
        static CursorManager instance;
        return instance;
    }

    // 初始化X11连接（麒麟系统）
    void Init();

    // 同步获取鼠标坐标（纯C++接口）
    CursorPosition GetCursorPosition();

    // 异步监听鼠标坐标的回调结构体（替代函数指针，支持上下文）
    struct TrackCallback {
        void (*func)(const CursorPosition& pos, void* user_data);
        void* user_data;
    };

    // 启动异步监听（纯C++接口，不依赖N-API）
    void StartTracking(int interval_ms, TrackCallback callback);

    // 停止异步监听
    void StopTracking();

    // 释放X11资源
    void Cleanup();

    // 禁用拷贝构造和赋值（单例）
    CursorManager(const CursorManager&) = delete;
    CursorManager& operator=(const CursorManager&) = delete;

private:
    CursorManager();  // 私有构造
    ~CursorManager(); // 私有析构

    // X11相关成员
    void* display_;    // 隐藏X11类型，避免头文件依赖X11/Xlib.h
    unsigned long root_window_;
    std::mutex mutex_; // 线程安全锁

    // 异步监听相关
    std::atomic<bool> is_tracking_;
    std::atomic<int> track_interval_ms_;
    TrackCallback track_callback_;
    std::thread track_thread_;

    // 异步监听线程函数
    void TrackThreadFunc();
};

#endif // CURSOR_H