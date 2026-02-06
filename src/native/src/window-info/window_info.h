#ifndef WINDOW_INFO_H
#define WINDOW_INFO_H

#include <cstdint>
#include <string>
#include <vector>

struct WindowInfo {
  int64_t handle;          // 窗口句柄
  std::string title;       // 窗口标题
  int32_t pid;             // 进程ID
  int32_t x;               // 窗口左上角X坐标
  int32_t y;               // 窗口左上角Y坐标
  uint32_t width;          // 窗口宽度
  uint32_t height;         // 窗口高度
  bool isVisible;          // 是否可见
  std::string processName; // 进程名称
  std::string platform;    // 平台标识
  int zOrder; // 窗口Z序（层叠顺序，数值越小越顶层）
};

// 前向声明
class WindowEnumerator {
public:
  virtual ~WindowEnumerator() = default;
  virtual std::vector<WindowInfo> GetAllWindows() = 0;
  virtual std::vector<WindowInfo> GetVisibleWindows() = 0;
};

#endif // WINDOW_INFO_H