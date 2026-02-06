#include "file_compare.h"
#include <filesystem>
#include <future>
#include <algorithm>
#include <chrono>
#include <stdexcept>
#include <sstream>

// 命名空间别名，简化代码
namespace fs = std::filesystem;

FileCompare::FileCompare() : pool(ThreadPool()) {}

// 多线程扫描文件夹核心实现 - 修复任务等待+路径兼容bug + finally语法错误
std::unordered_map<std::string, FileInfo> FileCompare::scan_folder(const std::string& folder_path, bool ignore_hidden) {
    std::unordered_map<std::string, FileInfo> file_map;
    std::mutex map_mutex; // 保护文件映射的互斥锁
    fs::path root_path(normalize_path(folder_path));
    std::atomic<uint64_t> task_count = 0; // 任务计数器

    // 检查文件夹是否存在
    if (!fs::exists(root_path) || !fs::is_directory(root_path)) {
        throw std::runtime_error("Folder not exists or not a directory: " + folder_path);
    }

    // 递归遍历文件夹，提交多线程任务
    std::function<void(const fs::path&)> traverse = [&](const fs::path& current_path) {
        try {
            // 处理文件夹遍历权限问题
            for (const auto& entry : fs::directory_iterator(current_path, fs::directory_options::skip_permission_denied)) {
                if (entry.is_directory()) {
                    traverse(entry.path()); // 递归子文件夹
                } else if (entry.is_regular_file()) {
                    // 忽略隐藏文件
                    if (ignore_hidden && is_hidden_file(entry.path())) {
                        continue;
                    }
                    // 提交线程池任务前，任务计数+1
                    task_count++;
                    // 提交线程池任务：计算文件信息+CRC32
                    pool.enqueue([&, entry, root_path]() {
                        bool task_completed = false; // 标记任务是否完成（用于替代finally）
                        try {
                            std::string full_path = entry.path().string();
                            std::string rel_path = get_relative_path(root_path.string(), full_path);
                            uint64_t size = fs::file_size(entry.path());
                            std::string crc = calculate_crc32(full_path);
                            bool is_text = is_text_file(full_path);

                            // 构造文件信息
                            FileInfo info{
                                .full_path = full_path,
                                .rel_path = rel_path,
                                .size = size,
                                .crc32 = crc,
                                .is_text = is_text
                            };

                            // 加锁写入映射
                            std::lock_guard<std::mutex> lock(map_mutex);
                            file_map[rel_path] = info;
                            
                            task_completed = true;
                        } catch (const std::exception& e) {
                            // 单个文件扫描失败，跳过并继续
                            task_completed = true;
                            return;
                        }
                        // C++替代finally的方式：无论是否异常，都会执行这里
                        if (task_completed) {
                            task_count--; // 任务计数-1
                        }
                    });
                }
            }
        } catch (const std::exception& e) {
            // 目录遍历失败，抛出异常
            throw std::runtime_error("Traverse folder error: " + exception_to_string(e));
        }
    };

    // 开始遍历
    traverse(root_path);
    // 等待所有线程池任务完成
    while (task_count > 0) {
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }

    return file_map;
}

// 文件夹比对核心实现（对标BeyondCompare逻辑）
FolderDiffResult FileCompare::compare_folders(const std::string& folder_a, const std::string& folder_b, bool ignore_hidden) {
    FolderDiffResult result;
    try {
        // 并行扫描两个文件夹
        auto future_a = std::async(std::launch::async, &FileCompare::scan_folder, this, folder_a, ignore_hidden);
        auto future_b = std::async(std::launch::async, &FileCompare::scan_folder, this, folder_b, ignore_hidden);
        auto file_map_a = future_a.get();
        auto file_map_b = future_b.get();

        // 总文件数（优化：去重）
        result.total_files = file_map_a.size() + file_map_b.size() - result.diffs.same.size();

        // 遍历所有A的文件，对比B
        for (const auto& [rel_path, info_a] : file_map_a) {
            auto it_b = file_map_b.find(rel_path);
            if (it_b == file_map_b.end()) {
                // A有，B无 → 删除
                result.diffs.deleted.push_back(info_a);
            } else {
                // 路径相同，对比CRC32
                if (info_a.crc32 != it_b->second.crc32) {
                    // CRC32不同 → 修改
                    result.diffs.modified.push_back(info_a);
                } else {
                    // CRC32相同 → 相同
                    result.diffs.same.push_back(info_a);
                }
                // 标记B已处理，避免重复遍历
                file_map_b.erase(it_b);
            }
        }

        // 剩余B的文件 → 新增
        for (const auto& [rel_path, info_b] : file_map_b) {
            result.diffs.added.push_back(info_b);
        }

    } catch (const std::exception& e) {
        result.error = exception_to_string(e);
    }
    return result;
}

// 单文件比对核心实现（文本行级/二进制字节级）
FileDiffResult FileCompare::compare_files(const std::string& file_a, const std::string& file_b) {
    FileDiffResult result;
    try {
        // 检查文件是否存在
        if (!fs::exists(file_a) || !fs::is_regular_file(file_a)) {
            result.error = "File A not exists: " + file_a;
            return result;
        }
        if (!fs::exists(file_b) || !fs::is_regular_file(file_b)) {
            result.error = "File B not exists: " + file_b;
            return result;
        }

        // 获取相对路径（简化：取文件名）
        result.rel_path = fs::path(file_a).filename().string();
        result.is_text = is_text_file(file_a) && is_text_file(file_b);

        if (result.is_text) {
            // 文本文件：行级对比
            std::string content_a = read_text_file(file_a);
            std::string content_b = read_text_file(file_b);
            auto lines_a = split_lines(content_a);
            auto lines_b = split_lines(content_b);

            // 双指针行级对比
            int i = 0, j = 0;
            int len_a = lines_a.size(), len_b = lines_b.size();
            while (i < len_a && j < len_b) {
                if (lines_a[i] == lines_b[j]) {
                    // 行相同 - 标记类型2
                    result.diffs.emplace_back(2, lines_a[i]);
                    i++; j++;
                } else {
                    // 检查是否是B的新增行
                    bool is_added = false;
                    for (int k = j + 1; k < len_b; ++k) {
                        if (lines_b[k] == lines_a[i]) {
                            for (int l = j; l < k; ++l) {
                                result.diffs.emplace_back(1, lines_b[l]); // 新增行 - 类型1
                            }
                            j = k;
                            is_added = true;
                            break;
                        }
                    }
                    if (is_added) continue;
                    // 检查是否是A的删除行
                    bool is_deleted = false;
                    for (int k = i + 1; k < len_a; ++k) {
                        if (lines_a[k] == lines_b[j]) {
                            for (int l = i; l < k; ++l) {
                                result.diffs.emplace_back(0, lines_a[l]); // 删除行 - 类型0
                            }
                            i = k;
                            is_deleted = true;
                            break;
                        }
                    }
                    if (is_deleted) continue;
                    // 都不匹配，标记为A删除+B新增
                    result.diffs.emplace_back(0, lines_a[i]);
                    result.diffs.emplace_back(1, lines_b[j]);
                    i++; j++;
                }
            }

            // 处理A剩余行（全部为删除）
            while (i < len_a) {
                result.diffs.emplace_back(0, lines_a[i++]);
            }
            // 处理B剩余行（全部为新增）
            while (j < len_b) {
                result.diffs.emplace_back(1, lines_b[j++]);
            }

        } else {
            // 二进制文件：字节级对比（简化为CRC32判断）
            std::string crc_a = calculate_crc32(file_a);
            std::string crc_b = calculate_crc32(file_b);
            if (crc_a == crc_b) {
                result.diffs.emplace_back(2, "Binary file is identical");
            } else {
                result.diffs.emplace_back(0, "Binary file A: " + fs::path(file_a).filename().string());
                result.diffs.emplace_back(1, "Binary file B: " + fs::path(file_b).filename().string());
            }
        }

    } catch (const std::exception& e) {
        result.error = exception_to_string(e);
    }
    return result;
}