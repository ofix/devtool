#ifndef WIN_LOCKER_H
#define WIN_LOCKER_H

#include "../screen_locker.h"
#include <windows.h>

class WinLocker {
public:
    std::string Lock(const ScreenLockerConfig& config);
    void Unlock();

private:
    HWND lock_window_ = nullptr;
    HFONT message_font_ = nullptr;
    ScreenLockerConfig config_;

    // 窗口过程回调
    static LRESULT CALLBACK LockWindowProc(HWND hwnd, UINT msg, WPARAM wparam, LPARAM lparam);
    void DrawMessage(HWND hwnd);
};

#endif // WIN_LOCKER_H