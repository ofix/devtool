#ifndef UTILS_H
#define UTILS_H

#include <string>
#include <vector>
#include <stdexcept>
#include <filesystem>
#include <cstdint>
#include <sstream>
#include <algorithm>
#include <fstream>      // 关键：添加ifstream所需头文件
#include <cstdio>       // snprintf所需
#include <cctype>       // isprint/isspace所需
#include <mutex>        // 通用mutex头文件
#include <thread>       // 线程相关
#ifdef _WIN32
#include <windows.h>    // Windows隐藏文件判断
#else
#include <unistd.h>     // Linux/Mac基础头文件
#endif

// 命名空间别名
namespace fs = std::filesystem;

// FNV-1a哈希（快速计算行/文件哈希）
inline uint64_t fnv1a_hash(const std::string& s) {
    uint64_t hash = 14695981039346656037ULL; // FNV偏移量
    for (char c : s) {
        hash ^= static_cast<uint8_t>(c);
        hash *= 1099511628211ULL; // FNV质数
    }
    return hash;
}

// 异常转字符串
inline std::string exception_to_string(const std::exception& e) {
    return std::string(e.what());
}

// 路径标准化（统一分隔符）
inline std::string normalize_path(const std::string& path) {
    fs::path p(path);
    return p.make_preferred().string();
}

// 判断隐藏文件（跨平台）
inline bool is_hidden_file(const fs::path& path) {
    if (path.empty()) return false;
#ifdef _WIN32
    // Windows：检查文件属性
    DWORD attr = GetFileAttributesA(path.string().c_str());
    return (attr != INVALID_FILE_ATTRIBUTES) && (attr & FILE_ATTRIBUTE_HIDDEN);
#else
    // Linux/Mac：文件名以.开头
    std::string filename = path.filename().string();
    return !filename.empty() && filename[0] == '.';
#endif
}

// 读取文本文件（按行拆分）
inline std::vector<std::string> read_text_file_lines(const std::string& file_path) {
    std::vector<std::string> lines;
    std::ifstream file(file_path);
    if (!file.is_open()) {
        throw std::runtime_error("Failed to open file: " + file_path);
    }
    std::string line;
    while (std::getline(file, line)) {
        lines.push_back(line);
    }
    return lines;
}

// 计算文件CRC32（简化版，实际可替换为zlib）
inline std::string calculate_crc32(const std::string& file_path) {
    std::ifstream file(file_path, std::ios::binary);
    if (!file.is_open()) {
        return "00000000";
    }
    uint32_t crc = 0xFFFFFFFF;
    char buf[4096];
    while (file.read(buf, sizeof(buf))) {
        for (size_t i = 0; i < file.gcount(); ++i) {
            crc = (crc >> 8) ^ ((uint32_t)static_cast<uint8_t>(buf[i]) << 24);
            for (int j = 0; j < 8; ++j) {
                crc = (crc << 1) ^ ((crc & 0x80000000) ? 0x04C11DB7 : 0);
            }
        }
    }
    // 处理剩余字节
    if (file.gcount() > 0) {
        std::streamsize bytes_read = file.gcount();
        for (std::streamsize i = 0; i < bytes_read; ++i) {
            crc = (crc >> 8) ^ ((uint32_t)static_cast<uint8_t>(buf[i]) << 24);
            for (int j = 0; j < 8; ++j) {
                crc = (crc << 1) ^ ((crc & 0x80000000) ? 0x04C11DB7 : 0);
            }
        }
    }
    crc = ~crc;
    char crc_str[9];
    snprintf(crc_str, sizeof(crc_str), "%08X", crc);
    return std::string(crc_str);
}

// 判断是否为文本文件（简化版：检查前1024字节是否有不可打印字符）
inline bool is_text_file(const std::string& file_path) {
    std::ifstream file(file_path, std::ios::binary);
    if (!file.is_open()) return false;
    char buf[1024];
    file.read(buf, sizeof(buf));
    size_t count = file.gcount();
    for (size_t i = 0; i < count; ++i) {
        if (buf[i] == 0) return false; // 二进制空字符
        if (!isprint(static_cast<unsigned char>(buf[i])) && !isspace(static_cast<unsigned char>(buf[i]))) {
            return false;
        }
    }
    return true;
}

// 获取相对路径
inline std::string get_relative_path(const std::string& root, const std::string& full_path) {
    fs::path root_path(root);
    fs::path full_path_obj(full_path);
    return fs::relative(full_path_obj, root_path).string();
}

#endif // UTILS_H