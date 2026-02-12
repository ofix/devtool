#ifndef SCREEN_LOCKER_H
#define SCREEN_LOCKER_H

#include <string>
#include <atomic>
#include <mutex>

// 屏幕冻结配置
struct ScreenLockerConfig {
    std::string message;    // 冻结时显示的提示文字
    bool allowEsc = false;  // 是否允许ESC键解冻（调试用）
    int backgroundColor = 0x000000; // 背景色（RGB，默认黑色）
};

// 跨平台屏幕锁定器（单例）
class ScreenLocker {
public:
    // 获取单例实例
    static ScreenLocker& GetInstance();

    // 冻结屏幕（同步）
    // 返回空字符串表示成功，否则返回错误信息
    std::string LockScreen(const ScreenLockerConfig& config);

    // 解冻屏幕（同步）
    void UnlockScreen();

    // 检查是否已冻结
    bool IsScreenLocked() const;

    // 禁用拷贝
    ScreenLocker(const ScreenLocker&) = delete;
    ScreenLocker& operator=(const ScreenLocker&) = delete;

private:
    ScreenLocker();
    ~ScreenLocker();

    // 平台相关实现指针（PIMPL模式，隐藏平台细节）
    struct Impl;
    Impl* pimpl_;

    // 状态控制
    std::atomic<bool> is_locked_;
    std::mutex mutex_;
};

#endif // SCREEN_LOCKER_H