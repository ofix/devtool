#ifndef UTILS_H
#define UTILS_H

#include <string>
#include <vector>
#include <filesystem>
#include <fstream>
#include <zlib.h>
#include <stdexcept>
#include <sstream>

// 跨平台路径分隔符
#ifdef _WIN32
#define PATH_SEP "\\"
#define PATH_SEP_CHAR '\\'
#else
#define PATH_SEP "/"
#define PATH_SEP_CHAR '/'
#endif

// 命名空间别名
namespace fs = std::filesystem;

// 路径标准化：统一转换为正斜杠，处理末尾分隔符
inline std::string normalize_path(const std::string& path) {
    std::string res = path;
#ifdef _WIN32
    std::replace(res.begin(), res.end(), '\\', '/');
#endif
    // 移除末尾分隔符
    if (!res.empty() && (res.back() == '/' || res.back() == '\\')) {
        res.pop_back();
    }
    return res;
}

// 获取相对路径（基于根目录）
inline std::string get_relative_path(const std::string& root, const std::string& file) {
    fs::path root_path(normalize_path(root));
    fs::path file_path(normalize_path(file));
    return fs::relative(file_path, root_path).string();
}

// 判断是否为隐藏文件（跨平台）
inline bool is_hidden_file(const fs::path& path) {
    try {
#ifdef _WIN32
        // Windows：判断文件属性
        DWORD attr = GetFileAttributesA(path.string().c_str());
        return (attr != INVALID_FILE_ATTRIBUTES) && (attr & FILE_ATTRIBUTE_HIDDEN);
#else
        // macOS/Linux：文件名以.开头
        std::string filename = path.filename().string();
        return !filename.empty() && filename[0] == '.';
#endif
    } catch (...) {
        return false;
    }
}

// 判断是否为文本文件（简单魔数判断，比后缀更准确）
inline bool is_text_file(const std::string& file_path) {
    std::ifstream file(file_path, std::ios::binary | std::ios::ate);
    if (!file) return false;
    std::streampos size = file.tellg();
    if (size == 0) return true; // 空文件视为文本
    file.seekg(0);
    char buf[1024];
    file.read(buf, std::min((std::streampos)1024, size));
    std::streamsize read = file.gcount();
    // 检查是否包含空字节（二进制文件特征）
    for (std::streamsize i = 0; i < read; ++i) {
        if (buf[i] == 0) return false;
    }
    return true;
}

// 计算文件CRC32（流式，支持大文件，zlib硬件加速）
inline std::string calculate_crc32(const std::string& file_path) {
    std::ifstream file(file_path, std::ios::binary);
    if (!file) {
        throw std::runtime_error("Failed to open file: " + file_path);
    }
    uLong crc = crc32(0L, Z_NULL, 0);
    char buf[8192]; // 8K缓冲区，平衡IO和内存
    while (file.read(buf, sizeof(buf))) {
        crc = crc32(crc, (const Bytef*)buf, file.gcount());
    }
    // 处理剩余字节
    if (file.gcount() > 0) {
        crc = crc32(crc, (const Bytef*)buf, file.gcount());
    }
    if (!file.eof()) {
        throw std::runtime_error("Read file error: " + file_path);
    }
    // 转换为16进制字符串
    char crc_str[9];
    snprintf(crc_str, sizeof(crc_str), "%08x", (unsigned int)crc);
    return std::string(crc_str);
}

// 异常信息转换为字符串
inline std::string exception_to_string(const std::exception& e) {
    return std::string(e.what());
}

// 分割字符串（用于行级对比）
inline std::vector<std::string> split_lines(const std::string& content) {
    std::vector<std::string> lines;
    std::stringstream ss(content);
    std::string line;
    while (std::getline(ss, line)) {
        lines.push_back(line);
    }
    // 处理最后一行无换行的情况
    if (!content.empty() && content.back() != '\n') {
        lines.push_back(line);
    }
    return lines;
}

// 读取文件内容（文本文件）
inline std::string read_text_file(const std::string& file_path) {
    std::ifstream file(file_path, std::ios::in);
    if (!file) {
        throw std::runtime_error("Failed to open text file: " + file_path);
    }
    return std::string((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
}

#endif // UTILS_H