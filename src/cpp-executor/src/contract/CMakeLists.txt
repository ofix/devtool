cmake_minimum_required(VERSION 3.20)
project(dataclean_executor CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include(FetchContent)

# ── node-addon-api ──────────────────────────────────────────────
FetchContent_Declare(
  node_addon_api
  GIT_REPOSITORY https://github.com/nodejs/node-addon-api.git
  GIT_TAG        v7.1.0
)
FetchContent_MakeAvailable(node_addon_api)

# ── nlohmann/json ───────────────────────────────────────────────
FetchContent_Declare(
  nlohmann_json
  GIT_REPOSITORY https://github.com/nlohmann/json.git
  GIT_TAG        v3.11.3
)
FetchContent_MakeAvailable(nlohmann_json)

# ── DuckDB（amalgamation，无需 vcpkg）───────────────────────────
FetchContent_Declare(
  duckdb
  GIT_REPOSITORY https://github.com/duckdb/duckdb.git
  GIT_TAG        v1.1.3
  GIT_SHALLOW    TRUE
)
set(BUILD_UNITTESTS OFF CACHE BOOL "" FORCE)
set(BUILD_SHELL     OFF CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(duckdb)

# ── SQLite3（系统或 vcpkg）──────────────────────────────────────
find_package(SQLite3 REQUIRED)

# ── Addon ───────────────────────────────────────────────────────
add_library(dataclean_executor SHARED
  src/DuckDBBridge.cpp
  src/PreviewCache.cpp
  src/Operators.cpp
  src/EtlTaskRunner.cpp
  src/ExecThread.cpp
  src/AddonEntry.cpp
)

target_include_directories(dataclean_executor PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/src
  ${node_addon_api_SOURCE_DIR}/include
  # N-API 头来自 Electron；构建时由 electron-rebuild 注入
  ${NODE_API_INCLUDE_DIR}
)

target_link_libraries(dataclean_executor PRIVATE
  node-addon-api
  nlohmann_json::nlohmann_json
  duckdb
  SQLite::SQLite3
)

set_target_properties(dataclean_executor PROPERTIES
  PREFIX ""                # 去掉 lib 前缀
  SUFFIX ".node"
  OUTPUT_NAME "dataclean_executor"
)

# ── 测试 ────────────────────────────────────────────────────────
enable_testing()
add_executable(test_transform_matrix test/test_transform_matrix.cpp)
target_include_directories(test_transform_matrix PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
add_test(NAME transform_matrix COMMAND test_transform_matrix)