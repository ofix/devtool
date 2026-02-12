#include "screen_locker.h"
#include <stdexcept>

// 平台检测宏
#ifdef _WIN32
#include "windows/win_locker.h"
#elif defined(__APPLE__)
#include "macos/mac_locker.h"
#elif defined(__linux__)
#include "linux/linux_locker.h"
#else
#error "Unsupported platform for ScreenLocker"
#endif

// 实现结构体（PIMPL）
struct ScreenLocker::Impl {
    // 平台特定的锁定器实例
#ifdef _WIN32
    WinLocker locker;
#elif defined(__APPLE__)
    MacLocker locker;
#elif defined(__linux__)
    LinuxLocker locker;
#endif
};

// 单例实现
ScreenLocker& ScreenLocker::GetInstance() {
    static ScreenLocker instance;
    return instance;
}

ScreenLocker::ScreenLocker() : pimpl_(new Impl()), is_locked_(false) {}

ScreenLocker::~ScreenLocker() {
    if (is_locked_) {
        UnlockScreen();
    }
    delete pimpl_;
}

std::string ScreenLocker::LockScreen(const ScreenLockerConfig& config) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (is_locked_) {
        return "Screen is already locked";
    }

    try {
        std::string error = pimpl_->locker.Lock(config);
        if (error.empty()) {
            is_locked_ = true;
        }
        return error;
    } catch (const std::exception& e) {
        return e.what();
    }
}

void ScreenLocker::UnlockScreen() {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!is_locked_) {
        return;
    }

    pimpl_->locker.Unlock();
    is_locked_ = false;
}

bool ScreenLocker::IsScreenLocked() const {
    return is_locked_;
}