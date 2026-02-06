#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <X11/Xatom.h>
#include <vector>
#include <string>
#include <cstring>
#include <algorithm>
#include <cstdio>
#include <unistd.h>
#include <cstdint>
#include <csignal>
#include <climits>
#include "../window_info.h"

// 安全释放X11资源的宏
#define SAFE_XFREE(ptr)    \
    do                     \
    {                      \
        if (ptr)           \
        {                  \
            XFree(ptr);    \
            ptr = nullptr; \
        }                  \
    } while (0)

// 定义面板位置和尺寸结构体
struct PanelGeometry {
    int top = 0;        // 顶部面板高度
    int bottom = 0;     // 底部面板高度
    int left = 0;       // 左侧面板宽度
    int right = 0;      // 右侧面板宽度
    int screen_width = 0;  // 物理屏幕宽度
    int screen_height = 0; // 物理屏幕高度
    int work_x = 0;     // 工作区X坐标
    int work_y = 0;     // 工作区Y坐标
    int work_width = 0; // 工作区宽度
    int work_height = 0;// 工作区高度
};

// 扩展WindowInfo：新增窗口类型枚举（需要同步修改../common/window_info.h）
// 如果无法修改window_info.h，可以用processName或title标识
enum class WindowType {
    APPLICATION,  // 普通应用窗口
    PANEL,        // 系统面板（顶栏/底栏）
    DOCK,         // Dock侧边栏/底部dock
    DESKTOP       // 桌面窗口
};

// 段错误信号处理函数（全局）
static void SigSegvHandler(int sig)
{
    fprintf(stderr, "\n⚠️  捕获段错误信号(%d)，程序安全退出\n", sig);
    exit(1);
}

// 窗口枚举核心类（包含Dock/面板窗口）
class LinuxWindowEnumerator : public WindowEnumerator
{
private:
    Display *display = nullptr;
    bool isUKUI = false;
    PanelGeometry panelGeom; // 存储面板几何信息

    // X11错误处理器（仅保留一个定义）
    static int X11ErrorHandler(Display *dpy, XErrorEvent *evt)
    {
        (void)dpy;
        (void)evt; // 避免未使用变量警告
        return 0;
    }

    // 验证窗口句柄有效性
    bool IsWindowValid(Window window)
    {
        if (!display || window == None)
            return false;
        XWindowAttributes attrs;
        if (XGetWindowAttributes(display, window, &attrs))
        {
            return true;
        }
        XSync(display, False);
        return false;
    }

    // 检测UKUI桌面环境
    bool DetectKylinUKUI()
    {
        const char *desktopEnv = getenv("XDG_CURRENT_DESKTOP");
        if (!desktopEnv)
            return false;
        return (strstr(desktopEnv, "UKUI") != nullptr || strstr(desktopEnv, "Kylin") != nullptr);
    }

    // 获取窗口标题
    std::string GetWindowTitle(Window window)
    {
        if (!display || window == None)
            return "";

        std::string title;
        XTextProperty text_prop = {nullptr, 0, 0, 0};
        if (XGetWMName(display, window, &text_prop))
        {
            if (text_prop.value && text_prop.nitems > 0)
            {
                char **list = nullptr;
                int count = 0;
                if (Xutf8TextPropertyToTextList(display, &text_prop, &list, &count) == Success && count > 0 && list[0])
                {
                    title = std::string(list[0]);
                    SAFE_XFREE(list);
                }
            }
            SAFE_XFREE(text_prop.value);
        }

        // 获取_NET_WM_NAME属性
        if (title.empty())
        {
            Atom utf8_string = XInternAtom(display, "UTF8_STRING", False);
            Atom net_wm_name = XInternAtom(display, "_NET_WM_NAME", False);
            if (utf8_string != None && net_wm_name != None)
            {
                Atom actual_type;
                int actual_format;
                unsigned long nitems = 0, bytes_after = 0;
                unsigned char *prop_value = nullptr;
                int result = XGetWindowProperty(
                    display, window, net_wm_name, 0, 2048, False,
                    utf8_string, &actual_type, &actual_format,
                    &nitems, &bytes_after, &prop_value);
                if (result == Success && actual_type == utf8_string && nitems > 0 && prop_value)
                {
                    title = std::string(reinterpret_cast<char *>(prop_value), nitems);
                }
                SAFE_XFREE(prop_value);
            }
        }
        return title;
    }

    // 获取窗口类名（进程名）
    std::string GetWindowClass(Window window)
    {
        if (!display || window == None)
            return "";

        XClassHint classHint = {nullptr, nullptr};
        std::string result;
        if (XGetClassHint(display, window, &classHint))
        {
            if (classHint.res_name)
            {
                result = classHint.res_name;
            }
            // 释放资源，避免内存泄漏
            if (classHint.res_name)
                XFree(classHint.res_name);
            if (classHint.res_class)
                XFree(classHint.res_class);
            classHint.res_name = nullptr;
            classHint.res_class = nullptr;
        }
        return result;
    }

    // 判断窗口是否可见
    bool IsWindowVisible(Window window)
    {
        if (!display || window == None)
            return false;

        XWindowAttributes attrs;
        if (!XGetWindowAttributes(display, window, &attrs))
            return false;
        // 可见条件：映射状态为Viewable + 宽高大于0
        return (attrs.map_state == IsViewable) && (attrs.width > 0) && (attrs.height > 0);
    }

    // 识别窗口类型（应用/面板/Dock/桌面）
    WindowType GetWindowType(const std::string &className, const std::string &title)
    {
        // 识别Dock窗口
        if (className.find("Dock") != std::string::npos || 
            className.find("dock") != std::string::npos ||
            title.find("Dock") != std::string::npos) {
            return WindowType::DOCK;
        }

        // 识别面板窗口
        if (className.find("Panel") != std::string::npos || 
            className.find("panel") != std::string::npos ||
            className.find("ukui-panel") != std::string::npos ||
            className.find("kylin-panel") != std::string::npos) {
            return WindowType::PANEL;
        }

        // 识别桌面窗口
        if (className.find("Desktop") != std::string::npos || 
            className.find("desktop") != std::string::npos ||
            className.find("Xfdesktop") != std::string::npos ||
            className.find("Nautilus") != std::string::npos ||
            className.find("dde-desktop") != std::string::npos) {
            return WindowType::DESKTOP;
        }

        // 默认是应用窗口
        return WindowType::APPLICATION;
    }

    // 关键：获取系统面板（Dock/侧边栏）的几何信息
    void GetPanelGeometry()
    {
        if (!display) return;

        // 1. 获取物理屏幕尺寸
        Window root = DefaultRootWindow(display);
        int scr_num = DefaultScreen(display);
        panelGeom.screen_width = DisplayWidth(display, scr_num);
        panelGeom.screen_height = DisplayHeight(display, scr_num);

        // 2. 获取_NET_WORKAREA属性（工作区范围）
        Atom net_workarea = XInternAtom(display, "_NET_WORKAREA", False);
        if (net_workarea != None)
        {
            Atom actual_type;
            int actual_format;
            unsigned long nitems = 0, bytes_after = 0;
            unsigned char *prop = nullptr;
            
            int result = XGetWindowProperty(
                display, root, net_workarea, 0, 4, False,
                XA_CARDINAL, &actual_type, &actual_format,
                &nitems, &bytes_after, &prop);
            
            if (result == Success && prop && nitems >= 4)
            {
                // _NET_WORKAREA格式：x, y, width, height（32位整数）
                int *workarea = reinterpret_cast<int*>(prop);
                panelGeom.work_x = workarea[0];
                panelGeom.work_y = workarea[1];
                panelGeom.work_width = workarea[2];
                panelGeom.work_height = workarea[3];
                SAFE_XFREE(prop);
            }
        }

        // 3. 兜底：如果获取不到_NET_WORKAREA，默认工作区等于物理屏幕
        if (panelGeom.work_width == 0 || panelGeom.work_height == 0)
        {
            panelGeom.work_x = 0;
            panelGeom.work_y = 0;
            panelGeom.work_width = panelGeom.screen_width;
            panelGeom.work_height = panelGeom.screen_height;
        }

        // 4. 计算面板尺寸（物理屏幕 - 工作区 = 面板占用）
        panelGeom.top = panelGeom.work_y;
        panelGeom.bottom = panelGeom.screen_height - (panelGeom.work_y + panelGeom.work_height);
        panelGeom.left = panelGeom.work_x;
        panelGeom.right = panelGeom.screen_width - (panelGeom.work_x + panelGeom.work_width);

        // 调试输出面板信息
        fprintf(stdout, "=== 系统面板几何信息 ===\n");
        fprintf(stdout, "物理屏幕: %dx%d\n", panelGeom.screen_width, panelGeom.screen_height);
        fprintf(stdout, "工作区: (%d,%d) %dx%d\n", panelGeom.work_x, panelGeom.work_y, panelGeom.work_width, panelGeom.work_height);
        fprintf(stdout, "面板尺寸: 上=%d 下=%d 左=%d 右=%d\n", 
                panelGeom.top, panelGeom.bottom, panelGeom.left, panelGeom.right);
    }

    // 关键：校正窗口坐标为物理屏幕绝对坐标
    void CorrectWindowCoordinates(int &x, int &y)
    {
        x += panelGeom.left + panelGeom.work_x;
        y += panelGeom.top + panelGeom.work_y;
    }

    // 获取窗口真实屏幕绝对坐标（已集成坐标校正）
    void GetWindowGeometry(Window window, int &x, int &y, unsigned int &width, unsigned int &height)
    {
        x = y = 0;
        width = height = 0;
        if (!display || window == None)
            return;

        // 先获取基础几何信息（相对父窗口）
        Window root = DefaultRootWindow(display);
        Window parent, *children = nullptr;
        unsigned int border_width, depth, nchildren = 0;
        if (!XGetGeometry(display, window, &root, &x, &y, &width, &height, &border_width, &depth))
        {
            return;
        }

        // 转换为屏幕绝对坐标（相对根窗口）
        Window child;
        int abs_x = x, abs_y = y;
        if (XTranslateCoordinates(display, window, root, 0, 0, &abs_x, &abs_y, &child))
        {
            x = abs_x;
            y = abs_y;
        }

        // UKUI/Kylin桌面兜底（_NET_WM_GEOMETRY属性）
        if (isUKUI)
        {
            Atom net_wm_geometry = XInternAtom(display, "_NET_WM_GEOMETRY", False);
            if (net_wm_geometry != None)
            {
                Atom actual_type;
                int actual_format;
                unsigned long nitems = 0, bytes_after = 0;
                unsigned char *prop = nullptr;
                int result = XGetWindowProperty(
                    display, window, net_wm_geometry, 0, 32, False,
                    XA_CARDINAL, &actual_type, &actual_format,
                    &nitems, &bytes_after, &prop);
                if (result == Success && prop && nitems >= 4)
                {
                    int *geom = reinterpret_cast<int *>(prop);
                    x = geom[0];
                    y = geom[1];
                    width = static_cast<unsigned int>(geom[2]);
                    height = static_cast<unsigned int>(geom[3]);
                }
                SAFE_XFREE(prop);
            }
        }

        // 核心修正：将坐标转换为物理屏幕绝对坐标
        CorrectWindowCoordinates(x, y);

        // 释放临时资源
        if (children)
            XFree(children);
    }

    // 调整过滤规则：仅过滤无效窗口，保留Dock/Panel
    bool ShouldFilterWindow(Window window, const std::string &className, WindowType &winType)
    {
        if (!display || window == None)
            return true;

        int x, y;
        unsigned int width, height;
        GetWindowGeometry(window, x, y, width, height);

        // 根据窗口类型调整最小尺寸阈值
        winType = GetWindowType(className, GetWindowTitle(window));
        unsigned int minWidth = 1, minHeight = 1;
        
        // 仅对应用窗口设置最小尺寸过滤
        if (winType == WindowType::APPLICATION) {
            minWidth = isUKUI ? 10 : 50;
            minHeight = isUKUI ? 10 : 30;
        }

        // 过滤极小的无效窗口（非面板/Dock）
        if (width < minWidth || height < minHeight)
        {
            // 但保留面板/Dock窗口（即使尺寸小）
            if (winType != WindowType::PANEL && winType != WindowType::DOCK) {
                return true;
            }
        }

        // 仅过滤krunner/窗口切换器等临时窗口
        static const char *filterClasses[] = {
            "krunner", "ukui-window-switcher"
        };
        const size_t filterCount = sizeof(filterClasses) / sizeof(filterClasses[0]);
        for (size_t i = 0; i < filterCount; i++)
        {
            if (className.find(filterClasses[i]) != std::string::npos)
            {
                return true;
            }
        }

        // 保留所有Dock/Panel/应用/桌面窗口
        return false;
    }

    // 构建Panel/Dock窗口的完整信息（补充坐标和尺寸）
    void BuildPanelWindowInfo(WindowInfo &info, WindowType winType)
    {
        // 根据面板位置填充Panel/Dock窗口的坐标和尺寸
        if (winType == WindowType::PANEL || winType == WindowType::DOCK)
        {
            // 顶部面板
            if (panelGeom.top > 0) {
                info.x = 0;
                info.y = 0;
                info.width = panelGeom.screen_width;
                info.height = panelGeom.top;
                info.title = "Top Panel";
            }
            // 底部面板/Dock
            else if (panelGeom.bottom > 0) {
                info.x = 0;
                info.y = panelGeom.screen_height - panelGeom.bottom;
                info.width = panelGeom.screen_width;
                info.height = panelGeom.bottom;
                info.title = winType == WindowType::DOCK ? "Bottom Dock" : "Bottom Panel";
            }
            // 左侧Dock
            else if (panelGeom.left > 0) {
                info.x = 0;
                info.y = 0;
                info.width = panelGeom.left;
                info.height = panelGeom.screen_height;
                info.title = "Left Dock";
            }
            // 右侧Dock
            else if (panelGeom.right > 0) {
                info.x = panelGeom.screen_width - panelGeom.right;
                info.y = 0;
                info.width = panelGeom.right;
                info.height = panelGeom.screen_height;
                info.title = "Right Dock";
            }
        }
    }

    // 用_NET_CLIENT_LIST_STACKING获取按Z序排序的窗口（包含Dock/Panel）
    std::vector<WindowInfo> GetTopLevelWindows()
    {
        // 先初始化面板几何信息
        GetPanelGeometry();

        std::vector<WindowInfo> windows;
        if (!display)
            return windows;

        // 优先使用_NET_CLIENT_LIST_STACKING（按Z序排序）
        Atom net_client_list_stacking = XInternAtom(display, "_NET_CLIENT_LIST_STACKING", False);
        if (net_client_list_stacking == None)
        {
            net_client_list_stacking = XInternAtom(display, "_NET_CLIENT_LIST", False);
            if (net_client_list_stacking == None)
            {
                fprintf(stderr, "⚠️  系统不支持_NET_CLIENT_LIST_STACKING/_NET_CLIENT_LIST\n");
                return windows;
            }
        }

        // 从根窗口获取按Z序排序的窗口列表
        Atom actual_type;
        int actual_format;
        unsigned long nitems = 0, bytes_after = 0;
        unsigned char *prop_value = nullptr;

        Window root = DefaultRootWindow(display);
        int result = XGetWindowProperty(
            display, root, net_client_list_stacking, 0, 1024, False,
            XA_WINDOW, &actual_type, &actual_format,
            &nitems, &bytes_after, &prop_value);

        // 解析窗口列表（列表顺序=Z序：从下到上）
        if (result == Success && actual_type == XA_WINDOW && nitems > 0 && prop_value)
        {
            Window *client_windows = reinterpret_cast<Window *>(prop_value);

            // 记录原始Z序
            int z_order = 0;
            for (unsigned long i = 0; i < nitems; i++)
            {
                Window win = client_windows[i];
                if (!IsWindowValid(win) || !IsWindowVisible(win))
                    continue;
                
                std::string className = GetWindowClass(win);
                WindowType winType = WindowType::APPLICATION;
                
                // 调整过滤规则：保留Dock/Panel
                if (ShouldFilterWindow(win, className, winType))
                    continue;

                // 获取窗口真实几何信息（已校正为物理屏幕坐标）
                int x = 0, y = 0;
                unsigned int width = 0, height = 0;
                GetWindowGeometry(win, x, y, width, height);

                // 构造WindowInfo
                WindowInfo info{};
                info.handle = static_cast<int64_t>(static_cast<uint64_t>(win));
                info.title = GetWindowTitle(win);
                info.pid = 0;
                info.x = x;
                info.y = y;
                info.width = static_cast<int>(width);
                info.height = static_cast<int>(height);
                info.isVisible = true;
                info.processName = className;
                info.platform = "linux";
                info.zOrder = z_order++;

                // 补充Panel/Dock窗口的完整信息（如果坐标/尺寸不完整）
                if (winType == WindowType::PANEL || winType == WindowType::DOCK) {
                    BuildPanelWindowInfo(info, winType);
                    // 在processName中标识窗口类型（方便外部识别）
                    info.processName += winType == WindowType::PANEL ? " [PANEL]" : " [DOCK]";
                }
                else if (winType == WindowType::DESKTOP) {
                    info.processName += " [DESKTOP]";
                }
                else {
                    info.processName += " [APPLICATION]";
                }

                windows.push_back(info);
            }

            // 反转列表，让Z序大的窗口排在前面
            std::reverse(windows.begin(), windows.end());
            // 重新修正Z序
            int max_z = windows.size() - 1;
            for (size_t i = 0; i < windows.size(); i++)
            {
                windows[i].zOrder = max_z - i;
            }
        }

        // 释放内存
        SAFE_XFREE(prop_value);
        return windows;
    }

public:
    // 构造函数
    LinuxWindowEnumerator()
    {
        signal(SIGSEGV, SigSegvHandler);
        XSetErrorHandler(X11ErrorHandler);

        // 环境诊断
        const char *displayStr = getenv("DISPLAY");
        fprintf(stdout, "=== X11 环境诊断 ===\n");
        fprintf(stdout, "DISPLAY 变量值: %s\n", displayStr ? displayStr : "NULL");
        const char *xauthPath = getenv("XAUTHORITY");
        if (!xauthPath)
            xauthPath = getenv("HOME");
        fprintf(stdout, "XAUTHORITY 路径: %s\n", xauthPath ? xauthPath : "NULL");

        // 连接X11显示
        if (!displayStr)
            displayStr = ":0.0";
        display = XOpenDisplay(displayStr);
        if (!display)
        {
            fprintf(stderr, "尝试连接 %s 失败，重试 :0...\n", displayStr);
            display = XOpenDisplay(":0");
        }

        if (!display)
        {
            fprintf(stderr, "❌ XOpenDisplay 最终失败！\n");
            isUKUI = false;
            return;
        }
        fprintf(stdout, "✅ XOpenDisplay 连接 %s 成功！\n", displayStr);

        // 检测桌面环境
        isUKUI = DetectKylinUKUI();
    }

    // 析构函数
    ~LinuxWindowEnumerator()
    {
        if (display)
        {
            XCloseDisplay(display);
            display = nullptr;
        }
    }

    // 获取所有窗口（包含Dock/Panel）
    std::vector<WindowInfo> GetAllWindows()
    {
        return GetTopLevelWindows();
    }

    // 获取可见窗口（接口实现）
    std::vector<WindowInfo> GetVisibleWindows() override
    {
        return GetAllWindows();
    }

    // 对外暴露面板几何信息
    PanelGeometry GetPanelGeometryInfo() const
    {
        return panelGeom;
    }
};

#undef SAFE_XFREE

// 主函数（测试用）
// int main() {
//   try {
//     fprintf(stdout, "开始枚举Linux窗口（包含Dock/面板）...\n");
//     LinuxWindowEnumerator enumerator;
//     const std::vector<WindowInfo> windows = enumerator.GetVisibleWindows();
//     const PanelGeometry panel = enumerator.GetPanelGeometryInfo();

//     fprintf(stdout, "\n=== 系统面板信息 ===\n");
//     fprintf(stdout, "物理屏幕分辨率: %dx%d\n", panel.screen_width, panel.screen_height);
//     fprintf(stdout, "系统面板占用: 上=%dpx 下=%dpx 左=%dpx 右=%dpx\n", 
//             panel.top, panel.bottom, panel.left, panel.right);

//     fprintf(stdout, "\n找到 %lu 个可见窗口（包含Dock/面板）：\n", windows.size());
//     for (size_t i = 0; i < windows.size(); i++) {
//       const auto& win = windows[i];
//       fprintf(stdout, "======== 窗口 %lu ========\n", i+1);
//       fprintf(stdout, "句柄: %ld\n", win.handle);
//       fprintf(stdout, "标题: %s\n", win.title.empty() ? "无" : win.title.c_str());
//       fprintf(stdout, "物理坐标: (%d, %d)\n", win.x, win.y);
//       fprintf(stdout, "大小: %d x %d\n", win.width, win.height);
//       fprintf(stdout, "类型: %s\n", win.processName.c_str());
//       fprintf(stdout, "可见性: %s\n", win.isVisible ? "是" : "否");
//       fprintf(stdout, "zOrder: %d\n", win.zOrder);
//       fprintf(stdout, "==========================\n\n");
//     }
//     fprintf(stdout, "窗口枚举完成\n");
//   } catch (...) {
//     fprintf(stderr, "❌ 程序运行异常，但未崩溃！\n");
//     return 1;
//   }
//   return 0;
// }