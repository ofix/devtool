#include "mac_locker.h"
#include <string>
#include <objc/objc-runtime.h>

std::string MacLocker::Lock(const ScreenLockerConfig& config) {
    if (lock_window_) {
        return "Window already exists";
    }

    config_ = config;

    // 初始化Cocoa
    [NSApplication sharedApplication];

    // 获取主屏幕
    NSScreen* main_screen = [NSScreen mainScreen];
    NSRect screen_frame = [main_screen frame];

    // 创建全屏窗口
    lock_window_ = [[NSWindow alloc] initWithContentRect:screen_frame
                                                styleMask:NSWindowStyleMaskBorderless
                                                  backing:NSBackingStoreBuffered
                                                    defer:NO
                                                   screen:main_screen];

    [lock_window_ setLevel:NSStatusWindowLevel + 1]; // 置顶
    [lock_window_ setBackgroundColor:[NSColor colorWithRed:((config_.backgroundColor >> 16) & 0xFF)/255.0
                                                     green:((config_.backgroundColor >> 8) & 0xFF)/255.0
                                                      blue:(config_.backgroundColor & 0xFF)/255.0
                                                     alpha:1.0]];

    // 显示窗口
    [lock_window_ makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];

    // 简化：屏蔽输入（完整实现需添加事件监听）
    return "";
}

void MacLocker::Unlock() {
    if (lock_window_) {
        [lock_window_ close];
        [lock_window_ release];
        lock_window_ = nullptr;
    }
}