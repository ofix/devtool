#ifndef FILE_COMPARE_H
#define FILE_COMPARE_H

#include <string>
#include <unordered_map>
#include <vector>
#include <future>
#include "thread_pool.h"
#include "utils.h"

// 文件信息结构体（扫描结果）
struct FileInfo {
    std::string full_path;  // 绝对路径
    std::string rel_path;   // 相对根目录的路径
    uint64_t size;          // 文件大小（字节）
    std::string crc32;      // CRC32哈希
    bool is_text;           // 是否为文本文件
};

// 单文件比对结果
struct FileDiffResult {
    std::string rel_path;   // 相对路径
    bool is_text;           // 是否为文本文件
    std::vector<std::pair<int, std::string>> diffs; // 差异行：(类型, 内容) 0-删除 1-新增 2-相同
    std::string error;      // 错误信息（非空则失败）
};

// 文件夹比对结果分类
struct FolderDiffCategory {
    std::vector<FileInfo> added;    // 新增（B有，A无）
    std::vector<FileInfo> deleted;  // 删除（A有，B无）
    std::vector<FileInfo> modified; // 修改（路径相同，CRC32不同）
    std::vector<FileInfo> same;     // 相同（路径+CRC32都相同）
};

// 文件夹比对总结果
struct FolderDiffResult {
    FolderDiffCategory diffs;       // 差异分类
    uint64_t total_files;           // 总文件数
    std::string error;              // 错误信息（非空则失败）
};

// 核心文件比对类
class FileCompare {
public:
    FileCompare();
    ~FileCompare() = default;

    // 扫描文件夹（多线程），返回文件信息映射（key：相对路径）
    std::unordered_map<std::string, FileInfo> scan_folder(const std::string& folder_path, bool ignore_hidden = true);

    // 文件夹比对（A:原文件夹，B:目标文件夹）
    FolderDiffResult compare_folders(const std::string& folder_a, const std::string& folder_b, bool ignore_hidden = true);

    // 单文件比对（文本行级/二进制字节级）
    FileDiffResult compare_files(const std::string& file_a, const std::string& file_b);

private:
    ThreadPool pool; // 全局线程池
};

#endif // FILE_COMPARE_H