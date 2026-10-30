// 管线序列化：只序列化配置，不包含数据
export function serializePipeline(graphStore) {
    return {
        version: 1,
        createdAt: new Date().toISOString(),
        nodes: graphStore.nodes.map(n => ({
            id: n.id,
            type: n.type,
            params: { ...n.params, rawText: undefined }, // 不保存文件内容
            position: { ...n.position },
        })),
        edges: graphStore.edges.map(e => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
        })),
    };
}
