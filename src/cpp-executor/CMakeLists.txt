cmake_minimum_required(VERSION 3.20)
project(dataclean_executor CXX)

# ── 1. 基础编译设置 (修正标准落地方式)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# 必须在 target 级别强制要求标准，防止 Apple Clang 静默降级
# （我们会在 add_library 之后调用 target_compile_features）

# 如果处于 Release 模式，开启 O3 优化
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
endif()
# 跨平台兼容的 O3 设置（避免覆盖默认的架构参数）
set(CMAKE_CXX_FLAGS_RELEASE "-O3 -DNDEBUG")

# # ── 2. 拉取依赖库
# include(FetchContent)

# # node-addon-api
# FetchContent_Declare(
#   node_addon_api
#   GIT_REPOSITORY https://github.com/nodejs/node-addon-api.git
#   GIT_TAG        v7.1.0
# )
# FetchContent_MakeAvailable(node_addon_api)

# # nlohmann/json
# FetchContent_Declare(
#   nlohmann_json
#   GIT_REPOSITORY https://github.com/nlohmann/json.git
#   GIT_TAG        v3.11.3
# )
# FetchContent_MakeAvailable(nlohmann_json)

# # DuckDB
# FetchContent_Declare(
#   duckdb
#   GIT_REPOSITORY https://github.com/duckdb/duckdb.git
#   GIT_TAG        v1.1.3
#   GIT_SHALLOW    TRUE
# )
# set(BUILD_UNITTESTS OFF CACHE BOOL "" FORCE)
# set(BUILD_SHELL     OFF CACHE BOOL "" FORCE)
# FetchContent_MakeAvailable(duckdb)

# SQLite3
find_package(SQLite3 REQUIRED)

# 寻找 Node.js 头文件
find_path(NODE_API_INCLUDE_DIR
  NAMES node_api.h
  PATHS 
    "/opt/homebrew/include/node"
    "/opt/homebrew/Cellar/node/*/include/node"
    "$ENV{HOME}/.node-gyp/*/include/node"
    "/usr/local/include/node"
    "/usr/include/node"
  PATH_SUFFIXES "include/node"
)
if(NOT NODE_API_INCLUDE_DIR)
  message(FATAL_ERROR "找不到 node_api.h，请检查 Node.js 安装")
endif()

# ── 3. 源文件自动收集
# 建议加上 CONFIGURE_DEPENDS，防止新增/删除 .cpp 文件时 CMake 不自动刷新
file(GLOB TYPE_SOURCES CONFIGURE_DEPENDS "src/operators/_types/*.cpp")

file(GLOB_RECURSE OPERATOR_SOURCES CONFIGURE_DEPENDS
    "src/operators/readers/*.cpp"
    "src/operators/workflow/*.cpp"
    "src/operators/transform/*.cpp"
    "src/operators/barrier/*.cpp"
    "src/operators/writers/*.cpp"
)

# ── 4. 定义动态链接库 (.node)
add_library(dataclean_executor SHARED
  src/AddonEntry.cpp
  src/DuckDBBridge.cpp
  src/EtlTaskRunner.cpp
  src/ExecThread.cpp
  src/Operators.cpp
  src/PreviewCache.cpp
  
  ${TYPE_SOURCES}
  ${OPERATOR_SOURCES}
)

# 【核心修复】目标级别强制 C++20。如果编译器不支持，直接报错，绝不偷偷降级。
target_compile_features(dataclean_executor PRIVATE cxx_std_20)

# ── 5. 头文件包含路径
target_include_directories(dataclean_executor PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/src
  ${CMAKE_CURRENT_SOURCE_DIR}/src/operators
  ${CMAKE_CURRENT_SOURCE_DIR}/src/operators/_types
  ${CMAKE_CURRENT_SOURCE_DIR}/src/util
  # 第三方库本地路径
  ${CMAKE_CURRENT_SOURCE_DIR}/third_party/node-addon-api
  ${CMAKE_CURRENT_SOURCE_DIR}/third_party/nlohmann
  ${CMAKE_CURRENT_SOURCE_DIR}/third_party/duckdb
  ${NODE_API_INCLUDE_DIR}
)

# ── 6. 链接依赖库
target_link_libraries(dataclean_executor PRIVATE
  node-addon-api
  nlohmann_json::nlohmann_json
  duckdb
  SQLite::SQLite3
  dl
  pthread
)

# ── 7. 编译警告与跨平台选项
if(CMAKE_CXX_COMPILER_ID MATCHES "Clang|GNU")
  target_compile_options(dataclean_executor PRIVATE 
    -Wall 
    -Wextra 
    -Wno-unused-parameter
        # 屏蔽 DuckDB 源码可能引发的警告
    -Wno-deprecated-declarations
  )
endif()

# ── 8. 产物命名设置 (跨平台后缀适配)
set_target_properties(dataclean_executor PROPERTIES
  PREFIX ""                
  SUFFIX ".node"           
  OUTPUT_NAME "dataclean_executor"
)

# ── 9. 测试目标
enable_testing()

add_executable(test_transform_matrix 
  src/test/test_transform_matrix.cpp
  ${TYPE_SOURCES}
  ${OPERATOR_SOURCES}
)

# 测试目标同样强制 C++20
target_compile_features(test_transform_matrix PRIVATE cxx_std_20)

target_include_directories(test_transform_matrix PRIVATE 
  ${CMAKE_CURRENT_SOURCE_DIR}/src
  ${CMAKE_CURRENT_SOURCE_DIR}/src/operators
  ${CMAKE_CURRENT_SOURCE_DIR}/src/operators/_types
)

target_link_libraries(test_transform_matrix PRIVATE 
  nlohmann_json::nlohmann_json
  duckdb
)

add_test(NAME transform_matrix COMMAND test_transform_matrix)