cmake_minimum_required(VERSION 3.20)
project(dataclean_executor CXX)

# ── 1. 基础编译设置
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
endif()
set(CMAKE_CXX_FLAGS_RELEASE "-O3 -DNDEBUG")

# 生成 compile_commands.json，供 VS Code IntelliSense 使用
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# SQLite3（唯一还需要 find_package 的系统库）
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

# ── 2. 源文件自动收集
file(GLOB TYPE_SOURCES CONFIGURE_DEPENDS "src/operators/_types/*.cpp")

file(GLOB_RECURSE OPERATOR_SOURCES CONFIGURE_DEPENDS
    "src/operators/readers/*.cpp"
    "src/operators/workflow/*.cpp"
    "src/operators/transform/*.cpp"
    "src/operators/barrier/*.cpp"
    "src/operators/writers/*.cpp"
    "src/operators/_converters/*.cpp"
)

# ── 3. 定义动态链接库 (.node)
add_library(dataclean_executor SHARED
  src/bindings/Entry.cpp
  src/core/DuckDBSession.cpp
  src/engine/EtlEngine.cpp
  src/engine/GraphCompiler.cpp
  src/engine/OperatorFactory.cpp
  src/engine/PortTransformRegistry.cpp
  src/engine/Scheduler.cpp
  # DuckDB 本地 amalgamation 源码
  third_party/duckdb/duckdb.cpp
  ${TYPE_SOURCES}
  ${OPERATOR_SOURCES}
)

target_compile_features(dataclean_executor PRIVATE cxx_std_20)

# ── 4. 头文件包含路径
target_include_directories(dataclean_executor PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/src
  ${CMAKE_CURRENT_SOURCE_DIR}/src/core
  ${CMAKE_CURRENT_SOURCE_DIR}/src/engine
  ${CMAKE_CURRENT_SOURCE_DIR}/src/operators
  ${CMAKE_CURRENT_SOURCE_DIR}/src/operators/_types
  ${CMAKE_CURRENT_SOURCE_DIR}/src/util
  # 第三方库本地路径
  ${CMAKE_CURRENT_SOURCE_DIR}/third_party/node-addon-api
  ${CMAKE_CURRENT_SOURCE_DIR}/third_party/nlohmann
  ${CMAKE_CURRENT_SOURCE_DIR}/third_party/duckdb
  ${NODE_API_INCLUDE_DIR}
)

# ── 5. 链接依赖库
target_link_libraries(dataclean_executor PRIVATE
  SQLite::SQLite3
  dl
  pthread
)

# ── 6. 编译警告与跨平台选项
if(CMAKE_CXX_COMPILER_ID MATCHES "Clang|GNU")
  target_compile_options(dataclean_executor PRIVATE 
    -Wall 
    -Wextra 
    -Wno-unused-parameter
    -Wno-deprecated-declarations
  )
endif()

# ── 7. 产物命名设置
set_target_properties(dataclean_executor PROPERTIES
  PREFIX ""                
  SUFFIX ".node"           
  OUTPUT_NAME "dataclean_executor"
)

# ── 8. 测试目标
enable_testing()

add_executable(test_transform_matrix 
  src/test/test_transform_matrix.cpp
  third_party/duckdb/duckdb.cpp
  ${TYPE_SOURCES}
  ${OPERATOR_SOURCES}
)

target_compile_features(test_transform_matrix PRIVATE cxx_std_20)

target_include_directories(test_transform_matrix PRIVATE 
  ${CMAKE_CURRENT_SOURCE_DIR}/src
  ${CMAKE_CURRENT_SOURCE_DIR}/src/operators
  ${CMAKE_CURRENT_SOURCE_DIR}/src/operators/_types
  ${CMAKE_CURRENT_SOURCE_DIR}/third_party/nlohmann
  ${CMAKE_CURRENT_SOURCE_DIR}/third_party/duckdb
)

target_link_libraries(test_transform_matrix PRIVATE 
  SQLite::SQLite3
  dl
  pthread
)

add_test(NAME transform_matrix COMMAND test_transform_matrix)