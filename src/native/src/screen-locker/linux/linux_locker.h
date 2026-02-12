#ifndef LINUX_LOCKER_H
#define LINUX_LOCKER_H

#include "../screen_locker.h"
#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <atomic>

class LinuxLocker {
public:
    std::string Lock(const ScreenLockerConfig& config);
    void Unlock();

private:
    Display* display_ = nullptr;
    Window lock_window_ = 0;
    GC gc_ = 0;
    Font font_ = 0;
    ScreenLockerConfig config_;
    std::atomic<bool> is_running_;

    void DrawMessage();
};

#endif // LINUX_LOCKER_H