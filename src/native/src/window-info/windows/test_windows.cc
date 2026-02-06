// src/windows/test_windows.cc
#include "window_enumerator.cc"
#include <algorithm>
#include <cstdint>
#include <iomanip>
#include <iostream>

#ifdef _WIN32
#include <windows.h>
void SetConsoleUtf8() {
  SetConsoleOutputCP(CP_UTF8);
  SetConsoleCP(CP_UTF8);
}
#else
void SetConsoleUtf8() {}
#endif

// 格式化输出WindowInfo信息（新增zOrder字段）
void PrintWindowInfo(const WindowInfo &info) {
  std::cout << "========================================" << std::endl;
  std::cout << "窗口句柄: 0x" << std::hex << info.handle << std::dec
            << std::endl;
  std::cout << "窗口标题: " << (info.title.empty() ? "(空)" : info.title)
            << std::endl;
  std::cout << "进程ID: " << info.pid << std::endl;
  std::cout << "进程名称: "
            << (info.processName.empty() ? "(未知)" : info.processName)
            << std::endl;
  std::cout << "窗口位置: x=" << info.x << ", y=" << info.y << std::endl;
  std::cout << "窗口大小: 宽=" << info.width << ", 高=" << info.height
            << std::endl;
  std::cout << "是否可见: " << (info.isVisible ? "是" : "否") << std::endl;
  std::cout << "窗口Z序: " << info.zOrder << " (数值越小越顶层)"
            << std::endl; // 新增输出
  std::cout << "平台: " << info.platform << std::endl;
}

// 主函数：直接调用枚举类测试
// 编译方法:  g++ test_windows.cc -o window_test.exe -std=c++17 -luser32
// -ldwmapi -lpsapi
int main() {
  SetConsoleUtf8();

  std::cout << "======= Windows窗口枚举测试程序（含Z序）=======" << std::endl;
  std::cout << "1. 枚举所有窗口..." << std::endl;

  WindowsWindowEnumerator enumerator;
  auto allWindows = enumerator.GetAllWindows();
  std::cout << "共枚举到 " << allWindows.size() << " 个窗口" << std::endl;

  // 打印前5个窗口信息
  for (size_t i = 0; i < std::min(static_cast<size_t>(5), allWindows.size());
       ++i) {
    PrintWindowInfo(allWindows[i]);
  }

  // 测试2：获取可见窗口
  std::cout << "\n2. 枚举可见窗口..." << std::endl;
  auto visibleWindows = enumerator.GetVisibleWindows();
  std::cout << "共枚举到 " << visibleWindows.size() << " 个可见窗口"
            << std::endl;

  // 按Z序排序输出可见窗口（更直观）
  std::sort(visibleWindows.begin(), visibleWindows.end(),
            [](const WindowInfo &a, const WindowInfo &b) {
              return a.zOrder < b.zOrder; // 按Z序升序（顶层在前）
            });

  for (const auto &win : visibleWindows) {
    PrintWindowInfo(win);
  }

  std::cout << "\n测试完成，按任意键退出..." << std::endl;
  std::cin.get();

  return 0;
}