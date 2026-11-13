cmake_minimum_required(VERSION 3.20)
project(dataclean_executor CXX)

# ── 基础编译设置
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# 如果处于 Release 模式，开启 O3 优化（ETL 引擎对性能敏感）
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
endif()
set(CMAKE_CXX_FLAGS_RELEASE "-O3 -DNDEBUG")

# ── 拉取依赖库
include(FetchContent)

# 1. node-addon-api
FetchContent_Declare(
  node_addon_api
  GIT_REPOSITORY https://github.com/nodejs/node-addon-api.git
  GIT_TAG        v7.1.0
)
FetchContent_MakeAvailable(node_addon_api)

# 2. nlohmann/json
FetchContent_Declare(
  nlohmann_json
  GIT_REPOSITORY https://github.com/nlohmann/json.git
  GIT_TAG        v3.11.3
)
FetchContent_MakeAvailable(nlohmann_json)

# 3. DuckDB (amalgamation 源码编译)
FetchContent_Declare(
  duckdb
  GIT_REPOSITORY https://github.com/duckdb/duckdb.git
  GIT_TAG        v1.1.3
  GIT_SHALLOW    TRUE
)
set(BUILD_UNITTESTS OFF CACHE BOOL "" FORCE)
set(BUILD_SHELL     OFF CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(duckdb)

# 4. SQLite3 (系统库)
find_package(SQLite3 REQUIRED)

# ── 源文件自动收集
# 收集 _types 下的契约定义 (readers.cpp, workflow.cpp, 等)
file(GLOB TYPE_SOURCES "src/operators/_types/*.cpp")

# 收集所有具体的算子实现
file(GLOB_RECURSE OPERATOR_SOURCES 
    "src/operators/readers/*.cpp"
    "src/operators/workflow/*.cpp"
    "src/operators/transform/*.cpp"
    "src/operators/barrier/*.cpp"
    "src/operators/writers/*.cpp"
)

# ── 定义动态链接库 (.node)
add_library(dataclean_executor SHARED
  # 核心逻辑
  src/AddonEntry.cpp
  src/DuckDBBridge.cpp
  src/EtlTaskRunner.cpp
  src/ExecThread.cpp
  src/Operators.cpp
  src/PreviewCache.cpp
  
  # 算子契约与实现
  ${TYPE_SOURCES}
  ${OPERATOR_SOURCES}
)

# ── 头文件包含路径
target_include_directories(dataclean_executor PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/src
  ${CMAKE_CURRENT_SOURCE_DIR}/src/operators
  ${CMAKE_CURRENT_SOURCE_DIR}/src/operators/_types
  ${CMAKE_CURRENT_SOURCE_DIR}/src/util
  ${node_addon_api_SOURCE_DIR}/include
  ${NODE_API_INCLUDE_DIR}
)

# ── 链接依赖库
target_link_libraries(dataclean_executor PRIVATE
  node-addon-api
  nlohmann_json::nlohmann_json
  duckdb
  SQLite::SQLite3
)

# ── 编译警告与选项 ──────────────────────────────────────────────
target_compile_options(dataclean_executor PRIVATE 
  -Wall 
  -Wextra 
  -Wno-unused-parameter
)

# ── 产物命名设置
set_target_properties(dataclean_executor PROPERTIES
  PREFIX ""                # 去掉 lib 前缀
  SUFFIX ".node"           # 设定 Node 插件后缀
  OUTPUT_NAME "dataclean_executor"
)

# ── 测试目标──
enable_testing()

add_executable(test_transform_matrix 
  src/test/test_transform_matrix.cpp
  # 测试也需要链接契约定义，如果算子实现也需要的话也可以加上
  ${TYPE_SOURCES}
  ${OPERATOR_SOURCES}
)

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