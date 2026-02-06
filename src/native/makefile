# Makefile
CXX = g++
CXXFLAGS = -std=c++11 -Wall -Wextra  # 包含common目录，启用C++11
LDFLAGS = -lX11  # 链接X11库

# 目标程序名
TARGET = window_info_tool

# 源文件
SRC = src/window-info/linux/window_enumerator.cc

# 主编译目标
all: $(TARGET)

# 编译链接生成可执行文件
$(TARGET): $(SRC)
	$(CXX) $(CXXFLAGS) $(SRC) -o $(TARGET) $(LDFLAGS)

# 清理编译产物
clean:
	rm -f $(TARGET)

# make clean && make CXXFLAGS="-std=c++11 -Wall -Wextra  -g"
