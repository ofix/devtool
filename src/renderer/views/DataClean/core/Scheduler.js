import TaskContext from "./runtime/TaskContext.js";
import { getOperatorMeta } from "../operators/index.js";
import { buildCacheKey, allocateTableName, hashParams, hashString } from "./CacheKey.js";
import { EXECUTE_MODE, OUTPUT_RECORDS_KIND } from "./CachePolicy.js";
import { NodeResult } from "./contract/NodeResult.js";

/**
 * DAG 调度器
 *
 * 约束：
 * - 同一 graph 不支持并发 runTask，上层需保证串行；
 * - 增量调度基于 paramsHash + upstreamVersion 的静态签名；
 * - lazy 模式只支持全链路可编译算子，不做增量；
 * - 单版本模型：节点重跑覆盖旧结果，旧结果释放。
 */
export default class Scheduler {
  constructor({ engine, graphStore, metaStore }) {
    this.engine = engine;
    this.graphStore = graphStore;
    this.metaStore = metaStore;
    this.activeTasks = new Map();
    /** 当前执行中的 graphId，_resolveInput 查上游 meta 用 */
    this._currentGraphId = null;
  }

  async runTask(graphId, targetNodeId = null, options = {}) {
    const taskStart = performance.now();
    const ctx = new TaskContext(graphId, "run", options.priority ?? "normal");
    ctx.log = options.log || ((msg, level = "info") => console.log(`[Scheduler]`, msg));
    ctx.executeMode = options.executeMode ?? EXECUTE_MODE.EAGER;
    ctx.timeoutMs = options.timeoutMs ?? null;

    const incremental = options.incremental ?? true;
    const force = options.force ?? false;
    const useIncremental = incremental && !force && ctx.executeMode !== EXECUTE_MODE.LAZY;

    const nodesToRun = this._collectSubgraph(targetNodeId);
    const { sorted: sortedNodes } = this._topoSort(Array.from(nodesToRun));

    await this.engine.init();

    const inputCache = new Map();
    const compiledCtx = new Map();
    const producedRecordSetsKeys = [];

    this.activeTasks.set(ctx.taskId, ctx);
    this._currentGraphId = graphId;

    let currentNodeId = null;
    let currentNodeStart = 0;

    this.metaStore.updateTaskMeta?.(ctx.taskId, {
      taskId: ctx.taskId,
      graphId,
      executeMode: ctx.executeMode,
      startedAt: Date.now(),
      status: "running",
    });

    try {
      for (const nodeId of sortedNodes) {
        if (ctx.signal.aborted) throw new Error("任务被用户取消");
        if (ctx.timeoutMs != null && performance.now() - taskStart > ctx.timeoutMs) {
          throw new Error(`任务超时: ${ctx.timeoutMs}ms`);
        }
        currentNodeId = nodeId;

        const node = this.graphStore.getNode(nodeId);
        if (!node) throw new Error(`节点不存在: ${nodeId}`);

        const inputPorts = this._collectInputs(node, inputCache);
        this._validateInputSupport(node, inputPorts);

        const cacheKey = buildCacheKey({ graphId, nodeId });
        const outputTable = allocateTableName(graphId, nodeId);

        if (useIncremental) {
          const paramsHash = hashParams(node.params);
          const upstreamVersion = this._buildUpstreamVersion(inputPorts);
          const prevMeta = this.metaStore.getMeta(graphId, nodeId);

          const canSkip =
            prevMeta &&
            prevMeta.executeMode === EXECUTE_MODE.EAGER &&
            prevMeta.paramsHash === paramsHash &&
            prevMeta.upstreamVersion === upstreamVersion &&
            prevMeta.stale === false &&
            prevMeta.error == null &&
            this.engine.hasResult(graphId, nodeId);

          if (canSkip) {
            ctx.log(`跳过节点（缓存命中）: ${node.type} (${nodeId})`);
            inputCache.set(nodeId, {
              result: this.engine.getNodeResult(graphId, nodeId),
            });
            continue;
          }
        }

        const nodeCtx = {
          ...ctx,
          nodeId,
          cacheKey,
          outputTable,
          duration: performance.now() - taskStart,
          duckdb: this.engine.duckdbClient,
          sqlite: this.engine.sqliteClient,
          memoryStore: this.engine.memoryStore,
          getTableName: k => this.engine.getTableName(k),
          fetchAllRecords: (k, size) => this.engine.fetchAllByRecordSetsKey(k, size),
          fetchWindowRecords: (k, offset, limit) =>
            this.engine.fetchWindowByRecordSetsKey(k, offset, limit),
        };

        ctx.log(`执行节点: ${node.type} (${nodeId})`);
        currentNodeStart = performance.now();
        const result = await this.engine.runNode(node.type, inputPorts, node.params || {}, nodeCtx);
        const duration = performance.now() - currentNodeStart;

        ctx.log(`节点执行完成，耗时 ${duration.toFixed(2)}ms`);

        this._assertValidNodeResult(node, result);

        if (result.outputRecordSetsKind === OUTPUT_RECORDS_KIND.SQL_CTE) {
          compiledCtx.set(nodeId, result);
          inputCache.set(nodeId, { result });
          continue;
        }

        this.engine.saveNodeResult(graphId, nodeId, result);
        inputCache.set(nodeId, { result });
        producedRecordSetsKeys.push(cacheKey);

        const paramsHash = hashParams(node.params);
        const upstreamVersion = this._buildUpstreamVersion(inputPorts);
        const resultVersion = hashString(`${paramsHash}:${upstreamVersion}`);

        this.metaStore.updateMeta(graphId, nodeId, {
          columns: result.columns || [],
          rowCount: result.rowCount ?? -1,
          jsonOutline: result.jsonOutline ?? null,
          outputRecordSetsKind: result.outputRecordSetsKind,
          storeType: result.storeType,
          executeMode: ctx.executeMode,
          paramsHash,
          upstreamVersion,
          resultVersion,
          stale: false,
          error: null,
          duration,
        });
      }

      if (ctx.executeMode === EXECUTE_MODE.LAZY && targetNodeId) {
        await this._executeCompiledPlan(graphId, targetNodeId, compiledCtx, ctx);
      }

      this.metaStore.updateTaskMeta?.(ctx.taskId, {
        finishedAt: Date.now(),
        duration: performance.now() - taskStart,
        status: "done",
      });
    } catch (err) {
      if (currentNodeId) {
        this.metaStore.updateMeta(graphId, currentNodeId, {
          error: err.message,
          stale: true,
          duration: performance.now() - currentNodeStart,
        });
      }
      for (const key of producedRecordSetsKeys) {
        await this.engine
          .releaseNodeByRecordSetsKey(key)
          .catch(e => console.warn(`[Scheduler] 释放失败 ${key}`, e));
      }
      this.metaStore.updateTaskMeta?.(ctx.taskId, {
        finishedAt: Date.now(),
        duration: performance.now() - taskStart,
        status: ctx.signal.aborted ? "aborted" : "error",
        error: err.message,
      });
      ctx.log(`执行中断: ${err.message}`, "error");
      throw err;
    } finally {
      inputCache.clear();
      compiledCtx.clear();
      this._currentGraphId = null;
      this.activeTasks.delete(ctx.taskId);
    }
  }

  _validateInputSupport(node, inputPorts) {
    const meta = getOperatorMeta(node.type);
    if (!meta) throw new Error(`算子未注册: ${node.type}`);
    const allowed = meta.inputRecordSetsSupport;
    if (!Array.isArray(allowed) || allowed.length === 0) {
      throw new Error(`算子 ${node.type} 未声明 inputRecordSetsSupport`);
    }
    for (let i = 0; i < inputPorts.length; i++) {
      const kind = inputPorts[i].recordSetsKind;
      if (!allowed.includes(kind)) {
        throw new Error(
          `节点 ${node.id} (${node.type}) 的输入 in-${i} 是 ${kind}，` +
            `该算子只支持 ${allowed.join("/")}`,
        );
      }
    }
  }

  _assertValidNodeResult(node, result) {
    const valid = ["db_table", "sql_cte", "json", "text"];
    if (!result || !valid.includes(result.outputRecordSetsKind)) {
      throw new Error(
        `算子 ${node.type} 返回非法 outputRecordSetsKind: ${result?.outputRecordSetsKind}`,
      );
    }
    if (result.outputRecordSetsKind === "db_table" && !result.payload?.tableName) {
      throw new Error(`算子 ${node.type} 的 db_table 缺少 payload.tableName`);
    }
    if (result.outputRecordSetsKind === "sql_cte" && !result.payload?.sqlCteName) {
      throw new Error(`算子 ${node.type} 的 sql_cte 缺少 payload.sqlCteName`);
    }
    if (result.outputRecordSetsKind === "json" && result.payload?.json === undefined) {
      throw new Error(`算子 ${node.type} 的 json 缺少 payload.json`);
    }
    if (result.outputRecordSetsKind === "text" && result.payload?.text === undefined) {
      throw new Error(`算子 ${node.type} 的 text 缺少 payload.text`);
    }
  }

  _buildUpstreamVersion(inputPorts) {
    const versions = inputPorts.map(i => i.upstreamResultVersion ?? "none");
    return hashString(JSON.stringify(versions));
  }

  async _executeCompiledPlan(graphId, targetNodeId, compiledCtx, ctx) {
    const compiled = compiledCtx.get(targetNodeId);
    if (!compiled) {
      throw new Error(`lazy 模式：目标节点 ${targetNodeId} 未生成 SQL CTE`);
    }

    const cteNodes = this._collectSubgraph(targetNodeId);
    const { sorted: cteSorted } = this._topoSort([...cteNodes]);
    const nonCte = cteSorted.filter(id => {
      const r = compiledCtx.get(id);
      return !r || r.outputRecordSetsKind !== "sql_cte";
    });
    if (nonCte.length > 0) {
      throw new Error(`lazy 模式要求全链路可编译算子，以下节点不是: ${nonCte.join(", ")}`);
    }

    const cteDefs = cteSorted
      .map(id => compiledCtx.get(id))
      .filter(r => r && r.outputRecordSetsKind === "sql_cte");

    const outTable = allocateTableName(graphId, targetNodeId);
    const cacheKey = buildCacheKey({ graphId, nodeId: targetNodeId });

    const withClause = cteDefs
      .map(c => `"${c.payload.sqlCteName}" AS (${c.payload.sqlFragment})`)
      .join(",\n");

    const sql = `
      CREATE TABLE "${outTable}" AS
      WITH ${withClause}
      SELECT * FROM "${compiled.payload.sqlCteName}"
    `;

    ctx.log(`lazy 模式执行最终 SQL，目标节点 ${targetNodeId}`);
    const { rowCount } = await this.engine.duckdbClient.run(sql);

    const finalResult = NodeResult.dbTable({
      tableName: outTable,
      storeType: "duckdb",
      recordSetsKey: cacheKey,
      rowCount,
      columns: compiled.columns,
      columnMapping: compiled.columnMapping,
    });

    this.engine.saveNodeResult(graphId, targetNodeId, finalResult);
    this.metaStore.updateMeta(graphId, targetNodeId, {
      columns: finalResult.columns || [],
      rowCount,
      outputRecordSetsKind: finalResult.outputRecordSetsKind,
      storeType: finalResult.storeType,
      executeMode: EXECUTE_MODE.LAZY,
      stale: false,
      error: null,
    });
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

  _collectInputs(node, inputCache) {
    const meta = getOperatorMeta(node.type);
    const inEdges = [...this.graphStore.getIncomingEdges(node.id)].sort(
      (a, b) => this._portIndex(a.targetHandle) - this._portIndex(b.targetHandle),
    );

    const resolve = edge => this._resolveInput(edge, inputCache);

    if (meta?.inputMode === "dynamic") {
      const min = meta.minInputPorts ?? 1;
      const max = meta.maxInputPorts ?? Infinity;
      if (inEdges.length < min) {
        throw new Error(`节点 ${node.id} 至少需要 ${min} 个输入，实际 ${inEdges.length}`);
      }
      if (inEdges.length > max) {
        throw new Error(`节点 ${node.id} 最多支持 ${max} 个输入，实际 ${inEdges.length}`);
      }
      return inEdges.map(resolve);
    }

    const inputPorts = meta?.inputPorts ?? 0;
    const ports = new Array(inputPorts).fill(null);
    for (const edge of inEdges) {
      const idx = this._portIndex(edge.targetHandle);
      if (idx < 0 || idx >= inputPorts) {
        throw new Error(`节点 ${node.id} 收到非法输入端口: ${edge.targetHandle}`);
      }
      ports[idx] = resolve(edge);
    }
    for (let i = 0; i < inputPorts; i++) {
      if (!ports[i]) {
        throw new Error(`节点 ${node.id} 的输入 in-${i} 未连接`);
      }
    }
    return ports;
  }

  _resolveInput(edge, inputCache) {
    const upstream = inputCache.get(edge.source);
    if (!upstream) {
      throw new Error(`节点 ${edge.target} 的上游 ${edge.source} 未产出数据`);
    }
    const result = upstream.result;
    const upMeta = this.metaStore.getMeta(this._currentGraphId, edge.source);

    if (result.outputRecordSetsKind === OUTPUT_RECORDS_KIND.SQL_CTE) {
      return {
        upstreamNodeId: edge.source,
        sqlCteName: result.payload.sqlCteName,
        recordSetsKind: "table",
        columns: result.columns,
        jsonOutline: null,
        columnMapping: result.columnMapping,
        upstreamResultVersion: upMeta?.resultVersion ?? "none",
        inputPortIndex: this._portIndex(edge.targetHandle),
      };
    }

    return {
      upstreamNodeId: edge.source,
      recordSetsKey: result.recordSetsKey,
      recordSetsKind: this._toInputKind(result.outputRecordSetsKind),
      columns: result.columns,
      jsonOutline: result.jsonOutline ?? null,
      columnMapping: result.columnMapping,
      upstreamResultVersion: upMeta?.resultVersion ?? "none",
      inputPortIndex: this._portIndex(edge.targetHandle),
    };
  }

  _toInputKind(outputKind) {
    if (outputKind === "json") return "json";
    if (outputKind === "text") return "text";
    return "table";
  }

  _portIndex(handle) {
    const m = /-(\d+)$/.exec(handle ?? "");
    return m ? Number(m[1]) : -1;
  }

  abortTask(taskId) {
    const task = this.activeTasks.get(taskId);
    if (task) task.abort("用户主动取消");
  }

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
