#include "../window_info.h"
#include <CoreFoundation/CoreFoundation.h>
#include <CoreGraphics/CoreGraphics.h>
#include <vector>
#include <string>

class MacOSWindowEnumerator : public WindowEnumerator {
private:
  std::string CFStringToStdString(CFStringRef cfStr) {
    if (!cfStr) return "";
    
    const char* utf8Str = CFStringGetCStringPtr(cfStr, kCFStringEncodingUTF8);
    if (utf8Str) return std::string(utf8Str);
    
    CFIndex length = CFStringGetLength(cfStr);
    CFIndex maxSize = CFStringGetMaximumSizeForEncoding(length, kCFStringEncodingUTF8) + 1;
    char* buffer = new char[maxSize];
    
    if (CFStringGetCString(cfStr, buffer, maxSize, kCFStringEncodingUTF8)) {
      std::string result(buffer);
      delete[] buffer;
      return result;
    }
    
    delete[] buffer;
    return "";
  }

  std::string GetProcessName(pid_t pid) {
    // 简化实现，实际项目中需要更完整的进程信息获取
    return "process_" + std::to_string(pid);
  }

public:
  std::vector<WindowInfo> GetAllWindows() override {
    std::vector<WindowInfo> windows;
    
    // 获取所有窗口列表
    CFArrayRef windowList = CGWindowListCopyWindowInfo(
      kCGWindowListOptionAll, kCGNullWindowID
    );
    
    if (!windowList) return windows;
    
    CFIndex count = CFArrayGetCount(windowList);
    for (CFIndex i = 0; i < count; i++) {
      CFDictionaryRef windowInfo = (CFDictionaryRef)CFArrayGetValueAtIndex(windowList, i);
      
      // 获取窗口属性
      CFNumberRef windowId = (CFNumberRef)CFDictionaryGetValue(windowInfo, kCGWindowNumber);
      CFStringRef windowTitle = (CFStringRef)CFDictionaryGetValue(windowInfo, kCGWindowName);
      CFNumberRef windowPid = (CFNumberRef)CFDictionaryGetValue(windowInfo, kCGWindowOwnerPID);
      CFDictionaryRef windowBounds = (CFDictionaryRef)CFDictionaryGetValue(windowInfo, kCGWindowBounds);
      
      if (!windowId || !windowPid || !windowBounds) continue;
      
      // 提取数值
      int64_t handle;
      pid_t pid;
      CFNumberGetValue(windowId, kCFNumberSInt64Type, &handle);
      CFNumberGetValue(windowPid, kCFNumberIntType, &pid);
      
      // 获取窗口位置和大小
      CGRect bounds;
      CFDictionaryRef boundsDict = (CFDictionaryRef)windowBounds;
      CFNumberRef x = (CFNumberRef)CFDictionaryGetValue(boundsDict, CFSTR("X"));
      CFNumberRef y = (CFNumberRef)CFDictionaryGetValue(boundsDict, CFSTR("Y"));
      CFNumberRef width = (CFNumberRef)CFDictionaryGetValue(boundsDict, CFSTR("Width"));
      CFNumberRef height = (CFNumberRef)CFDictionaryGetValue(boundsDict, CFSTR("Height"));
      
      if (x && y && width && height) {
        double dx, dy, dw, dh;
        CFNumberGetValue(x, kCFNumberDoubleType, &dx);
        CFNumberGetValue(y, kCFNumberDoubleType, &dy);
        CFNumberGetValue(width, kCFNumberDoubleType, &dw);
        CFNumberGetValue(height, kCFNumberDoubleType, &dh);
        
        WindowInfo info;
        info.handle = handle;
        info.title = CFStringToStdString(windowTitle);
        info.pid = pid;
        info.x = static_cast<int32_t>(dx);
        info.y = static_cast<int32_t>(dy);
        info.width = static_cast<uint32_t>(dw);
        info.height = static_cast<uint32_t>(dh);
        info.isVisible = true; // macOS API 默认返回可见窗口
        info.processName = GetProcessName(pid);
        info.platform = "macos";
        
        windows.push_back(info);
      }
    }
    
    CFRelease(windowList);
    return windows;
  }

  std::vector<WindowInfo> GetVisibleWindows() override {
    // macOS 的 CGWindowListCopyWindowInfo 默认返回可见窗口
    return GetAllWindows();
  }
};