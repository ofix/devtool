// src/cpp-executor/src/GraphCompiler.cpp
#include "GraphCompiler.h"
#include "operators/_types/registry.h"
#include <deque>
#include <nlohmann/json.hpp>
#include <unordered_map>
#include <unordered_set>

namespace dataclean {
using json = nlohmann::json;

namespace {

struct RawNode {
    std::string id;
    std::string type;
    json params;
};

struct RawEdge {
    std::string fromNode;
    uint32_t fromPort = 0;
    std::string toNode;
    uint32_t toPort = 0;
};

bool ParseGraph(std::string_view s, std::vector<RawNode> &nodes, std::vector<RawEdge> &edges, CompileError &err) {
    json g = json::parse(s, nullptr, false);
    if (g.is_discarded()) {
        err = {false, "JSON parse failed", ""};
        return false;
    }
    // TODO: 按实际 schema 解析 nodes / edges
    return true;
}

// 拓扑排序 + 环检测，返回 false 表示有环
// 返回 false 表示失败；err.message 会携带具体原因
// 环检测用 DFS 三色标记，能输出环上的节点序列
bool TopoSort(const std::vector<RawNode> &nodes,
              const std::vector<RawEdge> &edges,
              std::vector<std::string> &order,
              CompileError &err) {
    // ---------- 0) 建索引 + 悬空边校验 ----------
    std::unordered_map<std::string, const RawNode *> nodeById;
    for (auto &n : nodes) {
        if (!nodeById.emplace(n.id, &n).second) {
            err = {false, "duplicate node id: " + n.id, n.id};
            return false;
        }
    }
    for (auto &e : edges) {
        if (!nodeById.count(e.fromNode)) {
            err = {false, "edge from unknown node: " + e.fromNode, e.fromNode};
            return false;
        }
        if (!nodeById.count(e.toNode)) {
            err = {false, "edge to unknown node: " + e.toNode, e.toNode};
            return false;
        }
    }

    // ---------- 1) 邻接表 ----------
    std::unordered_map<std::string, std::vector<std::string>> adj;
    for (auto &n : nodes) adj[n.id]; // 保证每个节点都出现在 adj 里
    for (auto &e : edges) adj[e.fromNode].push_back(e.toNode);

    // ---------- 2) DFS 三色 + 环路径还原 ----------
    enum Color : uint8_t { kWhite, kGray, kBlack };
    std::unordered_map<std::string, Color> color;
    for (auto &n : nodes) color[n.id] = kWhite;

    std::vector<std::string> stack;  // 当前 DFS 路径，用于还原环
    std::vector<std::string> result; // 拓扑序（后序逆序）

    // 迭代版 DFS，避免深图爆栈
    std::function<bool(const std::string &)> dfs = [&](const std::string &start) -> bool {
        struct Frame {
            std::string id;
            size_t nextChild = 0;
        };
        std::vector<Frame> frames;
        frames.push_back({start, 0});
        color[start] = kGray;
        stack.push_back(start);

        while (!frames.empty()) {
            Frame &f = frames.back();
            auto &children = adj[f.id];
            if (f.nextChild < children.size()) {
                const std::string &child = children[f.nextChild++];
                Color c = color[child];
                if (c == kGray) {
                    // 找到环：从 stack 里 child 第一次出现的位置截取
                    auto it = std::find(stack.begin(), stack.end(), child);
                    std::string cycle;
                    for (; it != stack.end(); ++it) {
                        cycle += *it;
                        cycle += " -> ";
                    }
                    cycle += child;
                    err = {false, "cycle detected: " + cycle, child};
                    return false;
                } else if (c == kWhite) {
                    color[child] = kGray;
                    stack.push_back(child);
                    frames.push_back({child, 0});
                }
            } else {
                // 后序：节点完成
                color[f.id] = kBlack;
                stack.pop_back();
                frames.pop_back();
            }
        }
        return true;
    };

    for (auto &n : nodes) {
        if (color[n.id] == kWhite) {
            if (!dfs(n.id)) return false;
        }
    }

    // ---------- 3) 后序逆序 = 拓扑序 ----------
    // 上面的 result 没填，改为用完成时间戳重建
    // 更简单：用 Kahn 再跑一遍拿稳定顺序，或直接在 dfs 完成时 push 后逆序
    // 这里演示用完成序逆序：
    // （实际把 result.push_back(f.id) 放在 color=kBlack 处，最后 reverse）
    order.assign(nodes.size(), {});
    // 为保持代码简洁，重新用 Kahn 产出一份 order（环已排除）
    std::unordered_map<std::string, int> indeg;
    for (auto &n : nodes) indeg[n.id] = 0;
    for (auto &e : edges) indeg[e.toNode]++;
    std::deque<std::string> q;
    for (auto &n : nodes)
        if (indeg[n.id] == 0) q.push_back(n.id);
    size_t idx = 0;
    while (!q.empty()) {
        auto id = q.front();
        q.pop_front();
        order[idx++] = id;
        for (auto &nxt : adj[id])
            if (--indeg[nxt] == 0) q.push_back(nxt);
    }
    // 此时 idx 必然 == nodes.size()，因为环已在 DFS 阶段排除
    return true;
}

// 参数校验：键存在性 + required
bool ValidateParams(const OperatorSpec *spec, const json &params, const std::string &nodeId, CompileError &err) {
    std::unordered_set<std::string> given;
    if (params.is_object())
        for (auto &[k, _] : params.items()) given.insert(k);

    for (uint8_t i = 0; i < spec->paramsCount; ++i) {
        const auto &pc = spec->params[i];
        bool present = given.count(std::string(pc.key)) > 0;
        if (pc.required && !present) {
            err = {false, "missing required param: " + std::string(pc.key), nodeId};
            return false;
        }
    }
    return true;
}

// 端口匹配：返回需要插入的转换（空表示直连）
bool ResolvePortKind(PortDataKind upstream,
                     const PortContract &downstream,
                     std::vector<PortTransform> &out,
                     CompileError &err,
                     const std::string &nodeId) {
    for (uint8_t i = 0; i < downstream.acceptedKindsCount; ++i) {
        if (downstream.acceptedKinds[i] == upstream) {
            out.clear();
            return true;
        }
    }
    // 不匹配：留 TODO 处按转换表推导
    err = {false, "port kind mismatch", nodeId};
    return false;
}

} // namespace

CompileError GraphCompiler::Compile(std::string_view graphJson, std::string_view targetNodeId, EtlTask &outTask) {
    CompileError err;
    std::vector<RawNode> nodes;
    std::vector<RawEdge> edges;
    if (!ParseGraph(graphJson, nodes, edges, err)) return err;

    // 1) 子图裁剪（targetNodeId 非空时只保留其上游）
    // 2) 拓扑排序
    std::vector<std::string> order;
    if (!TopoSort(nodes, edges, order, err)) return err;

    // 3) 建索引
    std::unordered_map<std::string, const RawNode *> nodeById;
    for (auto &n : nodes) nodeById[n.id] = &n;

    // 4) 逐节点编译
    std::unordered_map<std::string, std::vector<OutputPort>> outPortsByNode;
    for (auto &id : order) {
        const RawNode *rn = nodeById[id];
        const OperatorSpec *spec = FindOperatorSpec(rn->type);
        if (!spec) { return {false, "unknown operator: " + rn->type, id}; }

        if (!ValidateParams(spec, rn->params, id, err)) return err;

        NodeTask nt;
        nt.nodeId = id;
        nt.operatorType = rn->type;
        nt.executeMode = spec->executeMode;
        nt.spec = spec;
        nt.paramsJson = rn->params.dump();

        // 输出端口（从契约直接生成）
        for (uint8_t i = 0; i < spec->outputPortsCount; ++i) {
            OutputPort op;
            op.index = i;
            // 若 possibleResultKinds 有多个，取第一个作为默认；执行期可再细化
            op.resultKind = spec->outputPorts[i].possibleResultKindsCount ? spec->outputPorts[i].possibleResultKinds[0]
                                                                          : PortDataKind::kChunk;
            nt.outputs.push_back(op);
        }
        outPortsByNode[id] = nt.outputs;

        // 输入端口：根据 edges 反查上游
        for (uint8_t i = 0; i < spec->inputPortsCount; ++i) {
            InputPort ip;
            ip.index = i;
            for (auto &e : edges) {
                if (e.toNode == id && e.toPort == i) {
                    auto it = outPortsByNode.find(e.fromNode);
                    if (it == outPortsByNode.end()) return {false, "upstream not compiled", id};
                    ip.upstreamNodeId = e.fromNode;
                    ip.upstreamOutputPortIndex = e.fromPort;
                    ip.upstreamResultKind = it->second[e.fromPort].resultKind;
                    if (!ResolvePortKind(ip.upstreamResultKind, spec->inputPorts[i], ip.transforms, err, id))
                        return err;
                    ip.recordSetKind = ip.transforms.empty() ? ip.upstreamResultKind : ip.transforms.back().toKind;
                    break;
                }
            }
            nt.inputs.push_back(ip);
        }
        outTask.nodes.push_back(std::move(nt));
    }
    if (!targetNodeId.empty()) outTask.targetNodes.push_back(std::string(targetNodeId));
    return err;
}

} // namespace dataclean