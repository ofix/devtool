#ifndef LINUX_LOCKER_H
#define LINUX_LOCKER_H

#include "../screen_locker.h"
#include <atomic>
#include <string>
#include <mutex>
#include <fcntl.h>
#include <unistd.h>
#include <sys/ioctl.h>
#include <drm/drm.h>
#include <drm/drm_mode.h>

class LinuxLocker {
public:
    std::string Lock(const ScreenLockerConfig& config);
    void Unlock();

private:
    // DRM相关成员变量
    int drm_fd_ = -1;          // DRM设备文件描述符
    uint32_t crtc_id_ = 0;     // CRTC（显示控制器）ID
    drm_mode_crtc crtc_orig_;  // 保存原始CRTC配置
    std::atomic<bool> is_locked_;  // 锁定状态
    ScreenLockerConfig config_;
    std::mutex locker_mutex_;  // 互斥锁保护资源

    // 辅助函数
    bool InitDRM();
    bool LockCRTC();
    void RestoreCRTC();
    void MonitorInput();      // 输入监控（ESC解锁）
};

#endif // LINUX_LOCKER_H