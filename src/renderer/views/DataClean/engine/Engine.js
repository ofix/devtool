// 执行引擎：修复由于参数更新导致的数据丢失问题
import { getOperator } from "./operators/index.js";
import { inferColumns } from "./runtime/Dataset.js";

export default class Engine {
    constructor({ metaStore, datasetStore, graphStore }) {
        this.metaStore = metaStore;
        this.datasetStore = datasetStore;
        this.graphStore = graphStore;
    }

    async runNode(nodeId, context = {}) {
        const node = this.graphStore.getNode(nodeId);
        if (!node) return null;

        const op = getOperator(node.type);
        if (!op) return null;

        const inputs = [];
        const incoming = this.graphStore.getIncomingEdges(nodeId);
        for (const edge of incoming) {
            const upstream = this.datasetStore.getDataset(edge.source);
            inputs.push(upstream || { rows: [], columns: [] });
        }

        // 如果是有输入的节点，且上游没数据（断线/未运行），直接标记 stale 跳过
        if (op.meta.inputs > 0) {
            const hasMissing = incoming.some((e) => !this.datasetStore.getDataset(e.source));
            if (incoming.length === 0 || hasMissing) {
                this.metaStore.markStale(nodeId, "上游无数据");
                return null;
            }
        }

        try {
            const result = op.execute(inputs, node.params || {}, {
                log: context.log || (() => {}),
                rawText: resolveRawText(node, context),
                nodeId,
                datasetStore: this.datasetStore,
                metaStore: this.metaStore,
            });

            const normalized = normalizeResult(result, inputs);
            this.datasetStore.setDataset(nodeId, normalized);
            
            // 运行成功，更新 Meta 为最新，清除 stale 和 error
            this.metaStore.updateMeta(nodeId, {
                rowCount: normalized.rows.length,
                columns: normalized.columns,
                columnsVersion: Date.now(),
                stale: false,
                staleReason: null,
                error: null,
            });
            return normalized;
        } catch (err) {
            this.metaStore.setError(nodeId, err.message || String(err));
            if (context.log) context.log(`[${node.type}] ${err.message}`, "error");
            return null;
        }
    }

    async runAll(order, context = {}) {
        for (const nodeId of order) {
            await this.runNode(nodeId, context);
        }
    }

    // 修复：清空缓存时，Input 节点保留 rawText，其他节点直接清空
    invalidateDownstream(nodeId, reason = "参数已变更") {
        const visited = new Set();
        const queue = [nodeId];
        while (queue.length > 0) {
            const id = queue.shift();
            if (visited.has(id)) continue;
            visited.add(id);

            this.datasetStore.removeDataset(id);
            this.metaStore.markStale(id, reason);

            const outgoing = this.graphStore.getOutgoingEdges(id);
            for (const edge of outgoing) {
                queue.push(edge.target);
            }
        }
    }

    invalidateAll() {
        for (const node of this.graphStore.nodes) {
            this.datasetStore.removeDataset(node.id);
            this.metaStore.markStale(node.id, "管线已变更");
        }
    }
}

function resolveRawText(node, context) {
    if (node.params && typeof node.params.rawText === "string") {
        return node.params.rawText;
    }
    return context && context.rawText ? context.rawText : "";
}

function normalizeResult(result, inputs = []) {
    if (result === null || result === undefined) return { rows: [], columns: [] };
    if (Array.isArray(result)) return { rows: result, columns: inferFromRows(result, inputs) };
    if (Array.isArray(result.rows)) {
        return {
            rows: result.rows,
            columns: Array.isArray(result.columns) && result.columns.length > 0
                ? result.columns : inferFromRows(result.rows, inputs),
        };
    }
    return { rows: [], columns: [] };
}

function inferFromRows(rows, inputs = []) {
    if (rows.length > 0) {
        const keys = Object.keys(rows[0]);
        return keys.map((name) => ({ name, type: "string" }));
    }
    if (inputs.length > 0 && Array.isArray(inputs[0].columns)) return inputs[0].columns.slice();
    return [];
}
