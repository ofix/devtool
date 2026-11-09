import TaskContext from "./runtime/TaskContext.js";
import { getOperatorMeta } from "../operators/index.js";
import { buildCacheKey, allocateTableName } from "./CacheKey.js";
import { InputRef } from "./contract/InputRef.js";
import { DataHandle } from "./contract/DataHandle.js";

export default class Scheduler {
  constructor({ engine, graphStore, metaStore }) {
    this.engine = engine;
    this.graphStore = graphStore;
    this.metaStore = metaStore;
    this.activeTasks = new Map();
  }

  /**
   * 执行任务（全量或指定节点子图）
   * @param {string} workflowId
   * @param {string|null} targetNodeId  null = 全图
   * @param {object} options { log, executionMode, priority }
   */
  async runTask(workflowId, targetNodeId = null, options = {}) {
    const ctx = new TaskContext(workflowId, "run", options.priority ?? "normal");
    ctx.log = options.log || ((msg, level = "info") => console.log(`[Scheduler]`, msg));
    ctx.executionMode = options.executionMode ?? "executed";

    const incremental = options.incremental ?? true;
    const force = options.force ?? false;
    // 编译模式不做增量
    const useIncremental = incremental && ctx.executionMode !== "compiled";

    const nodesToRun = this._collectSubgraph(targetNodeId);
    const { sorted: sortedNodes } = this._topoSort(Array.from(nodesToRun));

    await this.engine.init();

    const handleCache = new Map();
    const compiledCtx = new Map();

    this.activeTasks.set(ctx.taskId, ctx);
    let currentNodeId = null;
    let currentNodeStart = 0;

    try {
      for (const nodeId of sortedNodes) {
        if (ctx.signal.aborted) throw new Error("任务被用户取消");
        currentNodeId = nodeId;

        const node = this.graphStore.getNode(nodeId);
        if (!node) throw new Error(`节点不存在: ${nodeId}`);

        const inputs = this._collectInputs(node, handleCache);

        const operatorMeta = getOperatorMeta(node.type);
        const paramsHash = hashParams(node.params);
        const upstreamVersion = inputs
          .map(inp => this.metaStore.getMeta(inp.nodeId)?.resultVersion ?? "none")
          .join("|");

        const prevMeta = this.metaStore.getMeta(nodeId);

        if (useIncremental && !force) {
          const canSkip =
            prevMeta &&
            prevMeta.paramsHash === paramsHash &&
            prevMeta.upstreamVersion === upstreamVersion &&
            prevMeta.stale === false &&
            prevMeta.error == null &&
            this.engine.hasResult(workflowId, nodeId);

          if (canSkip) {
            ctx.log(`跳过节点（缓存命中）: ${node.type} (${nodeId})`);
            handleCache.set(nodeId, {
              handle: this.engine.getResultHandle(workflowId, nodeId),
            });
            continue;
          }
        }

        const cacheKey = buildCacheKey({ workflowId, nodeId });
        const outputTable = allocateTableName(workflowId, nodeId);

        const nodeCtx = {
          ...ctx,
          nodeId,
          cacheKey,
          outputTable,
          duckdb: this.engine.duckdbClient,
          sqlite: this.engine.sqliteClient,
          memoryStore: this.engine.memoryStore,
          getTableName: k => this.engine.getTableName(k),
          fetchAll: (k, size) => this.engine.fetchAll(workflowId, k, size),
        };

        ctx.log(`执行节点: ${node.type} (${nodeId})`);
        currentNodeStart = performance.now();
        const handle = await this.engine.runNode(node.type, inputs, node.params || {}, nodeCtx);
        const duration = performance.now() - currentNodeStart;

        if (!handle || typeof handle.kind !== "string") {
          throw new Error(`算子 ${node.type} 未返回合法 DataHandle`);
        }

        if (handle.kind === "cte_fragment") {
          compiledCtx.set(nodeId, handle);
          handleCache.set(nodeId, { handle });
          continue;
        }

        this.engine.saveNodeResult(workflowId, nodeId, handle);
        handleCache.set(nodeId, { handle });

        const resultVersion = `${paramsHash}:${upstreamVersion}`;
        this.metaStore.updateMeta(nodeId, {
          columns: handle.schema || [],
          rowCount: handle.rowCount ?? -1,
          dataCategory: handle.dataCategory,
          storeType: handle.storeType,
          paramsHash,
          upstreamVersion,
          resultVersion,
          stale: false,
          error: null,
          duration,
        });
      }

      if (ctx.executionMode === "compiled" && targetNodeId) {
        await this._executeCompiledPlan(workflowId, targetNodeId, compiledCtx, ctx);
      }
    } catch (err) {
      if (currentNodeId) {
        this.metaStore.updateMeta(currentNodeId, {
          error: err.message,
          stale: true,
          duration: performance.now() - currentNodeStart,
        });
      }
      ctx.log(`执行中断: ${err.message}`, "error");
      throw err;
    } finally {
      handleCache.clear();
      compiledCtx.clear();
      this.activeTasks.delete(ctx.taskId);
    }
  }

  /**
   * 编译模式：把 targetNodeId 的 CTE 链拼成一条 SQL 执行，落最终表
   */
  async _executeCompiledPlan(workflowId, targetNodeId, compiledCtx, ctx) {
    const compiled = compiledCtx.get(targetNodeId);
    if (!compiled) {
      throw new Error(`编译模式：目标节点 ${targetNodeId} 未生成 CTE 片段`);
    }

    const cteDefs = this._collectCteDefs(targetNodeId, compiledCtx);
    const outTable = allocateTableName(workflowId, targetNodeId);
    const cacheKey = buildCacheKey({ workflowId, nodeId: targetNodeId });

    const withClause = cteDefs
      .map(c => `"${c.payload.cteName}" AS (${c.payload.sqlFragment})`)
      .join(",\n");

    const sql = `
      CREATE TABLE "${outTable}" AS
      WITH ${withClause}
      SELECT * FROM "${compiled.payload.cteName}"
    `;

    ctx.log(`编译模式执行最终 SQL，目标节点 ${targetNodeId}`);
    const { rowCount } = await this.engine.duckdbClient.run(sql);

    const finalHandle = DataHandle.duckPhysical({
      schema: compiled.schema,
      columnMapping: compiled.columnMapping,
      tableName: outTable,
      cacheKey,
      rowCount,
    });

    this.engine.saveNodeResult(workflowId, targetNodeId, finalHandle);
    this.metaStore.updateMeta(targetNodeId, {
      columns: finalHandle.schema || [],
      rowCount,
      dataCategory: finalHandle.dataCategory,
      storeType: finalHandle.storeType,
      stale: false,
      error: null,
    });
  }

  _collectCteDefs(targetNodeId, compiledCtx) {
    const visited = new Set();
    const ordered = [];

    const visit = id => {
      if (visited.has(id)) return;
      visited.add(id);
      const handle = compiledCtx.get(id);
      if (!handle) return;
      const edges = this.graphStore.getIncomingEdges(id);
      for (const e of edges) visit(e.source);
      ordered.push(handle);
    };

    visit(targetNodeId);
    return ordered;
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

    const resolve = edge => this._resolveInput(edge, handleCache);

    if (meta?.inputMode === "dynamic") {
      const min = meta.minInputs ?? 1;
      const max = meta.maxInputs ?? Infinity;
      if (inEdges.length < min) {
        throw new Error(`节点 ${node.id} 至少需要 ${min} 个输入，实际 ${inEdges.length}`);
      }
      if (inEdges.length > max) {
        throw new Error(`节点 ${node.id} 最多支持 ${max} 个输入，实际 ${inEdges.length}`);
      }
      return inEdges.map(resolve);
    }

    const inputCount = meta?.inputs ?? 0;
    const inputs = new Array(inputCount).fill(null);
    for (const edge of inEdges) {
      const idx = this._portIndex(edge.targetHandle);
      if (idx < 0 || idx >= inputCount) {
        throw new Error(`节点 ${node.id} 收到非法输入端口: ${edge.targetHandle}`);
      }
      inputs[idx] = resolve(edge);
    }
    for (let i = 0; i < inputCount; i++) {
      if (!inputs[i]) {
        throw new Error(`节点 ${node.id} 的输入 in-${i} 未连接`);
      }
    }
    return inputs;
  }

  _resolveInput(edge, handleCache) {
    const upstream = handleCache.get(edge.source);
    if (!upstream) {
      throw new Error(`节点 ${edge.target} 的上游 ${edge.source} 未产出数据`);
    }
    const handle = upstream.handle;

    if (handle.kind === "cte_fragment") {
      return new InputRef({
        nodeId: edge.source,
        cteName: handle.payload.cteName,
        schema: handle.schema,
        columnMapping: handle.columnMapping,
        dataCategory: handle.dataCategory,
      });
    }

    return new InputRef({
      nodeId: edge.source,
      cacheKey: handle.cacheKey,
      schema: handle.schema,
      columnMapping: handle.columnMapping,
      dataCategory: handle.dataCategory,
    });
  }

  _portIndex(handle) {
    const m = /-(\d+)$/.exec(handle ?? "");
    return m ? Number(m[1]) : -1;
  }

  abortTask(taskId) {
    const task = this.activeTasks.get(taskId);
    if (task) task.abort("用户主动取消");
  }

  /**
   * Kahn 拓扑排序
   * @param {string[]} nodeIds
   * @returns {{sorted: string[], layers: string[][]}}
   */
  _topoSort(nodeIds) {
    const allNodeSet = new Set(nodeIds);
    const allNodes = [...allNodeSet];

    const adj = new Map();
    const inDegree = new Map();
    for (const id of allNodes) {
      adj.set(id, []);
      inDegree.set(id, 0);
    }

    for (const targetId of allNodes) {
      const inEdges = this.graphStore.getIncomingEdges(targetId);
      const seenEdge = new Set();
      for (const e of inEdges) {
        const srcId = e.source;
        const edgeKey = `${srcId}->${targetId}`;
        if (seenEdge.has(edgeKey)) continue;
        seenEdge.add(edgeKey);

        if (!allNodeSet.has(srcId)) {
          throw new Error(`闭合子图校验失败：依赖 ${srcId} → ${targetId}，${srcId} 不在nodeIds中`);
        }

        adj.get(srcId).push(targetId);
        inDegree.set(targetId, inDegree.get(targetId) + 1);
      }
    }

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

    if (sorted.length !== allNodes.length) {
      const cycleCandidates = [...inDegree.entries()].filter(([, d]) => d > 0).map(([n]) => n);
      throw new Error(`DAG存在环，环候选节点：${cycleCandidates.join(", ")}`);
    }

    return { sorted, layers };
  }
}
