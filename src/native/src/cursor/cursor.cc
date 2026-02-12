#include "cursor.h"
#include <X11/Xlib.h>
#include <stdexcept>
#include <chrono>
#include <thread>
#include <cstring>

// 纯C++实现，无任何N-API代码
CursorManager::CursorManager() 
    : display_(nullptr), root_window_(0), is_tracking_(false),
      track_interval_ms_(10) {
    track_callback_.func = nullptr;
    track_callback_.user_data = nullptr;
}

CursorManager::~CursorManager() {
    Cleanup();
}

void CursorManager::Init() {
    std::lock_guard<std::mutex> lock(mutex_);
    if (display_ != nullptr) return;

    // 麒麟系统默认DISPLAY=:0
    display_ = XOpenDisplay(nullptr);
    if (display_ == nullptr) {
        throw std::runtime_error("Failed to connect to X11 server (DISPLAY=:0)");
    }

    Display* dpy = static_cast<Display*>(display_);
    root_window_ = DefaultRootWindow(dpy);
}

CursorPosition CursorManager::GetCursorPosition() {
    CursorPosition result{-1, -1, ""};
    std::lock_guard<std::mutex> lock(mutex_);

    if (display_ == nullptr) {
        result.error = "X11 not initialized";
        return result;
    }

    Display* dpy = static_cast<Display*>(display_);
    Window root_return, child_return;
    int root_x, root_y;
    int win_x, win_y;
    unsigned int mask_return;

    bool success = XQueryPointer(
        dpy, 
        static_cast<Window>(root_window_), 
        &root_return, 
        &child_return,
        &root_x, &root_y, 
        &win_x, &win_y, 
        &mask_return
    );

    if (success) {
        result.x = root_x;
        result.y = root_y;
        result.error = "";
    } else {
        result.error = "Failed to query cursor position";
    }

    return result;
}

void CursorManager::StartTracking(int interval_ms, TrackCallback callback) {
    if (callback.func == nullptr) {
        throw std::invalid_argument("Callback function cannot be null");
    }

    StopTracking(); // 先停止已有监听

    track_interval_ms_ = interval_ms;
    track_callback_ = callback;
    is_tracking_ = true;

    // 启动监听线程（纯C++线程，无N-API依赖）
    track_thread_ = std::thread(&CursorManager::TrackThreadFunc, this);
    track_thread_.detach(); // 分离线程，避免阻塞退出
}

void CursorManager::StopTracking() {
    is_tracking_ = false;
    if (track_thread_.joinable()) {
        track_thread_.join();
    }
    track_callback_.func = nullptr;
    track_callback_.user_data = nullptr;
}

void CursorManager::Cleanup() {
    StopTracking();
    std::lock_guard<std::mutex> lock(mutex_);
    if (display_ != nullptr) {
        XCloseDisplay(static_cast<Display*>(display_));
        display_ = nullptr;
        root_window_ = 0;
    }
}

void CursorManager::TrackThreadFunc() {
    while (is_tracking_) {
        CursorPosition pos = GetCursorPosition();
        if (track_callback_.func) {
            track_callback_.func(pos, track_callback_.user_data);
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(track_interval_ms_));
    }
}