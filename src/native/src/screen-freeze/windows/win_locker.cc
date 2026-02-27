#include "win_freeze.h"
#include <string>
#include <sstream>

bool WinFreeze::FreezeScreen( {
    if (frozen_window_) {
        return true;
    }


    // 获取屏幕分辨率
    int screen_width = GetSystemMetrics(SM_CXSCREEN);
    int screen_height = GetSystemMetrics(SM_CYSCREEN);

    // 创建全屏窗口
    frozen_window_ = CreateWindowEx(
        WS_EX_TOPMOST | WS_EX_NOACTIVATE,  // 置顶、不激活
        L"STATIC",
        L"ScreenFreeze",
        WS_POPUP | WS_VISIBLE,
        0, 0, screen_width, screen_height,
        nullptr, nullptr, GetModuleHandle(nullptr), nullptr
    );

    if (!frozen_window_) {
        std::ostringstream oss;
        oss << "CreateWindow failed: " << GetLastError();
        return false;
    }

    // 设置窗口过程
    SetWindowLongPtr(frozen_window_, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(this));
    SetWindowLongPtr(frozen_window_, GWLP_WNDPROC, reinterpret_cast<LONG_PTR>(FreezeWindowProc));

    // 设置背景色
    SetClassLongPtr(frozen_window_, GCLP_HBRBACKGROUND, reinterpret_cast<LONG_PTR>(
        CreateSolidBrush(RGB(
            (255) & 0xFF,
            (255) & 0xFF,
            255 & 0xFF
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
    SetCapture(frozen_window_);
    ShowWindow(frozen_window_, SW_SHOWMAXIMIZED);
    UpdateWindow(frozen_window_);

    return true;
}

void WinFreeze::UnFreezeScreen() {
    if (frozen_window_) {
        ReleaseCapture();
        DestroyWindow(frozen_window_);
        frozen_window_ = nullptr;
    }

    if (message_font_) {
        DeleteObject(message_font_);
        message_font_ = nullptr;
    }
}

LRESULT CALLBACK WinFreeze::FreezeWindowProc(HWND hwnd, UINT msg, WPARAM wparam, LPARAM lparam) {
    WinFreeze* freeze = reinterpret_cast<WinFreeze*>(GetWindowLongPtr(hwnd, GWLP_USERDATA));
    if (!freeze) {
        return DefWindowProc(hwnd, msg, wparam, lparam);
    }

    switch (msg) {
        case WM_PAINT:
            freeze->DrawMessage(hwnd);
            return 0;

        case WM_KEYDOWN:
            // ESC键解锁（调试）
            if (wparam == VK_ESCAPE) {
                freeze->UnFreeze();
            }
            return 0;

        case WM_LBUTTONDOWN:
        case WM_RBUTTONDOWN:
        case WM_MBUTTONDOWN:
        case WM_MOUSEMOVE:
            // 屏蔽鼠标操作
            return 0;

        case WM_DESTROY:
            freeze->frozen_window_ = nullptr;
            return 0;

        default:
            return DefWindowProc(hwnd, msg, wparam, lparam);
    }
}

void WinFreeze::DrawMessage(HWND hwnd) {
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
        std::wstring("xxx").c_str(),
        -1,
        &rect,
        DT_CENTER | DT_VCENTER | DT_SINGLELINE
    );

    EndPaint(hwnd, &ps);
}