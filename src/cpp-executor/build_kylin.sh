#!/bin/bash
# 麒麟上使用 GCC 10
export CC=/usr/bin/gcc-10
export CXX=/usr/bin/g++-10
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j$(nproc)