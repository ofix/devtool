#ifndef FILE_COMPARE_H
#define FILE_COMPARE_H

#include "utils.h"
#include "thread_pool.h"
#include "myers_diff.h"
#include <unordered_map>
#include <atomic>
#include <mutex>
#include <future>
#include <chrono>

// 文件信息结构体
struct FileInfo {
    std::string full_path;
    std::string rel_path;
    uint64_t size;
    std::string crc32;
    bool is_text;
};

// 单文件差异结果
struct FileDiffResult {
    std::string rel_path;
    bool is_text;
    std::string error;
    std::vector<std::pair<DiffType, std::string>> diffs;
};

// 文件夹差异结果
struct FolderDiffResult {
    struct DiffFiles {
        std::vector<FileInfo> added;    // B有A无
        std::vector<FileInfo> deleted;  // A有B无
        std::vector<FileInfo> modified; // 路径相同内容不同
        std::vector<FileInfo> same;     // 完全相同
    } diffs;
    uint64_t total_files = 0;
    std::string error;
};

// 文件对比核心类
class FileCompare {
public:
    FileCompare();
    
    // 多线程扫描文件夹
    std::unordered_map<std::string, FileInfo> scan_folder(const std::string& folder_path, bool ignore_hidden);
    
    // 文件夹对比（对标BeyondCompare）
    FolderDiffResult compare_folders(const std::string& folder_a, const std::string& folder_b, bool ignore_hidden);
    
    // 单文件对比（Myers算法）
    FileDiffResult compare_files(const std::string& file_a, const std::string& file_b);

private:
    ThreadPool pool; // 全局线程池
};

#endif // FILE_COMPARE_H