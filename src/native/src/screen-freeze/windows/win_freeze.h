#ifndef WIN_LOCKER_H
#define WIN_LOCKER_H

#include "../screen_freeze.h"
#include <windows.h>

class WinFreeze {
public:
    bool FreezeScreen();
    void UnFreezeScreen();

private:
    HWND frozen_window_ = nullptr;
    HFONT message_font_ = nullptr;

    // 窗口过程回调
    static LRESULT CALLBACK FreezeWindowProc(HWND hwnd, UINT msg, WPARAM wparam, LPARAM lparam);
    void DrawMessage(HWND hwnd);
};

#endif // WIN_LOCKER_H