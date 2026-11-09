// 图 store：节点、边、选中状态
// 节点只持有元数据（id/type/params/position），不持有数据

import { defineStore } from "pinia";
import { ref, computed } from "vue";
import {
  EDGE_OK,
  EDGE_ERR_SELF_LOOP,
  EDGE_ERR_DUPLICATE,
  EDGE_ERR_CYCLE,
  EDGE_ERR_PORT_OCCUPIED,
} from "../constants/errors.js";

export const useStoreDataCleanGraph = defineStore("dataCleanGraph", () => {
  const nodes = ref([]);
  const edges = ref([]);
  // 当前选中的算子节点ID
  const selectedNodeId = ref(null);
  // 存储当前被激活的血缘图链路
  const activeLineageGraph = ref(null);
  const selectedNode = computed(() => nodes.value.find(n => n.id === selectedNodeId.value) || null);

  /**
   * 新增节点
   * @param {object} node { id, type, params, position, label? }
   */
  function addNode(node) {
    nodes.value.push(node);
  }

  /**
   * 更新节点参数（增量合并）
   * @param {string} id
   * @param {object} params
   */
  function updateNodeParams(id, params) {
    const node = nodes.value.find(n => n.id === id);
    if (node) {
      node.params = { ...(node.params || {}), ...params };
    }
  }

  /**
   * 更新节点位置（Vue Flow 拖拽后同步）
   * @param {string} id
   * @param {{x:number,y:number}} position
   */
  function updateNodePosition(id, position) {
    const node = nodes.value.find(n => n.id === id);
    if (node) node.position = position;
  }

  /**
   * 删除节点及其相关边
   * @param {string} id
   */
  function removeNode(id) {
    nodes.value = nodes.value.filter(n => n.id !== id);
    edges.value = edges.value.filter(e => e.source !== id && e.target !== id);
    if (selectedNodeId.value === id) selectedNodeId.value = null;
  }

  /**
   * 新增边
   * @param {object} edge { id, source, target, sourceHandle?, targetHandle? }
   */
  function addEdge(edge) {
    if (edge.source === edge.target) {
      return EDGE_ERR_SELF_LOOP;
    }

    // 完全重复：同一条边连两次
    const dup = edges.value.some(
      e =>
        e.source === edge.source &&
        e.target === edge.target &&
        e.sourceHandle === edge.sourceHandle &&
        e.targetHandle === edge.targetHandle,
    );
    if (dup) {
      return EDGE_ERR_DUPLICATE;
    }

    // 端口占用：同一 targetHandle 已被任何上游占用（单输入/多输入都算）
    const occupied = edges.value.some(
      e => e.target === edge.target && e.targetHandle === edge.targetHandle,
    );
    if (occupied) {
      return EDGE_ERR_PORT_OCCUPIED;
    }

    if (_wouldCreateCycle(edge.source, edge.target)) {
      return EDGE_ERR_CYCLE;
    }

    edges.value.push(edge);
    return EDGE_OK;
  }

  /**
   * 判断加入 source → target 后是否成环
   * 等价于：原图中 target 沿出边能否到达 source
   */
  function _wouldCreateCycle(source, target) {
    const stack = [target];
    const visited = new Set();
    while (stack.length) {
      const cur = stack.pop();
      if (cur === source) return true;
      if (visited.has(cur)) continue;
      visited.add(cur);
      for (const e of edges.value) {
        if (e.source === cur) stack.push(e.target);
      }
    }
    return false;
  }

  /**
   * 删除边
   * @param {string} id
   */
  function removeEdge(id) {
    edges.value = edges.value.filter(e => e.id !== id);
  }

  /**
   * 按 id 取节点
   * @param {string} id
   * @returns {object|undefined}
   */
  function getNode(id) {
    return nodes.value.find(n => n.id === id);
  }

  /**
   * 取节点的入边
   * @param {string} id
   * @returns {object[]}
   */
  function getIncomingEdges(id) {
    return edges.value.filter(e => e.target === id);
  }

  /**
   * 取节点的出边
   * @param {string} id
   * @returns {object[]}
   */
  function getOutgoingEdges(id) {
    return edges.value.filter(e => e.source === id);
  }

  function setSelected(id) {
    selectedNodeId.value = id;
  }

  // 设置激活的血缘图
  function setActiveLineageGraph(graph) {
    activeLineageGraph.value = graph;
  }

  /**
   * 清空整图（加载新管线前用）
   */
  function clear() {
    nodes.value = [];
    edges.value = [];
    selectedNodeId.value = null;
    activeLineageGraph.value = null; // 顺便清理激活的血缘
  }

  return {
    nodes,
    edges,
    selectedNodeId,
    selectedNode,
    activeLineageGraph, // 导出
    addNode,
    updateNodeParams,
    updateNodePosition,
    removeNode,
    addEdge,
    removeEdge,
    getNode,
    getIncomingEdges,
    getOutgoingEdges,
    setSelected,
    setActiveLineageGraph, // 👈 导出方法
    clear,
  };
});
