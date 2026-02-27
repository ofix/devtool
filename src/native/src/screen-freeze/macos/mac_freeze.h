#ifndef MAC_FREEZE_H
#define MAC_FREEZE_H

#include "../screen_freeze.h"
#include <Cocoa/Cocoa.h>

class MacFreeze {
public:
    bool FreezeScreen();
    void UnFreezeScreen();

private:
    NSWindow* frozen_window_ = nullptr;
};

#endif // MAC_FREEZE_H