#!/bin/bash
# 设置使用 Homebrew 的 LLVM
export CC=/opt/homebrew/opt/llvm/bin/clang
export CXX=/opt/homebrew/opt/llvm/bin/clang++
# 清理旧缓存并重新生成（可选，第一次建意加上，后续日常开发可去掉 rm）
# rm -rf build
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j$(sysctl -n hw.ncpu)