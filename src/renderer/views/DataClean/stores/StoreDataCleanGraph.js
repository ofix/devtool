// 图 store：节点、边、选中状态
// 节点只持有元数据（id/type/params/position），不持有数据

import { defineStore } from "pinia"
import { ref, computed } from "vue"

export const useStoreDataCleanGraph = defineStore("dataCleanGraph", () => {
  const nodes = ref([])
  const edges = ref([])
  const selectedNodeId = ref(null)

  const selectedNode = computed(() => nodes.value.find(n => n.id === selectedNodeId.value) || null)

  /**
   * 新增节点
   * @param {object} node { id, type, params, position, label? }
   */
  function addNode(node) {
    nodes.value.push(node)
  }

  /**
   * 更新节点参数（增量合并）
   * @param {string} id
   * @param {object} params
   */
  function updateNodeParams(id, params) {
    const node = nodes.value.find(n => n.id === id)
    if (node) {
      node.params = { ...(node.params || {}), ...params }
    }
  }

  /**
   * 更新节点位置（Vue Flow 拖拽后同步）
   * @param {string} id
   * @param {{x:number,y:number}} position
   */
  function updateNodePosition(id, position) {
    const node = nodes.value.find(n => n.id === id)
    if (node) node.position = position
  }

  /**
   * 删除节点及其相关边
   * @param {string} id
   */
  function removeNode(id) {
    nodes.value = nodes.value.filter(n => n.id !== id)
    edges.value = edges.value.filter(e => e.source !== id && e.target !== id)
    if (selectedNodeId.value === id) selectedNodeId.value = null
  }

  /**
   * 新增边
   * @param {object} edge { id, source, target, sourceHandle?, targetHandle? }
   */
  function addEdge(edge) {
    edges.value.push(edge)
  }

  /**
   * 删除边
   * @param {string} id
   */
  function removeEdge(id) {
    edges.value = edges.value.filter(e => e.id !== id)
  }

  /**
   * 按 id 取节点
   * @param {string} id
   * @returns {object|undefined}
   */
  function getNode(id) {
    return nodes.value.find(n => n.id === id)
  }

  /**
   * 取节点的入边
   * @param {string} id
   * @returns {object[]}
   */
  function getIncomingEdges(id) {
    return edges.value.filter(e => e.target === id)
  }

  /**
   * 取节点的出边
   * @param {string} id
   * @returns {object[]}
   */
  function getOutgoingEdges(id) {
    return edges.value.filter(e => e.source === id)
  }

  function setSelected(id) {
    selectedNodeId.value = id
  }

  /**
   * 清空整图（加载新管线前用）
   */
  function clear() {
    nodes.value = []
    edges.value = []
    selectedNodeId.value = null
  }

  return {
    nodes,
    edges,
    selectedNodeId,
    selectedNode,
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
    clear,
  }
})
