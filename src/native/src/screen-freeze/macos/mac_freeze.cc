#include "mac_freeze.h"
#include <string>
#include <objc/objc-runtime.h>

bool MacFreeze::FreezeScreen() {
    if (frozen_window_) {
        return "Window already exists";
    }

    // 初始化Cocoa
    [NSApplication sharedApplication];

    // 获取主屏幕
    NSScreen* main_screen = [NSScreen mainScreen];
    NSRect screen_frame = [main_screen frame];

    // 创建全屏窗口
    frozen_window_ = [[NSWindow alloc] initWithContentRect:screen_frame
                                                styleMask:NSWindowStyleMaskBorderless
                                                  backing:NSBackingStoreBuffered
                                                    defer:NO
                                                   screen:main_screen];

    [frozen_window_ setLevel:NSStatusWindowLevel + 1]; // 置顶
    [frozen_window_ setBackgroundColor:[NSColor colorWithRed:(255)/255.0
                                                     green:(255)/255.0
                                                      blue:(255)/255.0
                                                     alpha:1.0]];

    // 显示窗口
    [frozen_window_ makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];

    // 简化：屏蔽输入（完整实现需添加事件监听）
    return true;
}

void MacFreeze::UnFreezeScreen() {
    if (frozen_window_) {
        [frozen_window_ close];
        [frozen_window_ release];
        frozen_window_ = nullptr;
    }
}