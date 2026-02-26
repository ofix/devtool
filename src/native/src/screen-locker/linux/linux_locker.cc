#include "linux_locker.h"
#include <string>
#include <cstring>
#include <thread>
#include <chrono>
#include <stdexcept>
#include <sys/mman.h>
#include <poll.h>
#include <cerrno>
#include <cstdio>

std::string LinuxLocker::Lock(const ScreenLockerConfig& config) {
    std::lock_guard<std::mutex> lock(locker_mutex_);
    
    if (is_locked_) {
        return "Screen is already locked";
    }

    config_ = config;
    is_locked_ = false;

    // 初始化DRM设备
    if (!InitDRM()) {
        return "Failed to initialize DRM device";
    }

    // 锁定CRTC（显卡输出控制器）
    if (!LockCRTC()) {
        Unlock();
        return "Failed to lock CRTC (display controller)";
    }

    is_locked_ = true;

    // 后台线程监控ESC键（调试用）
    if (config_.allowEsc) {
        std::thread(&LinuxLocker::MonitorInput, this).detach();
    }

    return "";
}

void LinuxLocker::Unlock() {
    std::lock_guard<std::mutex> lock(locker_mutex_);
    
    if (!is_locked_) {
        return;
    }

    // 恢复原始CRTC配置
    RestoreCRTC();

    // 关闭DRM设备
    if (drm_fd_ >= 0) {
        close(drm_fd_);
        drm_fd_ = -1;
    }

    crtc_id_ = 0;
    is_locked_ = false;
}

bool LinuxLocker::InitDRM() {
    // 打开DRM设备（优先card0，适配大多数系统）
    drm_fd_ = open("/dev/dri/card0", O_RDWR | O_CLOEXEC);
    if (drm_fd_ < 0) {
        fprintf(stderr, "Failed to open DRM device: %s\n", strerror(errno));
        return false;
    }

    // DRM认证（确保有权限操作）
    // drm_auth auth{};
    // if (ioctl(drm_fd_, DRM_IOCTL_AUTH_MAGIC, &auth) < 0) {
    //     fprintf(stderr, "DRM auth failed: %s\n", strerror(errno));
    //     close(drm_fd_);
    //     drm_fd_ = -1;
    //     return false;
    // }

    // 获取CRTC列表（适配64位整型的crtc_id_ptr）    
    // ========== 终极修复：硬编码CRTC ID（替换为你系统的真实值） ==========
    crtc_id_ = 1;  // 替换为modetest/drm_info查到的CRTC ID（如1/2/3）
    fprintf(stderr, "Use hardcoded CRTC ID: %u\n", crtc_id_);

    // 验证CRTC ID是否有效（可选）
    drm_mode_crtc crtc{};
    crtc.crtc_id = crtc_id_;
    if (ioctl(drm_fd_, DRM_IOCTL_MODE_GETCRTC, &crtc) < 0) {
        fprintf(stderr, "Warning: CRTC ID %u is invalid: %s\n", crtc_id_, strerror(errno));
        // 尝试备选CRTC ID（如0/2）
        crtc_id_ = 0;
        if (ioctl(drm_fd_, DRM_IOCTL_MODE_GETCRTC, &crtc) < 0) {
            close(drm_fd_);
            drm_fd_ = -1;
            return false;
        }
    }

    return crtc_id_ != 0;
}

bool LinuxLocker::LockCRTC() {
    if (drm_fd_ < 0 || crtc_id_ == 0) {
        return false;
    }

    // 保存原始CRTC配置
    drm_mode_crtc crtc{};
    crtc.crtc_id = crtc_id_;
    if (ioctl(drm_fd_, DRM_IOCTL_MODE_GETCRTC, &crtc) < 0) {
        fprintf(stderr, "Failed to get CRTC config: %s\n", strerror(errno));
        return false;
    }
    crtc_orig_ = crtc;

    // 锁定CRTC：设置为空配置（停止输出）
    drm_mode_crtc crtc_lock{};
    crtc_lock.crtc_id = crtc_id_;
    crtc_lock.set_connectors_ptr = 0;
    crtc_lock.count_connectors = 0;
    crtc_lock.mode_valid = 0;

    // 应用锁定配置（停止显卡输出）
    if (ioctl(drm_fd_, DRM_IOCTL_MODE_SETCRTC, &crtc_lock) < 0) {
        fprintf(stderr, "Failed to lock CRTC: %s\n", strerror(errno));
        return false;
    }

    return true;
}

void LinuxLocker::RestoreCRTC() {
    if (drm_fd_ < 0 || crtc_id_ == 0) {
        return;
    }

    // 恢复原始CRTC配置
    if (ioctl(drm_fd_, DRM_IOCTL_MODE_SETCRTC, &crtc_orig_) < 0) {
        fprintf(stderr, "Failed to restore CRTC: %s\n", strerror(errno));
        // 恢复失败时的降级处理：重新获取默认配置
        drm_mode_crtc crtc_reset{};
        crtc_reset.crtc_id = crtc_id_;
        if (ioctl(drm_fd_, DRM_IOCTL_MODE_GETCRTC, &crtc_reset) == 0) {
            ioctl(drm_fd_, DRM_IOCTL_MODE_SETCRTC, &crtc_reset);
        }
    }
}

void LinuxLocker::MonitorInput() {
    // 创建pollfd监控标准输入
    struct pollfd pfd{};
    pfd.fd = STDIN_FILENO;
    pfd.events = POLLIN;

    while (is_locked_) {
        int ret = poll(&pfd, 1, 100); // 100ms超时
        if (ret > 0 && (pfd.revents & POLLIN)) {
            char buf[16];
            ssize_t n = read(STDIN_FILENO, buf, sizeof(buf));
            if (n > 0) {
                // 检测到ESC键（ASCII码27）则解锁
                for (ssize_t i = 0; i < n; ++i) {
                    if (buf[i] == 27) {
                        Unlock();
                        return;
                    }
                }
            }
        } else if (ret < 0) {
            break;
        }

        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
}