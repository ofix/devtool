#include "file_compare.h"

FileCompare::FileCompare() : pool(ThreadPool()) {}

// 多线程扫描文件夹（线程池+任务计数）
std::unordered_map<std::string, FileInfo> FileCompare::scan_folder(const std::string& folder_path, bool ignore_hidden) {
    std::unordered_map<std::string, FileInfo> file_map;
    std::mutex map_mutex;
    fs::path root_path(normalize_path(folder_path));
    std::atomic<uint64_t> task_count = 0;

    // 检查文件夹有效性
    if (!fs::exists(root_path) || !fs::is_directory(root_path)) {
        throw std::runtime_error("Invalid folder path: " + folder_path);
    }

    // 递归遍历函数
    std::function<void(const fs::path&)> traverse = [&](const fs::path& current_path) {
        try {
            for (const auto& entry : fs::directory_iterator(current_path, fs::directory_options::skip_permission_denied)) {
                if (entry.is_directory()) {
                    traverse(entry.path()); // 递归子文件夹
                } else if (entry.is_regular_file()) {
                    if (ignore_hidden && is_hidden_file(entry.path())) continue;
                    
                    task_count++;
                    pool.enqueue([&, entry, root_path]() {
                        try {
                            std::string full_path = entry.path().string();
                            std::string rel_path = get_relative_path(root_path.string(), full_path);
                            uint64_t size = fs::file_size(entry.path());
                            std::string crc = calculate_crc32(full_path);
                            bool is_text = is_text_file(full_path);

                            FileInfo info{
                                .full_path = full_path,
                                .rel_path = rel_path,
                                .size = size,
                                .crc32 = crc,
                                .is_text = is_text
                            };

                            std::lock_guard<std::mutex> lock(map_mutex);
                            file_map[rel_path] = info;
                        } catch (...) {
                            // 单个文件处理失败，忽略
                        }
                        task_count--;
                    });
                }
            }
        } catch (const std::exception& e) {
            throw std::runtime_error("Traverse error: " + exception_to_string(e));
        }
    };

    // 执行遍历并等待所有任务完成
    traverse(root_path);
    while (task_count > 0) {
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }

    return file_map;
}

// 文件夹对比（并行扫描+哈希快速对比）
FolderDiffResult FileCompare::compare_folders(const std::string& folder_a, const std::string& folder_b, bool ignore_hidden) {
    FolderDiffResult result;
    try {
        // 并行扫描两个文件夹
        auto future_a = std::async(std::launch::async, &FileCompare::scan_folder, this, folder_a, ignore_hidden);
        auto future_b = std::async(std::launch::async, &FileCompare::scan_folder, this, folder_b, ignore_hidden);
        
        auto map_a = future_a.get();
        auto map_b = future_b.get();

        // 总文件数（去重）
        result.total_files = map_a.size() + map_b.size();

        // 遍历A的文件，对比B
        for (const auto& [rel_path, info_a] : map_a) {
            auto it_b = map_b.find(rel_path);
            if (it_b == map_b.end()) {
                result.diffs.deleted.push_back(info_a); // A有B无
            } else {
                if (info_a.crc32 != it_b->second.crc32) {
                    result.diffs.modified.push_back(info_a); // 内容不同
                } else {
                    result.diffs.same.push_back(info_a); // 完全相同
                    result.total_files--; // 去重
                }
                map_b.erase(it_b); // 标记已处理
            }
        }

        // 剩余B的文件：新增
        for (const auto& [rel_path, info_b] : map_b) {
            result.diffs.added.push_back(info_b);
        }

    } catch (const std::exception& e) {
        result.error = exception_to_string(e);
    }
    return result;
}

// 单文件对比（Myers算法+文本/二进制区分）
FileDiffResult FileCompare::compare_files(const std::string& file_a, const std::string& file_b) {
    FileDiffResult result;
    try {
        // 基础校验
        if (!fs::exists(file_a) || !fs::is_regular_file(file_a)) {
            result.error = "File A not exists: " + file_a;
            return result;
        }
        if (!fs::exists(file_b) || !fs::is_regular_file(file_b)) {
            result.error = "File B not exists: " + file_b;
            return result;
        }

        // 基础信息
        result.rel_path = fs::path(file_a).filename().string();
        result.is_text = is_text_file(file_a) && is_text_file(file_b);

        if (result.is_text) {
            // 文本文件：Myers算法行级对比
            auto lines_a = read_text_file_lines(file_a);
            auto lines_b = read_text_file_lines(file_b);
            auto diffs = myers_diff(lines_a, lines_b);
            
            // 转换为结果格式
            for (const auto& diff : diffs) {
                result.diffs.emplace_back(diff.type, diff.content);
            }
        } else {
            // 二进制文件：CRC32对比
            std::string crc_a = calculate_crc32(file_a);
            std::string crc_b = calculate_crc32(file_b);
            
            if (crc_a == crc_b) {
                result.diffs.emplace_back(SAME, "Binary file is identical");
            } else {
                result.diffs.emplace_back(DELETE, "Binary file A: " + fs::path(file_a).filename().string());
                result.diffs.emplace_back(ADD, "Binary file B: " + fs::path(file_b).filename().string());
            }
        }

    } catch (const std::exception& e) {
        result.error = exception_to_string(e);
    }
    return result;
}