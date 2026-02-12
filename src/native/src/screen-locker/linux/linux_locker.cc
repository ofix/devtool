#include "linux_locker.h"
#include <string>
#include <cstring>
#include <thread>
#include <chrono>

std::string LinuxLocker::Lock(const ScreenLockerConfig& config) {
    if (display_) {
        return "Display already opened";
    }

    config_ = config;
    is_running_ = true;

    // 打开X11显示（麒麟系统默认DISPLAY=:0）
    display_ = XOpenDisplay(nullptr);
    if (!display_) {
        return "Failed to open X11 display (DISPLAY=:0)";
    }

    int screen_num = DefaultScreen(display_);
    int screen_width = DisplayWidth(display_, screen_num);
    int screen_height = DisplayHeight(display_, screen_num);

    // 创建全屏窗口
    lock_window_ = XCreateSimpleWindow(
        display_,
        RootWindow(display_, screen_num),
        0, 0, screen_width, screen_height,
        0,
        BlackPixel(display_, screen_num),
        config_.backgroundColor // 背景色
    );

    // 设置窗口属性（置顶、全屏、屏蔽输入）
    XSetWindowAttributes attrs;
    attrs.override_redirect = True; // 绕过窗口管理器
    XChangeWindowAttributes(display_, lock_window_, CWOverrideRedirect, &attrs);

    // 选择输入事件（屏蔽所有操作）
    XSelectInput(display_, lock_window_, NoEventMask);

    // 创建绘图上下文
    gc_ = XCreateGC(display_, lock_window_, 0, nullptr);
    XSetForeground(display_, gc_, WhitePixel(display_, screen_num)); // 文字白色

    // 加载字体
    font_ = XLoadFont(display_, "-*-dejavu sans-bold-r-normal-*-48-*-*-*-*-*-iso8859-1");
    XSetFont(display_, gc_, font_);

    // 显示窗口
    XMapRaised(display_, lock_window_);
    XFlush(display_);

    // 后台线程检测ESC键（调试）
    if (config_.allowEsc) {
        std::thread([this]() {
            while (is_running_) {
                if (XCheckMaskEvent(display_, KeyPressMask, nullptr)) {
                    // 简化处理：任意按键解锁
                    this->Unlock();
                    break;
                }
                std::this_thread::sleep_for(std::chrono::milliseconds(100));
            }
        }).detach();
    }

    DrawMessage();
    return "";
}

void LinuxLocker::Unlock() {
    is_running_ = false;

    if (display_) {
        if (lock_window_) {
            XDestroyWindow(display_, lock_window_);
            lock_window_ = 0;
        }

        if (gc_) {
            XFreeGC(display_, gc_);
            gc_ = 0;
        }

        if (font_) {
            XUnloadFont(display_, font_);
            font_ = 0;
        }

        XCloseDisplay(display_);
        display_ = nullptr;
    }
}

void LinuxLocker::DrawMessage() {
    if (!display_ || !lock_window_ || config_.message.empty()) {
        return;
    }

    int screen_num = DefaultScreen(display_);
    int screen_width = DisplayWidth(display_, screen_num);
    int screen_height = DisplayHeight(display_, screen_num);

    // 计算文字位置（居中）
    XTextProperty text_prop;
    XStringListToTextProperty(const_cast<char**>(&config_.message.c_str()), 1, &text_prop);
    int text_width = XTextWidth(XQueryFont(display_, font_), config_.message.c_str(), config_.message.length());
    int text_height = 48;

    int x = (screen_width - text_width) / 2;
    int y = (screen_height + text_height) / 2;

    // 绘制文字
    XDrawString(display_, lock_window_, gc_, x, y, config_.message.c_str(), config_.message.length());
    XFlush(display_);
}