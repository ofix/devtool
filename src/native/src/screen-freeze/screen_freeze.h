#ifndef SCREEN_LOCKER_H
#define SCREEN_LOCKER_H

#include <string>
#include <atomic>
#include <mutex>
#include <iostream>

// 跨平台屏幕锁定器（单例）
class ScreenFreeze {
public:
    // 获取单例实例
    static ScreenFreeze& GetInstance();

    // 冻结屏幕（同步）
    // 返回空字符串表示成功，否则返回错误信息
    bool FreezeScreen();

    // 解冻屏幕（同步）
    void UnFreezeScreen();

    // 检查是否已冻结
    bool IsScreenFrozen() const;

    // 禁用拷贝
    ScreenFreeze(const ScreenFreeze&) = delete;
    ScreenFreeze& operator=(const ScreenFreeze&) = delete;

private:
    ScreenFreeze();
    ~ScreenFreeze();

    // 平台相关实现指针（PIMPL模式，隐藏平台细节）
    struct Impl;
    Impl* pimpl_;

    // 状态控制
    std::atomic<bool> is_frozen_;
    std::mutex mutex_;
};

#endif // SCREEN_LOCKER_H