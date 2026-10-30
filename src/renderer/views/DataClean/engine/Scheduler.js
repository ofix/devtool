// 调度器：拓扑排序 + 异步执行 + 进度上报

/**
 * 对图做拓扑排序（Kahn 算法）
 * 只考虑两端都存在的边，避免孤儿边污染
 * @param {object[]} nodes
 * @param {object[]} edges
 * @returns {string[]} 拓扑顺序的节点 id
 */
export function topoSort(nodes, edges) {
    const indegree = new Map();
    const adj = new Map();
    const nodeIds = new Set();

    for (const n of nodes) {
        indegree.set(n.id, 0);
        adj.set(n.id, []);
        nodeIds.add(n.id);
    }

    for (const e of edges) {
        if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
        indegree.set(e.target, indegree.get(e.target) + 1);
        adj.get(e.source).push(e.target);
    }

    const queue = [];
    for (const [id, deg] of indegree.entries()) {
        if (deg === 0) queue.push(id);
    }

    const order = [];
    while (queue.length > 0) {
        const id = queue.shift();
        order.push(id);
        for (const next of adj.get(id)) {
            const deg = indegree.get(next) - 1;
            indegree.set(next, deg);
            if (deg === 0) queue.push(next);
        }
    }

    // 有环时返回已排出部分，调用方可据此判断 cycle
    return order;
}

/**
 * 检测图是否有环（拓扑排序长度 != 节点数）
 * @param {object[]} nodes
 * @param {object[]} edges
 * @returns {boolean}
 */
export function hasCycle(nodes, edges) {
    return topoSort(nodes, edges).length !== nodes.length;
}

/**
 * 调度器：按拓扑顺序执行，节点之间让出事件循环
 */
export default class Scheduler {
    /**
     * @param {Engine} engine
     */
    constructor(engine) {
        this.engine = engine;
        this.running = false;
    }

    /**
     * 执行整图
     * @param {object[]} nodes
     * @param {object[]} edges
     * @param {object} [context] { log, onProgress, rawTextByNode }
     */
    async runAll(nodes, edges, context = {}) {
        if (this.running) return;
        this.running = true;
        try {
            if (hasCycle(nodes, edges)) {
                if (context.log) context.log("检测到环路，无法执行", "error");
                return;
            }
            const order = topoSort(nodes, edges);
            for (let i = 0; i < order.length; i++) {
                const id = order[i];
                const nodeContext = {
                    log: context.log,
                    rawText: context.rawTextByNode ? context.rawTextByNode[id] : undefined,
                };
                await this.engine.runNode(id, nodeContext);
                if (context.onProgress) {
                    context.onProgress({ current: i + 1, total: order.length, nodeId: id });
                }
                await yieldToEventLoop();
            }
        } finally {
            this.running = false;
        }
    }

    /**
     * 从指定节点起执行其及下游
     * @param {string} startId
     * @param {object[]} nodes
     * @param {object[]} edges
     * @param {object} [context]
     */
    async runFrom(startId, nodes, edges, context = {}) {
        if (this.running) return;
        this.running = true;
        try {
            if (hasCycle(nodes, edges)) {
                if (context.log) context.log("检测到环路，无法执行", "error");
                return;
            }
            const order = topoSort(nodes, edges);
            const idx = order.indexOf(startId);
            if (idx < 0) return;

            const sub = order.slice(idx);
            for (let i = 0; i < sub.length; i++) {
                const id = sub[i];
                const nodeContext = {
                    log: context.log,
                    rawText: context.rawTextByNode ? context.rawTextByNode[id] : undefined,
                };
                await this.engine.runNode(id, nodeContext);
                if (context.onProgress) {
                    context.onProgress({ current: i + 1, total: sub.length, nodeId: id });
                }
                await yieldToEventLoop();
            }
        } finally {
            this.running = false;
        }
    }
}

/**
 * 让出事件循环，避免长任务卡住 UI
 * @returns {Promise<void>}
 */
function yieldToEventLoop() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}
