# window-info

Cross-platform native Node.js module for retrieving window information.

## Introduction

window-info is a native module built on Node.js N-API that retrieves information about currently open windows in the system. It supports the three major desktop platforms—Windows, macOS, and Linux—and provides a unified API to query window properties such as title, class name, position, and size.

## Features

- **Cross-platform support**: Simultaneously supports Windows, macOS, and Linux operating systems
- **Window enumeration**: Retrieve all windows or only visible windows
- **Window filtering**: Supports filtering windows by title pattern matching
- **Native performance**: Implemented in C++ native code for high efficiency
- **Simple and easy to use**: Provides a clean Promise/Async-style API

## Installation


## Usage

```javascript
const native = require('devtool-native');

// Get all windows
async function listAllWindows() {
  const windows = await native.getAllWindows();
  console.log('All windows:', windows);
}

// Get visible windows
async function listVisibleWindows() {
  const windows = await native.getVisibleWindows();
  console.log('Visible windows:', windows);
}

// Filter windows by title pattern
async function findWindowsByTitle() {
  const windows = await native.getWindowsByTitle('Chrome');
  console.log('Windows with title containing "Chrome":', windows);
}

// Execute examples
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

## API Documentation

### native.getAllWindows()

Retrieves a list of all windows in the system, including both visible and invisible windows.

**Return value**: Promise<Array<WindowInfo>>

### native.getVisibleWindows()

Retrieves a list of all visible windows in the system.

**Return value**: Promise<Array<WindowInfo>>

### native.getWindowsByTitle(pattern)

Filters windows by title pattern matching.

**Parameters**:
- `pattern` (string): A regular expression pattern used to match window titles

**Return value**: Promise<Array<WindowInfo>>

### WindowInfo Object Structure

Each window information object contains the following properties:

| Property | Type | Description |
|----------|------|-------------|
| id | number | Unique identifier of the window |
| title | string | Window title |
| class | string | Window class name (Linux/Windows) or process name (macOS) |
| x | number | X coordinate of the window's top-left corner |
| y | number | Y coordinate of the window's top-left corner |
| width | number | Window width |
| height | number | Window height |
| pid | number | Process ID of the owning process |

## Platform Notes

### Windows

- Implemented using Win32 API
- Requires Windows 7 or later

### macOS

- Implemented using Cocoa/CoreGraphics API
- Requires macOS 10.10 or later
- Only retrieves application windows; excludes system UI windows

### Linux

- Implemented using X11 API
- Supports standard X11 window managers
- Specifically optimized for the UKUI desktop environment
- Requires the DISPLAY environment variable to be correctly configured

## Build Requirements

- Node.js 12.0.0 or higher
- Python 2.7/3.x
- C++ compiler:
  - Windows: Visual Studio 2017 or later
  - macOS: Xcode Command Line Tools
  - Linux: gcc/g++ and make

## Local Development

```bash
# Install dependencies
npm install

# Build native module
npm run build

# Run tests
npm test
```

## Related Projects

- [node-ffi](https://github.com/node-ffi/node-ffi) - Node.js Foreign Function Interface
- [node-win](https://github.com/winnr/w) - Node.js wrapper for Windows APIs

## License

This project is open-sourced under the MIT License.