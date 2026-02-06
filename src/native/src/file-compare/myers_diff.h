#ifndef MYERS_DIFF_H
#define MYERS_DIFF_H

#include <vector>
#include <string>
#include <unordered_map>
#include <cstdint>
#include <algorithm>
#include <numeric>

// 差异类型定义
enum DiffType {
    DELETE = 0,  // A有B无
    ADD = 1,     // B有A无
    SAME = 2     // 相同
};

// 差异结果结构体
struct DiffResult {
    DiffType type;
    std::string content;
};

// Myers差分算法核心实现
inline std::vector<DiffResult> myers_diff(const std::vector<std::string>& a, const std::vector<std::string>& b) {
    int n = a.size(), m = b.size();
    if (n == 0 && m == 0) return {};
    if (n == 0) {
        std::vector<DiffResult> res;
        for (const auto& line : b) res.push_back({ADD, line});
        return res;
    }
    if (m == 0) {
        std::vector<DiffResult> res;
        for (const auto& line : a) res.push_back({DELETE, line});
        return res;
    }

    // 预计算B的哈希索引（加速匹配）
    std::unordered_map<uint64_t, std::vector<int>> b_hash_map;
    for (int i = 0; i < m; ++i) {
        b_hash_map[fnv1a_hash(b[i])].push_back(i);
    }

    const int max_d = n + m;
    std::vector<int> v(2 * max_d + 1, 0);
    std::vector<std::vector<std::pair<int, int>>> trace;

    // Myers算法主循环
    for (int d = 0; d <= max_d; ++d) {
        trace.emplace_back();
        for (int k = -d; k <= d; k += 2) {
            int x = (k == -d || (k != d && v[k - 1 + max_d] < v[k + 1 + max_d])) 
                    ? v[k + 1 + max_d] : v[k - 1 + max_d] + 1;
            int y = x - k;

            // 快速跳过连续匹配的行（哈希+内容双重验证）
            while (x < n && y < m) {
                uint64_t hash_a = fnv1a_hash(a[x]);
                uint64_t hash_b = fnv1a_hash(b[y]);
                if (hash_a == hash_b && a[x] == b[y]) {
                    x++; y++;
                } else {
                    break;
                }
            }

            v[k + max_d] = x;
            trace.back().emplace_back(x, y);

            // 找到完整路径
            if (x >= n && y >= m) goto reconstruct_path;
        }
    }

reconstruct_path:
    // 路径重构（从后往前）
    std::vector<DiffResult> result;
    int x = n, y = m;
    for (int d = trace.size() - 1; d >= 0; --d) {
        auto& step = trace[d];
        int k = x - y;
        int prev_k = (k == -d || (k != d && v[k - 1 + max_d] < v[k + 1 + max_d])) ? k + 1 : k - 1;
        
        int prev_x = (prev_k == k + 1) ? v[prev_k + max_d] : v[prev_k + max_d] + 1;
        int prev_y = prev_x - prev_k;

        // 输出差异
        while (x > prev_x && y > prev_y) {
            x--; y--;
            result.push_back({SAME, a[x]});
        }
        while (x > prev_x) {
            x--;
            result.push_back({DELETE, a[x]});
        }
        while (y > prev_y) {
            y--;
            result.push_back({ADD, b[y]});
        }
    }

    // 反转结果恢复顺序
    std::reverse(result.begin(), result.end());
    return result;
}

#endif // MYERS_DIFF_H