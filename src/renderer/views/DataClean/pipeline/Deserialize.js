// 管线反序列化：加载回画布
export function deserializePipeline(json, graphStore) {
    try {
        const data = typeof json === "string" ? JSON.parse(json) : json;
        if (!data.nodes || !data.edges) {
            throw new Error("管线 JSON 结构不正确");
        }

        graphStore.clear();
        for (const n of data.nodes) {
            graphStore.addNode({
                id: n.id,
                type: n.type,
                params: n.params || {},
                position: n.position || { x: 0, y: 0 },
            });
        }
        for (const e of data.edges) {
            graphStore.addEdge(e);
        }
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}
