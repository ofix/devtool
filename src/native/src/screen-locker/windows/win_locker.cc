#include "win_locker.h"
#include <string>
#include <sstream>

std::string WinLocker::Lock(const ScreenLockerConfig& config) {
    if (lock_window_) {
        return "Window already exists";
    }

    config_ = config;

    // 获取屏幕分辨率
    int screen_width = GetSystemMetrics(SM_CXSCREEN);
    int screen_height = GetSystemMetrics(SM_CYSCREEN);

    // 创建全屏窗口
    lock_window_ = CreateWindowEx(
        WS_EX_TOPMOST | WS_EX_NOACTIVATE,  // 置顶、不激活
        L"STATIC",
        L"ScreenLocker",
        WS_POPUP | WS_VISIBLE,
        0, 0, screen_width, screen_height,
        nullptr, nullptr, GetModuleHandle(nullptr), nullptr
    );

    if (!lock_window_) {
        std::ostringstream oss;
        oss << "CreateWindow failed: " << GetLastError();
        return oss.str();
    }

    // 设置窗口过程
    SetWindowLongPtr(lock_window_, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(this));
    SetWindowLongPtr(lock_window_, GWLP_WNDPROC, reinterpret_cast<LONG_PTR>(LockWindowProc));

    // 设置背景色
    SetClassLongPtr(lock_window_, GCLP_HBRBACKGROUND, reinterpret_cast<LONG_PTR>(
        CreateSolidBrush(RGB(
            (config_.backgroundColor >> 16) & 0xFF,
            (config_.backgroundColor >> 8) & 0xFF,
            config_.backgroundColor & 0xFF
        ))
    ));

    // 创建字体
    message_font_ = CreateFont(
        48, 0, 0, 0, FW_BOLD,
        FALSE, FALSE, FALSE, DEFAULT_CHARSET,
        OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
        DEFAULT_QUALITY, DEFAULT_PITCH | FF_SWISS,
        L"Microsoft YaHei"
    );

    // 捕获所有输入
    SetCapture(lock_window_);
    ShowWindow(lock_window_, SW_SHOWMAXIMIZED);
    UpdateWindow(lock_window_);

    return "";
}

void WinLocker::Unlock() {
    if (lock_window_) {
        ReleaseCapture();
        DestroyWindow(lock_window_);
        lock_window_ = nullptr;
    }

    if (message_font_) {
        DeleteObject(message_font_);
        message_font_ = nullptr;
    }
}

LRESULT CALLBACK WinLocker::LockWindowProc(HWND hwnd, UINT msg, WPARAM wparam, LPARAM lparam) {
    WinLocker* locker = reinterpret_cast<WinLocker*>(GetWindowLongPtr(hwnd, GWLP_USERDATA));
    if (!locker) {
        return DefWindowProc(hwnd, msg, wparam, lparam);
    }

    switch (msg) {
        case WM_PAINT:
            locker->DrawMessage(hwnd);
            return 0;

        case WM_KEYDOWN:
            // ESC键解锁（调试）
            if (locker->config_.allowEsc && wparam == VK_ESCAPE) {
                locker->Unlock();
            }
            return 0;

        case WM_LBUTTONDOWN:
        case WM_RBUTTONDOWN:
        case WM_MBUTTONDOWN:
        case WM_MOUSEMOVE:
            // 屏蔽鼠标操作
            return 0;

        case WM_DESTROY:
            locker->lock_window_ = nullptr;
            return 0;

        default:
            return DefWindowProc(hwnd, msg, wparam, lparam);
    }
}

void WinLocker::DrawMessage(HWND hwnd) {
    PAINTSTRUCT ps;
    HDC hdc = BeginPaint(hwnd, &ps);

    // 设置字体和文本颜色
    SelectObject(hdc, message_font_);
    SetTextColor(hdc, RGB(255, 255, 255));
    SetBkMode(hdc, TRANSPARENT);

    // 绘制提示文字（居中）
    RECT rect;
    GetClientRect(hwnd, &rect);
    DrawText(
        hdc,
        std::wstring(config_.message.begin(), config_.message.end()).c_str(),
        -1,
        &rect,
        DT_CENTER | DT_VCENTER | DT_SINGLELINE
    );

    EndPaint(hwnd, &ps);
}