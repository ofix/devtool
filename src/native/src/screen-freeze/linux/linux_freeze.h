#ifndef LINUX_FREEZE_H
#define LINUX_FREEZE_H

// 修复：添加必要的系统头文件，确保 DRM 结构体定义
#include <X11/Xlib.h>
#include <X11/extensions/Xrandr.h>
#include <X11/keysym.h>
#include <thread>
#include <atomic>
#include <string>
#include <unistd.h>

// 封装 Linux 显存冻结逻辑的类
class LinuxFreeze {
public:
    // 构造函数/析构函数
    LinuxFreeze();
    ~LinuxFreeze();

    // 核心功能接口（修正：函数名统一为小写开头）
    bool FreezeScreen();       // 冻结屏幕（禁用显存刷新）
    bool UnFreezeScreen();     // 恢复屏幕刷新（修正：原拼写错误 UnFreezeScreen → UnfreezeScreen）

private:
    // 私有成员变量：保存显示状态
   Display* display_;               // X11 显示连接
    XRRScreenResources* screen_res_; // 屏幕资源
    XRROutputInfo* output_info_;     // 显示器输出信息
    RRCrtc original_crtc_;           // 原始 CRTC ID
    RRMode original_mode_;           // 原始显示模式
    RROutput original_output_;       // 原始输出设备
    int default_screen_;             // 默认屏幕编号


    // 私有辅助函数
    bool InitX11Resources();         // 初始化 X11 资源
    void ReleaseX11Resources();      // 释放 X11 资源
};

#endif // LINUX_FREEZE_H