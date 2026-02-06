#include "../window_info.h"
#include <algorithm> // 新增：用于排序
#include <cstdint>
#include <cstring>
#include <dwmapi.h>
#include <psapi.h>
#include <string>
#include <tlhelp32.h>
#include <unordered_map>
#include <vector>
#include <windows.h>

class WindowsWindowEnumerator : public WindowEnumerator {
private:
  // 窗口层优先级（数值越大，层级越高）
  enum WindowLayer {
    LAYER_HIDDEN = 0,  // 隐藏窗口
    LAYER_BOTTOM = 1,  // 底层窗口
    LAYER_NORMAL = 2,  // 普通应用窗口
    LAYER_TOPMOST = 3, // 置顶窗口
    LAYER_DESKTOP = 4  // 桌面层窗口
  };

  // 获取窗口的层优先级
  static WindowLayer GetWindowLayer(HWND hwnd) {
    // 判断是否置顶窗口
    if (GetWindowLongPtr(hwnd, GWL_EXSTYLE) & WS_EX_TOPMOST) {
      return LAYER_TOPMOST;
    }
    // 判断是否可见
    if (!IsWindowVisible(hwnd)) {
      return LAYER_HIDDEN;
    }
    // 判断是否桌面窗口
    char className[256] = {0};
    GetClassNameA(hwnd, className, sizeof(className));
    if (strcmp(className, "Progman") == 0 ||
        strcmp(className, "WorkerW") == 0) {
      return LAYER_DESKTOP;
    }
    // 判断是否底层窗口
    if (GetWindowLongPtr(hwnd, GWL_EXSTYLE) & WS_EX_NOACTIVATE) {
      return LAYER_BOTTOM;
    }
    // 默认普通窗口
    return LAYER_NORMAL;
  }

  // 静态成员函数：供回调调用
  static std::string GetProcessName(DWORD pid) {
    HANDLE hProcess =
        OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, FALSE, pid);
    if (!hProcess)
      return "";

    char filename[MAX_PATH] = {0};
    DWORD size = GetModuleFileNameExA(hProcess, NULL, filename, MAX_PATH);
    CloseHandle(hProcess);

    return (size > 0) ? std::string(filename) : "";
  }

  static std::string GetWindowTitle(HWND hwnd) {
    char title[256] = {0};
    int length = GetWindowTextA(hwnd, title, sizeof(title));
    return (length > 0) ? std::string(title) : "";
  }

  // 核心修复：精准计算全局唯一Z序
  static int32_t GetWindowZOrder(HWND targetHwnd) {
    // 步骤1：收集所有顶层窗口（包含跨层）
    std::vector<HWND> allTopWindows;
    HWND currentWnd = NULL;

    // 遍历所有顶层窗口（GW_HWNDFIRST 从头开始）
    currentWnd = GetWindow(GetDesktopWindow(), GW_CHILD);
    while (currentWnd != NULL) {
      if (IsWindow(currentWnd) &&
          GetParent(currentWnd) == NULL) { // 只处理顶层窗口
        allTopWindows.push_back(currentWnd);
      }
      currentWnd = GetWindow(currentWnd, GW_HWNDNEXT);
    }

    // 步骤2：按层优先级+层内顺序排序
    std::sort(allTopWindows.begin(), allTopWindows.end(), [](HWND a, HWND b) {
      WindowLayer layerA = GetWindowLayer(a);
      WindowLayer layerB = GetWindowLayer(b);
      // 先按层优先级排序（层级高的在前）
      if (layerA != layerB) {
        return layerA > layerB;
      }
      // 同层内按系统Z序排序
      return GetWindow(a, GW_HWNDPREV) == b;
    });

    // 步骤3：查找目标窗口的索引（即全局Z序）
    for (size_t i = 0; i < allTopWindows.size(); ++i) {
      if (allTopWindows[i] == targetHwnd) {
        return static_cast<int32_t>(i);
      }
    }

    return static_cast<int32_t>(allTopWindows.size()); // 未找到则放最后
  }

  // 回调数据结构体
  struct EnumCallbackData {
    std::vector<WindowInfo> *windows;
    std::unordered_map<HWND, int32_t> *zOrderMap; // 缓存Z序，避免重复计算
  };

  // 窗口枚举回调函数（静态）
  static BOOL CALLBACK EnumWindowsProc(HWND hwnd, LPARAM lParam) {
    auto *data = reinterpret_cast<EnumCallbackData *>(lParam);
    if (!data || !data->windows || !data->zOrderMap)
      return TRUE;

    // 过滤无效窗口
    if (GetParent(hwnd) != NULL)
      return TRUE; // 只保留顶层窗口（子窗口不参与全局Z序）

    char className[256] = {0};
    GetClassNameA(hwnd, className, sizeof(className));

    // 过滤系统窗口（保留桌面窗口用于层判断）
    if (strcmp(className, "Shell_TrayWnd") == 0 ||
        strcmp(className, "TaskManagerWindow") == 0) {
      return TRUE;
    }

    DWORD pid = 0;
    GetWindowThreadProcessId(hwnd, &pid);

    RECT rect = {0};
    if (!GetWindowRect(hwnd, &rect))
      return TRUE;

    // 获取窗口实际大小（包含边框）
    RECT clientRect = {0};
    if (SUCCEEDED(DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS,
                                        &clientRect, sizeof(clientRect)))) {
      rect = clientRect;
    }

    // 计算并缓存Z序（精准版）
    int32_t zOrder = GetWindowZOrder(hwnd);
    (*data->zOrderMap)[hwnd] = zOrder;

    WindowInfo info;
    info.handle = reinterpret_cast<int64_t>(hwnd);
    info.title = GetWindowTitle(hwnd);
    info.pid = static_cast<int32_t>(pid);
    info.x = static_cast<int32_t>(rect.left);
    info.y = static_cast<int32_t>(rect.top);
    info.width = static_cast<uint32_t>(rect.right - rect.left);
    info.height = static_cast<uint32_t>(rect.bottom - rect.top);
    info.isVisible = (IsWindowVisible(hwnd) == TRUE);
    info.processName = GetProcessName(pid);
    info.platform = "windows";
    info.zOrder = zOrder; // 填充精准Z序

    data->windows->push_back(info);
    return TRUE;
  }

public:
  // 实现基类的纯虚函数（适配精准Z序）
  std::vector<WindowInfo> GetAllWindows() override {
    std::vector<WindowInfo> windows;
    std::unordered_map<HWND, int32_t> zOrderMap; // 缓存Z序，提升性能
    EnumCallbackData data = {&windows, &zOrderMap};
    EnumWindows(EnumWindowsProc, reinterpret_cast<LPARAM>(&data));
    return windows;
  }

  std::vector<WindowInfo> GetVisibleWindows() override {
    auto allWindows = GetAllWindows();
    std::vector<WindowInfo> visibleWindows;

    for (const auto &window : allWindows) {
      if (window.isVisible) {
        visibleWindows.push_back(window);
      }
    }

    return visibleWindows;
  }

  // 提供静态创建函数
  static WindowsWindowEnumerator *Create() {
    return new WindowsWindowEnumerator();
  }
};