// meta store：节点元数据（行数、列、stale、error）
// 节点卡片与字段下拉从这里读，不触碰 dataset

import { defineStore } from "pinia"
import { ref } from "vue"

const EMPTY_META = {
  rowCount: 0,
  columns: [],
  columnsVersion: 0,
  stale: false,
  staleReason: null,
  error: null,
}

export const useStoreDataCleanMeta = defineStore("dataCleanMeta", () => {
  const meta = ref({})

  /**
   * 更新节点 meta（增量合并）
   * @param {string} id
   * @param {object} patch
   */
  function updateMeta(id, patch) {
    const prev = meta.value[id] || { ...EMPTY_META }
    meta.value[id] = { ...prev, ...patch }
  }

  /**
   * 标记 stale：数据失效但配置保留
   * @param {string} id
   * @param {string} [reason]
   */
  function markStale(id, reason = "上游已变更") {
    const prev = meta.value[id] || { ...EMPTY_META }
    meta.value[id] = { ...prev, stale: true, staleReason: reason }
  }

  /**
   * 设置错误
   * @param {string} id
   * @param {string} message
   */
  function setError(id, message) {
    const prev = meta.value[id] || { ...EMPTY_META }
    meta.value[id] = { ...prev, error: message, stale: true, staleReason: message }
  }

  /**
   * 清错误（运行成功后调用）
   * @param {string} id
   */
  function clearError(id) {
    const prev = meta.value[id]
    if (!prev) return
    meta.value[id] = { ...prev, error: null }
  }

  /**
   * 取节点 meta，永远返回完整结构
   * @param {string} id
   * @returns {object}
   */
  function getMeta(id) {
    return meta.value[id] || { ...EMPTY_META }
  }

  /**
   * 取节点列列表（字段下拉用）
   * @param {string} id
   * @returns {{name:string,type:string}[]}
   */
  function getColumns(id) {
    return getMeta(id).columns
  }

  /**
   * 删除节点 meta
   * @param {string} id
   */
  function removeMeta(id) {
    delete meta.value[id]
  }

  /**
   * 清空全部 meta
   */
  function clear() {
    meta.value = {}
  }

  return {
    meta,
    updateMeta,
    markStale,
    setError,
    clearError,
    getMeta,
    getColumns,
    removeMeta,
    clear,
  }
})
