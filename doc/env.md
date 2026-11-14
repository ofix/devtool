## MACOS MINI 系统支持 C++20

第一步：让 VS Code 的语法提示支持 C++20
.vscode/c_cpp_properties.json 文件。

打开命令面板（Cmd + Shift + P），输入并选择 “C/C++: Edit Configurations (JSON)”。

在生成的 c_cpp_properties.json 中，找到 "configurations" 数组里针对 Mac 的那一项。

修改或添加两个关键字段：

"cppStandard"：设置为 "c++20"。这是告诉 IntelliSense 按 C++20 标准来解析代码。

"compilerPath"：指向你实际用来编译的编译器路径。如果后续你用了 Homebrew 的 LLVM，这里也要同步更新。

示例片段如下

```json
{
  "configurations": [
    {
      "name": "Mac",
      "includePath": ["${workspaceFolder}/**"],
      "defines": [],
      "macFrameworkPath": ["/System/Library/Frameworks", "/Library/Frameworks"],
      "compilerPath": "/opt/homebrew/opt/llvm/bin/clang++",
      "cStandard": "c17",
      "cppStandard": "c++20",
      "intelliSenseMode": "macos-clang-arm64"
    }
  ],
  "version": 4
}
```

实际环境配置

```json
{
  "configurations": [
    {
      "name": "Mac",
      "includePath": ["${default}", "${workspaceFolder}/src/**"],
      "defines": [],
      "compilerPath": "/opt/homebrew/opt/llvm/bin/clang++",
      "cStandard": "c17",
      "cppStandard": "c++20",
      "intelliSenseMode": "macos-clang-arm64"
    }
  ],
  "version": 4
}
```

第二步：让 macOS 系统真正支持编译 C++20
你之前截图中 \_\_cplusplus 是 201402L，说明系统默认的 Apple Clang 在 C++20 支持上存在不足或默认行为不符合预期。最彻底的解决办法是安装并使用上游的 LLVM/Clang。

安装 Homebrew 版 LLVM：
在终端执行：

```bash
brew install llvm
```

这会安装一个独立于 Apple 的、更新且对 C++20 支持更好的 Clang 编译器
让 CMake 使用新的编译器：
你不需要（也不建议）修改系统的全局 clang++ 链接。最干净的方式是在配置 CMake 时显式指定编译器路径。
在你 src/cpp-executor 目录下，执行：

```bash
rm -rf build
cmake -B build -DCMAKE_CXX_COMPILER=/opt/homebrew/opt/llvm/bin/clang++
cmake --build build -j4
```

这样，你的项目就会用上真正支持 C++20 的编译器。如果编译时找不到系统头文件，可能还需要额外传入 SDK 路径，但通常 Homebrew 的 Clang 能自行处理。
期望输出应为 #define \_\_cplusplus 202002L。

## 安装依赖

# 1. 进入你的 cpp-executor 目录

cd src/cpp-executor
mkdir -p third_party
cd third_party

# 2. 下载 node-addon-api (只需要头文件)

git clone https://github.com/nodejs/node-addon-api.git -b v7.1.0 --depth 1

# 3. 下载 nlohmann/json (只需要头文件)

git clone https://github.com/nlohmann/json.git -b v3.11.3 --depth 1

# 4. 下载 DuckDB 源码

# 注意：DuckDB 极其庞大，且如果只是想把它作为库包含进来，直接用它的 amalgamation 源码是最稳妥、编译最快的！

# 推荐下载 duckdb 的 amalgamation 压缩包并解压

curl -L https://github.com/duckdb/duckdb/releases/download/v1.1.3/libduckdb-src.zip -o duckdb-src.zip
unzip duckdb-src.zip -d duckdb
rm duckdb-src.zip

## 依赖安装好的目录结构

```bash
src/cpp-executor/
├── CMakeLists.txt
├── third_party/
│   ├── node-addon-api/
│   │   └── napi.h
│   ├── nlohmann/
│   │   └── json.hpp
│   └── duckdb/
│       ├── duckdb.cpp
│       └── duckdb.hpp
└── src/
    └── ...
```

## node-addon-api 的依赖安装

node-addon-api 的代码库包含了大量的文档、测试和构建脚本。在 C++ 项目中，我们实际上只需要头文件（napi.h 和 napi-inl.h），其他文件都不会参与 C++ 的编译。

## 修正 #include <node_api.h> 找不到的问题

查看系统 node-ap

```bash
node -p "require('path').join(require('os').homedir(), '.node-gyp', process.versions.node, 'include', 'node')"
#实际输出
/Users/songhuabiao/.node-gyp/24.2.0/include/node
```

就像之前说的，IntelliSense 的静态分析和真正的编译过程差异太大。
在 CMakeLists.txt 里加上：

```c
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
```

然后把 VS Code 的 .vscode/c_cpp_properties.json 改成：

```json
{
  "configurations": [
    {
      "name": "CMake",
      "configurationProvider": "ms-vscode.cmake-tools",
      "compileCommands": "${workspaceFolder}/build/compile_commands.json"
    }
  ],
  "version": 4
}
```

这是彻底终结这种“宏定义打架”问题的方法(需要先安装 cmake-tools 插件)。
