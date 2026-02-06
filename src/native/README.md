# window-info

跨平台窗口信息获取 Node.js 原生插件。

## 简介

window-info 是一个基于 Node.js N-API 的原生模块，用于获取系统中当前打开窗口的信息。支持 Windows、macOS 和 Linux 三大桌面平台，提供统一的 API 接口来查询窗口标题、类名、位置、尺寸等属性。

## 功能特性

- **跨平台支持**：同时支持 Windows、macOS 和 Linux 操作系统
- **窗口枚举**：获取所有窗口或仅可见窗口
- **窗口筛选**：支持按标题模式匹配筛选窗口
- **原生性能**：使用 C++ 原生代码实现，性能高效
- **简单易用**：提供简洁的 Promise/Async 风格 API

## 使用方法

```javascript
const native = require("window-info");

// 获取所有窗口
async function listAllWindows() {
  const windows = await native.getAllWindows();
  console.log("所有窗口:", windows);
}

// 获取可见窗口
async function listVisibleWindows() {
  const windows = await native.getVisibleWindows();
  console.log("可见窗口:", windows);
}

// 按标题模式筛选窗口
async function findWindowsByTitle() {
  const windows = await native.getWindowsByTitle("Chrome");
  console.log('标题包含 "Chrome" 的窗口:', windows);
}

// 执行示例
listAllWindows();
listVisibleWindows();
findWindowsByTitle();

const native = require('./build/Release/dev_tools_native.node');

// 1. 扫描文件夹
native.scanFolder('./test-folder', true, (err, result) => {
    if (err) return console.error('扫描失败：', err);
    console.log('扫描结果：', Object.keys(result).length, '个文件');
});

// 2. 比对两个文件夹
native.compareFolders('./test-folder-a', './test-folder-b', true, (err, result) => {
    if (err) return console.error('文件夹比对失败：', err);
    console.log('比对结果：', {
        total: result.totalFiles,
        added: result.diffs.added.length,
        deleted: result.diffs.deleted.length,
        modified: result.diffs.modified.length,
        same: result.diffs.same.length
    });
});

// 3. 比对两个文件
native.compareFiles('./test-a.txt', './test-b.txt', (err, result) => {
    if (err) return console.error('文件比对失败：', err);
    console.log('文件比对结果：', {
        isText: result.isText,
        diffs: result.diffs
    });
});
```

## API 文档

### native.getAllWindows()

获取系统中所有窗口的列表，包括可见和不可见窗口。

**返回值**：Promise\<Array\<WindowInfo\>\>

### native.getVisibleWindows()

获取系统中所有可见窗口的列表。

**返回值**：Promise\<Array\<WindowInfo\>\>

### native.getWindowsByTitle(pattern)

根据标题模式筛选窗口。

**参数**：

- `pattern` (string)：用于匹配窗口标题的正则表达式模式

**返回值**：Promise\<Array\<WindowInfo\>\>

### WindowInfo 对象结构

每个窗口信息对象包含以下属性：

| 属性   | 类型   | 描述                                       |
| ------ | ------ | ------------------------------------------ |
| id     | number | 窗口唯一标识符                             |
| title  | string | 窗口标题                                   |
| class  | string | 窗口类名（Linux/Windows）或进程名（macOS） |
| x      | number | 窗口左上角 X 坐标                          |
| y      | number | 窗口左上角 Y 坐标                          |
| width  | number | 窗口宽度                                   |
| height | number | 窗口高度                                   |
| pid    | number | 所属进程 ID                                |

## 平台说明

### Windows

- 使用 Win32 API 实现
- 需要 Windows 7 及以上版本

### macOS

- 使用 Cocoa/CoreGraphics API 实现
- 需要 macOS 10.10 及以上版本
- 仅获取应用程序窗口，不获取系统 UI 窗口

### Linux

- 使用 X11 API 实现
- 支持常规 X11 窗口管理器
- 针对 UKUI 桌面环境进行了特殊优化
- 需要 DISPLAY 环境变量正确配置

## 构建要求

- Node.js 12.0.0 或更高版本
- Python 2.7/3.x
- C++ 编译器：
  - Windows: Visual Studio 2017 或更高版本
  - macOS: Xcode Command Line Tools
  - Linux: gcc/g++ 和 make

## 本地开发

```bash
# 安装依赖
npm install

# 构建原生模块
npm run build

# 运行测试
npm test
```

## 编译相关
- 安装zlib编译时环境
```shell
# Ubuntu/Debian 系
sudo apt-get install zlib1g-dev
# CentOS/RHEL 系
sudo yum install zlib-devel
# Fedora
sudo dnf install zlib-devel
```

## 相关项目

- [node-ffi](https://github.com/node-ffi/node-ffi) - Node.js 外部函数接口
- [node-win](https://github.com/winnr/w) - Windows API 的 Node.js 封装

## 许可证

本项目基于 MIT 许可证开源。
