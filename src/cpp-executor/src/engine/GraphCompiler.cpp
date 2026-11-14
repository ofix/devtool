// src/cpp-executor/src/GraphCompiler.cpp
#include "GraphCompiler.h"
#include "../core/StepTrace.h"
#include "../operators/_types/Registry.h"
#include "PortTransformRegistry.h"
#include <algorithm>
#include <deque>
#include <nlohmann/json.hpp>
#include <optional>
#include <unordered_map>
#include <unordered_set>

namespace dataclean {
using json = nlohmann::json;

namespace {

// 内部模型
struct Graph {
    struct Node {
        std::string id;
        std::string type;
        std::string paramsRaw;
    };
    std::vector<Node> nodes;

    struct Edge {
        std::string fromNode;
        uint32_t fromPort = 0;
        std::string toNode;
        uint32_t toPort = 0;
        bool injected = false;
    };
    std::vector<Edge> edges;
};

struct PortEndpoint {
    std::string nodeId;
    uint32_t port = 0;
    bool operator==(const PortEndpoint &o) const noexcept { return port == o.port && nodeId == o.nodeId; }
};
struct PortEndpointHash {
    size_t operator()(const PortEndpoint &k) const noexcept {
        return std::hash<std::string>{}(k.nodeId) ^ (std::hash<uint32_t>{}(k.port) << 1);
    }
};

// 贯穿整个编译期的索引，避免每个 phase 重建
struct GraphIndex {
    std::unordered_map<std::string, size_t> nodeIdx;                   // nodeId -> nodes 下标
    std::unordered_map<PortEndpoint, size_t, PortEndpointHash> inEdge; // (toNode,toPort) -> edges 下标
};

GraphIndex BuildGraphIndex(const Graph &graph) {
    GraphIndex idx;
    idx.nodeIdx.reserve(graph.nodes.size());
    for (size_t i = 0; i < graph.nodes.size(); ++i) { idx.nodeIdx[graph.nodes[i].id] = i; }
    idx.inEdge.reserve(graph.edges.size());
    for (size_t i = 0; i < graph.edges.size(); ++i) { idx.inEdge[{graph.edges[i].toNode, graph.edges[i].toPort}] = i; }
    return idx;
}

// Phase 1: 解析
bool ParseGraph(std::string_view jsonStr, Graph &out, CompileError &err) {
    json g = json::parse(jsonStr, nullptr, false);
    if (g.is_discarded()) {
        err = {false, "JSON syntax parse failed", ""};
        return false;
    }
    if (!g.is_object() || !g.contains("nodes") || !g.contains("edges")) {
        err = {false, "Graph must contain 'nodes' and 'edges'", ""};
        return false;
    }

    for (const auto &jn : g["nodes"]) {
        if (!jn.contains("id") || !jn.contains("type")) {
            err = {false, "Node missing id/type", ""};
            return false;
        }
        Graph::Node n;
        n.id = jn["id"].get<std::string>();
        n.type = jn["type"].get<std::string>();
        n.paramsRaw = jn.contains("params") ? jn["params"].dump() : "{}";
        out.nodes.push_back(std::move(n));
    }

    for (const auto &je : g["edges"]) {
        if (!je.contains("fromNode") || !je.contains("toNode")) {
            err = {false, "Edge missing from/to", ""};
            return false;
        }
        Graph::Edge e;
        e.fromNode = je["fromNode"].get<std::string>();
        e.toNode = je["toNode"].get<std::string>();
        e.fromPort = je.value("fromPort", 0);
        e.toPort = je.value("toPort", 0);
        out.edges.push_back(std::move(e));
    }
    return true;
}

// Phase 2: 图结构与算子校验
bool ValidateGraphStructure(const Graph &graph, const GraphIndex &idx, CompileError &err) {
    std::unordered_map<std::string, const OperatorSpec *> specs;
    specs.reserve(graph.nodes.size());

    for (const auto &n : graph.nodes) {
        const auto *spec = FindOperatorSpec(n.type);
        if (!spec) {
            err = {false, "unknown operator type: " + n.type, n.id};
            return false;
        }
        specs[n.id] = spec;
    }

    std::unordered_set<PortEndpoint, PortEndpointHash> occupiedInPorts;
    for (const auto &e : graph.edges) {
        if (!idx.nodeIdx.count(e.fromNode)) {
            err = {false, "unknown fromNode: " + e.fromNode, e.fromNode};
            return false;
        }
        if (!idx.nodeIdx.count(e.toNode)) {
            err = {false, "unknown toNode: " + e.toNode, e.toNode};
            return false;
        }
        if (e.fromNode == e.toNode) {
            err = {false, "self-loop not allowed", e.fromNode};
            return false;
        }

        const auto *fromSpec = specs.at(e.fromNode);
        const auto *toSpec = specs.at(e.toNode);
        if (e.fromPort >= fromSpec->outputPortsCount) {
            err = {false, "fromPort out of bounds", e.fromNode};
            return false;
        }
        if (e.toPort >= toSpec->inputPortsCount) {
            err = {false, "toPort out of bounds", e.toNode};
            return false;
        }

        PortEndpoint ep{e.toNode, e.toPort};
        if (!occupiedInPorts.insert(ep).second) {
            err = {false, "multiple edges to same (node, port)", e.toNode};
            return false;
        }
    }
    return true;
}

// Phase 3: 子图裁剪（targetNodeId）
// 语义：返回所有可以抵达 target 的上游节点（含 target 自身）
std::unordered_set<std::string> CollectUpstream(const Graph &graph, const std::string &target) {
    std::unordered_map<std::string, std::vector<std::string>> rev;
    rev.reserve(graph.nodes.size());
    for (const auto &e : graph.edges) rev[e.toNode].push_back(e.fromNode);

    std::unordered_set<std::string> seen{target};
    std::vector<std::string> q{target};
    while (!q.empty()) {
        auto cur = std::move(q.back());
        q.pop_back();
        auto it = rev.find(cur);
        if (it == rev.end()) continue;
        for (const auto &up : it->second)
            if (seen.insert(up).second) q.push_back(up);
    }
    return seen;
}

// Phase 4: 拓扑排序 + 环检测
bool TopoSort(const Graph &graph,
              const GraphIndex &idx,
              const std::unordered_set<std::string> &allowed,
              std::vector<std::string> &order,
              CompileError &err) {
    auto isAllowed = [&](const std::string &id) { return allowed.empty() || allowed.count(id); };
    std::unordered_map<std::string, int> indeg;
    std::unordered_map<std::string, std::vector<std::string>> adj;
    indeg.reserve(graph.nodes.size());
    adj.reserve(graph.nodes.size());

    for (const auto &n : graph.nodes) {
        if (isAllowed(n.id)) {
            indeg[n.id] = 0;
            adj[n.id];
        }
    }
    for (const auto &e : graph.edges) {
        if (isAllowed(e.fromNode) && isAllowed(e.toNode)) {
            adj[e.fromNode].push_back(e.toNode);
            indeg[e.toNode]++;
        }
    }

    std::deque<std::string> q;
    for (const auto &[id, d] : indeg)
        if (d == 0) q.push_back(id);
    order.clear();
    while (!q.empty()) {
        auto id = q.front();
        q.pop_front();
        order.push_back(id);
        for (const auto &nxt : adj[id])
            if (--indeg[nxt] == 0) q.push_back(nxt);
    }
    if (order.size() != indeg.size()) {
        err = {false, "cycle detected in graph", ""};
        return false;
    }
    return true;
}

// Phase 5: 参数校验与解析
inline std::optional<json> TryParseParam(std::string_view raw, CompileError &err, std::string_view nodeId) {
    auto res = json::parse(raw, nullptr, false);
    if (res.is_discarded()) {
        err = {false, "invalid params json", std::string(nodeId)};
        return std::nullopt;
    }
    return res;
}

bool ValidateParamType(const json &val, ParamKind kind, std::string &outError) {
    switch (kind) {
    case ParamKind::kString:
    case ParamKind::kEnum:
    case ParamKind::kColumn:
    case ParamKind::kExpression:
        if (!val.is_string()) {
            outError = "expected string";
            return false;
        }
        break;
    case ParamKind::kNumber:
        if (!val.is_number()) {
            outError = "expected number";
            return false;
        }
        break;
    case ParamKind::kBoolean:
        if (!val.is_boolean()) {
            outError = "expected boolean";
            return false;
        }
        break;
    case ParamKind::kObject:
        if (!val.is_object()) {
            outError = "expected object";
            return false;
        }
        break;
    case ParamKind::kArray:
        if (!val.is_array()) {
            outError = "expected array";
            return false;
        }
        break;
    default:
        outError = "unsupported kind";
        return false;
    }
    return true;
}

bool ValidateParams(const OperatorSpec *spec, const json &params, const std::string &nodeId, CompileError &err) {
    if (spec->paramsCount == 0 && params.empty()) return true;
    if (!params.is_object()) {
        err = {false, "params must be object", nodeId};
        return false;
    }
    std::unordered_set<std::string> given;
    for (auto &[k, _] : params.items()) given.insert(k);
    for (uint8_t i = 0; i < spec->paramsCount; ++i) {
        const auto &pc = spec->params[i];
        std::string key(pc.key);
        bool present = given.count(key) > 0;
        if (pc.required && !present) {
            err = {false, "missing required param: " + key, nodeId};
            return false;
        }
        if (present) {
            std::string terr;
            if (!ValidateParamType(params[key], pc.kind, terr)) {
                err = {false, "param '" + key + "' " + terr, nodeId};
                return false;
            }
        }
    }
    for (const auto &k : given) {
        bool def = false;
        for (uint8_t i = 0; i < spec->paramsCount; ++i)
            if (spec->params[i].key == k) {
                def = true;
                break;
            }
        if (!def) {
            err = {false, "unknown param: " + k, nodeId};
            return false;
        }
    }
    return true;
}

// Phase 6: DAG 注入（无原地 erase，复杂度 O(E)）
struct InjectionResult {
    std::vector<std::string> injectedNodeIds; // 供 allowed 扩展使用
    int injectedCount = 0;
};

InjectionResult InjectTransforms(Graph &graph, const std::vector<std::string> &topoOrder) {
    InjectionResult result;
    if (topoOrder.empty()) return result;

    // 重建 index（注入前的快照）
    std::unordered_map<std::string, const OperatorSpec *> specs;
    specs.reserve(graph.nodes.size());
    for (const auto &n : graph.nodes) specs[n.id] = FindOperatorSpec(n.type);

    // (toNode, toPort) -> edges 下标，注入时用
    std::unordered_map<PortEndpoint, size_t, PortEndpointHash> inEdge;
    inEdge.reserve(graph.edges.size());
    for (size_t i = 0; i < graph.edges.size(); ++i) inEdge[{graph.edges[i].toNode, graph.edges[i].toPort}] = i;

    std::unordered_set<size_t> edgesToRemove;
    std::vector<Graph::Edge> newEdges;
    std::vector<Graph::Node> newNodes;

    for (const auto &id : topoOrder) {
        auto specIt = specs.find(id);
        if (specIt == specs.end()) continue;
        const auto *dsSpec = specIt->second;

        for (uint8_t pi = 0; pi < dsSpec->inputPortsCount; ++pi) {
            auto it = inEdge.find({id, pi});
            if (it == inEdge.end()) continue;
            size_t edgeIdx = it->second;
            const auto &e = graph.edges[edgeIdx];

            auto upSpecIt = specs.find(e.fromNode);
            if (upSpecIt == specs.end()) continue;
            const auto *upSpec = upSpecIt->second;
            if (upSpec->outputPortsCount == 0) continue;
            if (e.fromPort >= upSpec->outputPortsCount) continue;
            PortDataKind upKind = upSpec->outputPorts[e.fromPort].possibleResultKindsCount
                                      ? upSpec->outputPorts[e.fromPort].possibleResultKinds[0]
                                      : PortDataKind::kChunk;

            bool directMatch = false;
            for (uint8_t k = 0; k < dsSpec->inputPorts[pi].acceptedKindsCount; ++k) {
                if (dsSpec->inputPorts[pi].acceptedKinds[k] == upKind) {
                    directMatch = true;
                    break;
                }
            }
            if (directMatch) continue;

            std::vector<PortTransform> trs;
            for (const auto &rule : PortTransformRegistry::Instance().Rules()) {
                if (rule.from != upKind) continue;
                for (uint8_t k = 0; k < dsSpec->inputPorts[pi].acceptedKindsCount; ++k) {
                    if (dsSpec->inputPorts[pi].acceptedKinds[k] == rule.to) {
                        trs.push_back({rule.transformType, rule.from, rule.to});
                        break;
                    }
                }
                if (!trs.empty()) break;
            }
            if (trs.empty()) continue;

            // 标记原边待删
            edgesToRemove.insert(edgeIdx);

            // 串行拼接：upstream --(prevNode,prevPort)--> conv1 --> conv2 --> ... --> downstream
            std::string prevNode = e.fromNode;
            uint32_t prevPort = e.fromPort;
            for (const auto &t : trs) {
                std::string convId = "__conv_" + std::to_string(result.injectedCount++);
                Graph::Node cn;
                cn.id = convId;
                cn.type = t.transformType;
                cn.paramsRaw = "{}";
                newNodes.push_back(std::move(cn));
                specs[convId] = FindOperatorSpec(t.transformType);
                result.injectedNodeIds.push_back(convId);

                Graph::Edge e1;
                e1.fromNode = prevNode;
                e1.fromPort = prevPort;
                e1.toNode = convId;
                e1.toPort = 0;
                e1.injected = true;
                newEdges.push_back(std::move(e1));

                prevNode = convId;
                prevPort = 0;
            }
            Graph::Edge e2;
            e2.fromNode = prevNode;
            e2.fromPort = prevPort;
            e2.toNode = id;
            e2.toPort = pi;
            e2.injected = true;
            newEdges.push_back(std::move(e2));
        }
    }

    // 一次性重建 edges（避免迭代器失效）
    std::vector<Graph::Edge> finalEdges;
    finalEdges.reserve(graph.edges.size() + newEdges.size());
    for (size_t i = 0; i < graph.edges.size(); ++i) {
        if (!edgesToRemove.count(i)) finalEdges.push_back(std::move(graph.edges[i]));
    }
    for (auto &ne : newEdges) finalEdges.push_back(std::move(ne));
    graph.edges = std::move(finalEdges);

    // 追加新节点
    for (auto &nn : newNodes) graph.nodes.push_back(std::move(nn));

    return result;
}

} // namespace

// 主入口
CompileError
GraphCompiler::Compile(std::string_view graphJson, std::string_view targetNodeId, EtlTask &outTask, StepTraces *trace) {
    StepTraces localTraces;
    StepTraces &T = trace ? *trace : localTraces;
    CompileError err;
    outTask.nodes.clear();
    outTask.targetNodes.clear();

    Graph graph;

    // 1. 解析
    {
        ScopedTrace t(T, "parse");
        if (!ParseGraph(graphJson, graph, err)) return err;
    }

    // 2. 建索引（贯穿后续 phase）
    GraphIndex idx = BuildGraphIndex(graph);

    // 3. 图结构校验
    {
        ScopedTrace t(T, "validate_graph");
        if (!ValidateGraphStructure(graph, idx, err)) return err;
    }

    // 4. 子图裁剪
    std::unordered_set<std::string> allowed;
    {
        ScopedTrace t(T, "subgraph");
        if (!targetNodeId.empty()) {
            if (!idx.nodeIdx.count(std::string(targetNodeId)))
                return {false, "target node not found", std::string(targetNodeId)};
            allowed = CollectUpstream(graph, std::string(targetNodeId));
        }
    }

    // 5. 参数校验（批量解析 + .at 保护）
    std::unordered_map<std::string, json> parsedParams;
    {
        ScopedTrace t(T, "validate_params");
        for (const auto &n : graph.nodes) {
            if (!allowed.empty() && !allowed.count(n.id)) continue;
            auto j = TryParseParam(n.paramsRaw, err, n.id);
            if (!j) return err;
            parsedParams[n.id] = std::move(*j);
        }
        for (const auto &n : graph.nodes) {
            if (!allowed.empty() && !allowed.count(n.id)) continue;
            const auto *spec = FindOperatorSpec(n.type);
            if (!ValidateParams(spec, parsedParams.at(n.id), n.id, err)) return err;
        }
    }

    // 6. 拓扑排序（注入前）
    std::vector<std::string> order;
    {
        ScopedTrace t(T, "topo_sort");
        if (!TopoSort(graph, idx, allowed, order, err)) return err;
    }

    // 7. DAG 注入
    InjectionResult injectRes;
    {
        ScopedTrace t(T, "dag_inject");
        injectRes = InjectTransforms(graph, order);
    }

    // 8. 更新 allowed + 重建索引 + 重新拓扑
    {
        ScopedTrace t(T, "topo_sort_after_inject");
        for (const auto &id : injectRes.injectedNodeIds) allowed.insert(id);
        idx = BuildGraphIndex(graph);
        if (!TopoSort(graph, idx, allowed, order, err)) return err;
    }

    // 9. 组装 EtlTask（使用 idx 做 O(1) 查找）
    {
        ScopedTrace t(T, "build_etltask");
        std::unordered_map<std::string, std::vector<OutputPort>> outPortsMap;
        outPortsMap.reserve(graph.nodes.size());

        for (const auto &id : order) {
            auto &nodeModel = graph.nodes[idx.nodeIdx.at(id)];
            const auto *spec = FindOperatorSpec(nodeModel.type);

            NodeTask nt;
            nt.nodeId = id;
            nt.operatorType = nodeModel.type;
            nt.executeMode = spec->executeMode;
            nt.spec = spec;
            nt.paramsRaw = nodeModel.paramsRaw;
            nt.params = std::move(parsedParams.at(id));

            for (uint8_t i = 0; i < spec->outputPortsCount; ++i) {
                OutputPort op;
                op.index = i;
                op.resultKind = spec->outputPorts[i].possibleResultKindsCount
                                    ? spec->outputPorts[i].possibleResultKinds[0]
                                    : PortDataKind::kChunk;
                nt.outputs.push_back(op);
            }
            outPortsMap[id] = nt.outputs;

            for (uint8_t i = 0; i < spec->inputPortsCount; ++i) {
                InputPort ip;
                ip.index = i;
                auto it = idx.inEdge.find({id, i});
                if (it != idx.inEdge.end()) {
                    const auto &e = graph.edges[it->second];
                    ip.upstreamNodeId = e.fromNode;
                    ip.upstreamOutputPortIndex = e.fromPort;
                    ip.upstreamResultKind = outPortsMap.at(e.fromNode)[e.fromPort].resultKind;
                    ip.recordSetKind = ip.upstreamResultKind;
                }
                nt.inputs.push_back(std::move(ip));
            }
            outTask.nodes.push_back(std::move(nt));
        }
    }

    if (!targetNodeId.empty()) outTask.targetNodes.push_back(std::string(targetNodeId));
    return err;
}

} // namespace dataclean