#include "screen_freeze.h"
#include <stdexcept>

// 平台检测宏
#ifdef _WIN32
#include "windows/win_freeze.h"
#elif defined(__APPLE__)
#include "macos/mac_freeze.h"
#elif defined(__linux__)
#include "linux/linux_freeze.h"
#else
#error "Unsupported platform for ScreenFreeze"
#endif

// 实现结构体（PIMPL）
struct ScreenFreeze::Impl {
    // 平台特定的锁定器实例
#ifdef _WIN32
    WinFreeze freeze;
#elif defined(__APPLE__)
    MacFreeze freeze;
#elif defined(__linux__)
    LinuxFreeze freeze;
#endif
};

// 单例实现
ScreenFreeze& ScreenFreeze::GetInstance() {
    static ScreenFreeze instance;
    return instance;
}

ScreenFreeze::ScreenFreeze() : pimpl_(new Impl()), is_frozen_(false) {}

ScreenFreeze::~ScreenFreeze() {
    if (is_frozen_) {
        UnFreezeScreen();
    }
    delete pimpl_;
}

bool ScreenFreeze::FreezeScreen() {
    std::lock_guard<std::mutex> lock(mutex_);
    if (is_frozen_) {
        return "Screen is already locked";
    }

    try {
        bool result = pimpl_->freeze.FreezeScreen();
        if (result) {
            is_frozen_ = true;
        }
        return result;
    } catch (const std::exception& e) {
        std::cout<< e.what();
        return false;
    }
}

void ScreenFreeze::UnFreezeScreen() {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!is_frozen_) {
        return;
    }

    pimpl_->freeze.UnFreezeScreen();
    is_frozen_ = false;
}

bool ScreenFreeze::IsScreenFrozen() const {
    return is_frozen_;
}