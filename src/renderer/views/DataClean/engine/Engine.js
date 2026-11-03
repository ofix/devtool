import { getOperator } from "./operators/index.js";
import { inferDataCategory } from "./runtime/InferCategory.js";

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
            inputs.push(upstream || { rows: [], columns: [], dataCategory: "table" });
        }

        if (op.meta.inputs > 0) {
            const hasMissing = incoming.some((e) => !this.datasetStore.getDataset(e.source));
            if (incoming.length === 0 || hasMissing) {
                this.metaStore.markStale(nodeId, "上游无数据");
                return null;
            }
        }

        try {
            // 将上游的 dataCategory 透传给算子
            const result = op.execute(inputs, node.params || {}, {
                log: context.log || (() => {}),
                rawText: resolveRawText(node, context),
                nodeId,
                datasetStore: this.datasetStore,
                metaStore: this.metaStore,
            });

            // 推断输出形态
            const finalCategory = result.dataCategory || inferDataCategory(result.rows);
            
            const normalized = {
                rows: result.rows || [],
                columns: result.columns || [],
                dataCategory: finalCategory
            };

            this.datasetStore.setDataset(nodeId, normalized);
            
            this.metaStore.updateMeta(nodeId, {
                rowCount: normalized.rows.length,
                columns: normalized.columns,
                dataCategory: finalCategory,
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

    // ... (保留原有的 invalidateDownstream 和 invalidateAll 逻辑，无需改动)
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
            for (const edge of outgoing) queue.push(edge.target);
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
    if (node.params && typeof node.params.rawText === "string") return node.params.rawText;
    return context && context.rawText ? context.rawText : "";
}
