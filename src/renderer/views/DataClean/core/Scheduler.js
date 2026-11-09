import TaskContext from "./runtime/TaskContext.js";

export default class Scheduler {
  constructor({ engine, graphStore, metaStore, previewStore }) {
    this.engine = engine;
    this.graphStore = graphStore;
    this.metaStore = metaStore;
    this.previewStore = previewStore;
    this.activeTasks = new Map();
  }

  async runTask(projectId, targetNodeId = null, runMode = "preview", options = {}) {
    const ctx = new TaskContext(projectId, runMode, runMode === "preview" ? "high" : "low");
    ctx.log = options.log || ((msg, level = "info") => console.log(`[Scheduler]`, msg));

    const nodesToRun = this._collectSubgraph(targetNodeId);
    const { sorted: sortedNodes } = this._topoSort(Array.from(nodesToRun));

    const handleCache = new Map();
    this.activeTasks.set(ctx.taskId, ctx);
    let currentNodeId = null;

    try {
      for (const nodeId of sortedNodes) {
        if (ctx.signal.aborted) throw new Error("任务被用户取消");
        currentNodeId = nodeId;

        const node = this.graphStore.getNode(nodeId);
        const inputs = this._collectInputs(node, handleCache);

        ctx.log(`执行节点: ${node.type} (${nodeId})`);
        const startTime = performance.now();
        const resultHandle = await this.engine.runNode(node.type, inputs, node.params || {}, ctx);
        const duration = performance.now() - startTime;

        ctx.log(`节点执行完成，耗时 ${duration.toFixed(2)}ms`);

        handleCache.set(nodeId, resultHandle);
        this.metaStore.updateMeta(nodeId, {
          columns: resultHandle.schema || [],
          rowCount: resultHandle.rowCount ?? -1,
          dataCategory: resultHandle.dataCategory,
          stale: false,
          error: null,
          duration,
        });

        if (nodeId === targetNodeId && runMode === "preview") {
          await this._savePreview(projectId, nodeId, resultHandle, ctx);
        }
      }
    } catch (err) {
      if (currentNodeId) {
        this.metaStore.updateMeta(currentNodeId, { error: err.message, stale: true });
      }
      ctx.log(`执行中断: ${err.message}`, "error");
      throw err;
    } finally {
      handleCache.clear();
      this.activeTasks.delete(ctx.taskId);
    }
  }

  _collectSubgraph(targetNodeId) {
    const nodesToRun = new Set();
    if (!targetNodeId) {
      this.graphStore.nodes.forEach(n => nodesToRun.add(n.id));
      return nodesToRun;
    }
    const collect = id => {
      if (nodesToRun.has(id)) return;
      nodesToRun.add(id);
      for (const edge of this.graphStore.getIncomingEdges(id)) collect(edge.source);
    };
    collect(targetNodeId);
    return nodesToRun;
  }
  _collectInputs(node, handleCache) {
    const meta = getOperatorMeta(node.type);
    const inEdges = [...this.graphStore.getIncomingEdges(node.id)].sort(
      (a, b) => this._portIndex(a.targetHandle) - this._portIndex(b.targetHandle),
    );

    if (meta?.inputMode === "dynamic") {
      const min = meta.minInputs ?? 1;
      const max = meta.maxInputs ?? Infinity;
      if (inEdges.length < min)
        throw new Error(`节点 ${node.id} 至少需要 ${min} 个输入，实际 ${inEdges.length}`);
      if (inEdges.length > max)
        throw new Error(`节点 ${node.id} 最多支持 ${max} 个输入，实际 ${inEdges.length}`);
      return inEdges.map(edge => {
        const h = handleCache.get(edge.source);
        if (!h) throw new Error(`节点 ${node.id} 的上游 ${edge.source} 未产出数据`);
        return h;
      });
    }

    const inputCount = meta?.inputs ?? 0;
    const inputs = new Array(inputCount).fill(null);
    for (const edge of inEdges) {
      const idx = this._portIndex(edge.targetHandle);
      if (idx < 0 || idx >= inputCount) {
        throw new Error(`节点 ${node.id} 收到非法输入端口: ${edge.targetHandle}`);
      }
      const h = handleCache.get(edge.source);
      if (!h) throw new Error(`节点 ${node.id} 的输入 in-${idx} 上游 ${edge.source} 未产出数据`);
      inputs[idx] = h;
    }
    for (let i = 0; i < inputCount; i++) {
      if (!inputs[i]) throw new Error(`节点 ${node.id} 的输入 in-${i} 未连接`);
    }
    return inputs;
  }

  _portIndex(handle) {
    const m = /-(\d+)$/.exec(handle ?? "");
    return m ? Number(m[1]) : -1;
  }

  async _savePreview(projectId, nodeId, resultHandle, ctx) {
    ctx.log(`正在拉取节点预览数据...`);
    const previewRows = await this.engine.getPreviewData(resultHandle.payload, 1000);
    const isJson = resultHandle.dataCategory === "json";
    this.previewStore.setPreviewData(
      projectId,
      nodeId,
      isJson
        ? { json: previewRows, columns: [] }
        : { rows: previewRows, columns: resultHandle.schema || [] },
      Date.now().toString(),
    );
  }

  abortTask(taskId) {
    const task = this.activeTasks.get(taskId);
    if (task) task.abort("用户主动取消");
  }

  /**
   * Kahn 拓扑排序，ETL DAG调度版
   * 契约：入参 nodeIds 必须是闭合子图，所有上游依赖均已包含
   * @param {string[]} nodeIds
   * @returns {{sorted: string[], layers: string[][]}}
   */
  _topoSort(nodeIds) {
    const allNodeSet = new Set(nodeIds);
    const allNodes = [...allNodeSet];

    // 初始化邻接表、入度表
    const adj = new Map();
    const inDegree = new Map();
    for (const id of allNodes) {
      adj.set(id, []);
      inDegree.set(id, 0);
    }

    // 构建边 + 去重 + 闭合校验
    for (const targetId of allNodes) {
      const inEdges = this.graphStore.getIncomingEdges(targetId);
      const seenEdge = new Set();
      for (const e of inEdges) {
        const srcId = e.source;
        // 如需按端口区分链路：`${srcId}->${targetId}:${e.port ?? ''}`
        const edgeKey = `${srcId}->${targetId}`;
        if (seenEdge.has(edgeKey)) continue;
        seenEdge.add(edgeKey);

        // 契约防御：理论不该走到这里，作为兜底断言
        if (!allNodeSet.has(srcId)) {
          throw new Error(`闭合子图校验失败：依赖 ${srcId} → ${targetId}，${srcId} 不在nodeIds中`);
        }

        adj.get(srcId).push(targetId);
        inDegree.set(targetId, inDegree.get(targetId) + 1);
      }
    }

    // BFS分层，head游标替代shift，O(n)
    const queue = [];
    for (const [n, deg] of inDegree) {
      if (deg === 0) queue.push(n);
    }

    const sorted = [];
    const layers = [];
    let head = 0;
    while (head < queue.length) {
      const layerSize = queue.length - head;
      const layer = [];
      for (let i = 0; i < layerSize; i++) {
        const u = queue[head++];
        layer.push(u);
        sorted.push(u);
        for (const v of adj.get(u)) {
          inDegree.set(v, inDegree.get(v) - 1);
          if (inDegree.get(v) === 0) {
            queue.push(v);
          }
        }
      }
      layers.push(layer);
    }

    // 环检测，输出候选节点
    if (sorted.length !== allNodes.length) {
      const cycleCandidates = [...inDegree.entries()].filter(([, d]) => d > 0).map(([n]) => n);
      throw new Error(`DAG存在环，环候选节点：${cycleCandidates.join(", ")}`);
    }

    return { sorted, layers };
  }
}
