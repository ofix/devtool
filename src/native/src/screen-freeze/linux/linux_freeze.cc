#include "linux_freeze.h"
#include <stdexcept>
#include <chrono>

// 构造函数：初始化成员变量
LinuxFreeze::LinuxFreeze() 
    : display_(nullptr),
      screen_res_(nullptr),
      output_info_(nullptr),
      original_crtc_(0),
      original_mode_(0),
      original_output_(0),
      default_screen_(0) {}

// 析构函数：确保资源释放
LinuxFreeze::~LinuxFreeze() {
    ReleaseX11Resources();
}

// 初始化 X11 资源（私有辅助函数）
bool LinuxFreeze::InitX11Resources() {
    // 1. 连接 X11 显示服务器
    display_ = XOpenDisplay(nullptr);
    if (!display_) {
        return false;
    }

    // 2. 获取默认屏幕
    default_screen_ = DefaultScreen(display_);
    Window root_window = RootWindow(display_, default_screen_);

    // 3. 获取屏幕资源
    screen_res_ = XRRGetScreenResourcesCurrent(display_, root_window);
    if (!screen_res_) {
        XCloseDisplay(display_);
        display_ = nullptr;
        return false;
    }

    // 4. 找到已连接的主显示器并保存原始状态
    output_info_ = nullptr;
    for (int i = 0; i < screen_res_->noutput; i++) {
        original_output_ = screen_res_->outputs[i];
        output_info_ = XRRGetOutputInfo(display_, screen_res_, original_output_);
        
        if (output_info_->connection == RR_Connected) {
            // 保存原始 CRTC 和模式
            original_crtc_ = output_info_->crtcs[0];
            original_mode_ = output_info_->modes[0];
            break;
        }
        
        XRRFreeOutputInfo(output_info_);
        output_info_ = nullptr;
    }

    if (!output_info_) {
        ReleaseX11Resources();
        return false;
    }

    return true;
}

// 释放 X11 资源（私有辅助函数）
void LinuxFreeze::ReleaseX11Resources() {
     if (output_info_) {
        XRRFreeOutputInfo(output_info_);
        output_info_ = nullptr;
    }
    if (screen_res_) {
        XRRFreeScreenResources(screen_res_);
        screen_res_ = nullptr;
    }
    if (display_) {
        XCloseDisplay(display_);
        display_ = nullptr;
    }
}

// 冻结屏幕（核心接口）
bool LinuxFreeze::FreezeScreen() {

    // 1. 初始化 X11 资源
    if (!InitX11Resources()) {
        return false;
    }

    // 2. 关闭屏幕保护（基础接口，所有版本都支持）
    XSetScreenSaver(display_, 0, 0, PreferBlanking, DefaultExposures);

    // 3. 核心：禁用 CRTC 刷新（冻结屏幕）
    // 完整传参，仅使用基础 Xrandr 常量
    XRRSetCrtcConfig(
        display_,               // Display* dpy
        screen_res_,            // XRRScreenResources* resources
        original_crtc_,         // RRCrtc crtc
        CurrentTime,            // Time timestamp
        0, 0,                   // int x, y
        None,                   // RRMode mode（禁用模式）
        0,                      // Rotation rotation（0 = RR_Rotate_0）
        &original_output_,      // RROutput* outputs
        1                       // int noutputs
    );

    return true;
}

// 恢复屏幕刷新（核心接口）
bool LinuxFreeze::UnFreezeScreen() {
    if ( !display_ || !screen_res_ || !output_info_) {
        return false;
    }

    // 1. 恢复原始 CRTC 配置
    XRRSetCrtcConfig(
        display_,               // Display* dpy
        screen_res_,            // XRRScreenResources* resources
        original_crtc_,         // RRCrtc crtc
        CurrentTime,            // Time timestamp
        0, 0,                   // int x, y
        original_mode_,         // RRMode mode（恢复原始模式）
        0,                      // Rotation rotation
        &original_output_,      // RROutput* outputs
        1                       // int noutputs
    );

    // 2. 恢复屏幕保护
    XSetScreenSaver(display_, 600, 0, PreferBlanking, DefaultExposures);

    // 3. 释放资源
    ReleaseX11Resources();

    return true;
}