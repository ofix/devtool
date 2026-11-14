// src/cpp-executor/src/StepTrace.h
#pragma once
#include <chrono>
#include <cstdio>
#include <nlohmann/json.hpp>
#include <string>
#include <vector>

namespace dataclean {

// ---------- 单个步骤的记录 ----------
struct StepTrace {
    std::string name;
    double ms = 0.0;
};

// ---------- 步骤追踪集合：收集、打印、序列化 ----------
struct StepTraces {
    std::vector<StepTrace> steps;

    StepTraces() { steps.reserve(16); }

    void Mark(const char *step, std::chrono::steady_clock::time_point start) noexcept {
        auto end = std::chrono::steady_clock::now();
        double ms = std::chrono::duration<double, std::milli>(end - start).count();
        steps.push_back({step, ms});
    }

    void Print(const std::string &title = "Step Traces") const {
        std::printf("\n================ [%s] ================\n", title.c_str());
        std::printf("%-30s : %10s\n", "Step", "Time (ms)");
        std::printf("-------------------------------------------------\n");
        double totalMs = 0.0;
        for (auto &s : steps) {
            std::printf("  - %-26s : %8.3f ms\n", s.name.c_str(), s.ms);
            totalMs += s.ms;
        }
        std::printf("-------------------------------------------------\n");
        std::printf("  %-26s : %8.3f ms\n", "Total", totalMs);
        std::printf("=================================================\n\n");
    }

    nlohmann::json ToJson() const {
        nlohmann::json j;
        double totalMs = 0.0;
        auto &arr = j["steps"];
        for (auto &s : steps) {
            arr.push_back({{"name", s.name}, {"ms", s.ms}});
            totalMs += s.ms;
        }
        j["totalMs"] = totalMs;
        return j;
    }

    std::string ToJsonString(int indent = 2) const { return ToJson().dump(indent); }
};

// ---------- RAII 探针：记录单个步骤的耗时 ----------
struct ScopedTrace {
    StepTraces &traces;
    const char *name;
    std::chrono::steady_clock::time_point start;

    ScopedTrace(StepTraces &t, const char *n) noexcept : traces(t), name(n), start(std::chrono::steady_clock::now()) {}

    ~ScopedTrace() noexcept { traces.Mark(name, start); }

    ScopedTrace(const ScopedTrace &) = delete;
    ScopedTrace &operator=(const ScopedTrace &) = delete;
};

} // namespace dataclean