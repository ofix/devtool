#ifndef MAC_LOCKER_H
#define MAC_LOCKER_H

#include "../screen_locker.h"
#include <Cocoa/Cocoa.h>

class MacLocker {
public:
    std::string Lock(const ScreenLockerConfig& config);
    void Unlock();

private:
    NSWindow* lock_window_ = nullptr;
    ScreenLockerConfig config_;
};

#endif // MAC_LOCKER_H