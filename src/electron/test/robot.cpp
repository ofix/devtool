#include <Windows.h>
#include <cstdio>
#include <string>
#include <fstream>

#define HOTKEY_ID       1
#define MOD_CTRL_ALT    3

void Log(const char* msg) {
    printf("[LOG] %s\n", msg);
    fflush(stdout);
}

std::string ReadTxt() {
    std::ifstream ifs("vdi_input");
    if (!ifs) {
        Log("未找到 vdi_input");
        return "";
    }
    return std::string((std::istreambuf_iterator<char>(ifs)),
        std::istreambuf_iterator<char>());
}

std::string FilterChinese(const std::string& input) {
    std::string output;
    for (unsigned char c : input) {
        if (c >= 0x80) continue;
        output += c;
    }
    return output;
}

// 单独按下按键
void KeyDown(WORD scan)
{
    INPUT i{};
    i.type = INPUT_KEYBOARD;
    i.ki.wScan = scan;
    i.ki.dwFlags = KEYEVENTF_SCANCODE;
    SendInput(1, &i, sizeof(INPUT));
}

// 单独松开按键
void KeyUp(WORD scan)
{
    INPUT i{};
    i.type = INPUT_KEYBOARD;
    i.ki.wScan = scan;
    i.ki.dwFlags = KEYEVENTF_SCANCODE | KEYEVENTF_KEYUP;
    SendInput(1, &i, sizeof(INPUT));
}

// VDI最稳单发按键 严格时序
void SimKey(WORD scan, bool shift)
{
    WORD shiftScan = MapVirtualKeyA(VK_SHIFT, MAPVK_VK_TO_VSC);
    if (shift)
    {
        KeyDown(shiftScan);
        Sleep(25);
    }

    KeyDown(scan);
    Sleep(25);
    KeyUp(scan);
    Sleep(25);

    if (shift)
    {
        KeyUp(shiftScan);
        Sleep(30);
    }
}

// 精准字符映射 杜绝符号错位
bool GetScanAndShift(char c, WORD& sc, bool& sh)
{
    sc = 0; sh = false;
    // 小写字母
    if (c >= 'a' && c <= 'z')
    {
        sc = MapVirtualKeyA(VkKeyScanA(c) & 0xFF, MAPVK_VK_TO_VSC);
        return true;
    }
    // 大写字母
    if (c >= 'A' && c <= 'Z')
    {
        sc = MapVirtualKeyA(c, MAPVK_VK_TO_VSC);
        sh = true;
        return true;
    }
    // 数字
    if (c >= '0' && c <= '9')
    {
        sc = MapVirtualKeyA(c, MAPVK_VK_TO_VSC);
        return true;
    }

    switch (c)
    {
    case ' ': sc = MapVirtualKeyA(VK_SPACE, MAPVK_VK_TO_VSC); return true;
    case '\t': sc = MapVirtualKeyA(VK_TAB, MAPVK_VK_TO_VSC); return true;
    case '\n': sc = MapVirtualKeyA(VK_RETURN, MAPVK_VK_TO_VSC); return true;

    case '!': sc = MapVirtualKeyA('1', MAPVK_VK_TO_VSC); sh = 1; break;
    case '@': sc = MapVirtualKeyA('2', MAPVK_VK_TO_VSC); sh = 1; break;
    case '#': sc = MapVirtualKeyA('3', MAPVK_VK_TO_VSC); sh = 1; break;
    case '$': sc = MapVirtualKeyA('4', MAPVK_VK_TO_VSC); sh = 1; break;
    case '%': sc = MapVirtualKeyA('5', MAPVK_VK_TO_VSC); sh = 1; break;
    case '^': sc = MapVirtualKeyA('6', MAPVK_VK_TO_VSC); sh = 1; break;
    case '&': sc = MapVirtualKeyA('7', MAPVK_VK_TO_VSC); sh = 1; break;
    case '*': sc = MapVirtualKeyA('8', MAPVK_VK_TO_VSC); sh = 1; break;
    case '(': sc = MapVirtualKeyA('9', MAPVK_VK_TO_VSC); sh = 1; break;
    case ')': sc = MapVirtualKeyA('0', MAPVK_VK_TO_VSC); sh = 1; break;

    case '-': sc = MapVirtualKeyA(VK_OEM_MINUS, MAPVK_VK_TO_VSC); break;
    case '_': sc = MapVirtualKeyA(VK_OEM_MINUS, MAPVK_VK_TO_VSC); sh = 1; break;
    case '=': sc = MapVirtualKeyA(VK_OEM_PLUS, MAPVK_VK_TO_VSC); break;
    case '+': sc = MapVirtualKeyA(VK_OEM_PLUS, MAPVK_VK_TO_VSC); sh = 1; break;

    case '[': sc = MapVirtualKeyA(VK_OEM_4, MAPVK_VK_TO_VSC); break;
    case '{': sc = MapVirtualKeyA(VK_OEM_4, MAPVK_VK_TO_VSC); sh = 1; break;
    case ']': sc = MapVirtualKeyA(VK_OEM_6, MAPVK_VK_TO_VSC); break;
    case '}': sc = MapVirtualKeyA(VK_OEM_6, MAPVK_VK_TO_VSC); sh = 1; break;

    case ';': sc = MapVirtualKeyA(VK_OEM_1, MAPVK_VK_TO_VSC); break;
    case ':': sc = MapVirtualKeyA(VK_OEM_1, MAPVK_VK_TO_VSC); sh = 1; break;
    case '\'': sc = MapVirtualKeyA(VK_OEM_7, MAPVK_VK_TO_VSC); break;
    case '"': sc = MapVirtualKeyA(VK_OEM_7, MAPVK_VK_TO_VSC); sh = 1; break;

    case ',': sc = MapVirtualKeyA(VK_OEM_COMMA, MAPVK_VK_TO_VSC); break;
    case '<': sc = MapVirtualKeyA(VK_OEM_COMMA, MAPVK_VK_TO_VSC); sh = 1; break;
    case '.': sc = MapVirtualKeyA(VK_OEM_PERIOD, MAPVK_VK_TO_VSC); break;
    case '>': sc = MapVirtualKeyA(VK_OEM_PERIOD, MAPVK_VK_TO_VSC); sh = 1; break;

    case '/': sc = MapVirtualKeyA(VK_OEM_2, MAPVK_VK_TO_VSC); break;
    case '?': sc = MapVirtualKeyA(VK_OEM_2, MAPVK_VK_TO_VSC); sh = 1; break;
    case '\\': sc = MapVirtualKeyA(VK_OEM_5, MAPVK_VK_TO_VSC); break;
    case '|': sc = MapVirtualKeyA(VK_OEM_5, MAPVK_VK_TO_VSC); sh = 1; break;
    case '`': sc = MapVirtualKeyA(VK_OEM_3, MAPVK_VK_TO_VSC); break;
    case '~': sc = MapVirtualKeyA(VK_OEM_3, MAPVK_VK_TO_VSC); sh = 1; break;

    default: return false;
    }
    return true;
}

// ==============================
// ✅ 修复：正常换行（无自动缩进）
// ==============================
void SendCodeString(const std::string& s)
{
    Log("开始输入...");
    std::string txt = FilterChinese(s);

    for (char c : txt)
    {
        if (c == '\r') continue;

        WORD scan;
        bool shift;
        if (GetScanAndShift(c, scan, shift))
        {
            SimKey(scan, shift);
        }
    }
    Log("输入完成");
}

void OnHotkey()
{
    printf("\n=======================\n");
    Log("5秒后开始输入，请聚焦VDI输入框");
    Sleep(5000);
    std::string code = ReadTxt();
    if (code.empty())
    {
        Log("文件为空");
        return;
    }
    SendCodeString(code);
}

int main()
{
    SetConsoleOutputCP(65001);
    printf("VDI精准按键工具 Ctrl+Alt+V\n");
    printf("已修复：字符正常 + 换行正常\n\n");

    if (!RegisterHotKey(NULL, HOTKEY_ID, MOD_CTRL_ALT, 0x56)) // V键
    {
        Log("热键注册失败");
        return 1;
    }
    Log("启动成功");

    MSG msg{};
    while (GetMessage(&msg, nullptr, 0, 0))
    {
        if (msg.message == WM_HOTKEY) OnHotkey();
    }
    UnregisterHotKey(NULL, HOTKEY_ID);
    return 0;
}