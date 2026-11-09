import { defineStore } from "pinia";
import { ref } from "vue";

const EMPTY_META = {
  rowCount: null,
  columns: [],
  dataCategory: null,
  jsonSchemaTree: null,
  formattedText: null,
  isTruncated: false,
  stale: false,
  staleReason: null,
  error: null,
  // 增量调度字段
  executionMode: null,
  paramsHash: null,
  upstreamVersion: null,
  resultVersion: null,
  duration: null,
  storeType: null,
};

function buildKey(workflowId, nodeId) {
  return `${workflowId ?? "_"}:${nodeId}`;
}

export const useStoreDataCleanMeta = defineStore("dataCleanMeta", () => {
  const meta = ref({});

  /**
   * 读节点 meta
   * @param {string} workflowId
   * @param {string} nodeId
   */
  function getMeta(workflowId, nodeId) {
    const key = buildKey(workflowId, nodeId);
    return meta.value[key] || { ...EMPTY_META };
  }

  /**
   * 增量更新节点 meta
   */
  function updateMeta(workflowId, nodeId, patch) {
    const key = buildKey(workflowId, nodeId);
    const prev = meta.value[key] || { ...EMPTY_META };
    meta.value[key] = { ...prev, ...patch };
  }

  /**
   * 标记 stale
   */
  function markStale(workflowId, nodeId, reason = "上游已变更") {
    const key = buildKey(workflowId, nodeId);
    const prev = meta.value[key] || { ...EMPTY_META };
    meta.value[key] = { ...prev, stale: true, staleReason: reason };
  }

  /**
   * 记录错误
   */
  function setError(workflowId, nodeId, message) {
    const key = buildKey(workflowId, nodeId);
    const prev = meta.value[key] || { ...EMPTY_META };
    meta.value[key] = {
      ...prev,
      error: message,
      stale: true,
      staleReason: message,
    };
  }

  /**
   * 取列元数据
   */
  function getColumns(workflowId, nodeId) {
    return getMeta(workflowId, nodeId).columns;
  }

  /**
   * 删除单个节点 meta
   */
  function removeMeta(workflowId, nodeId) {
    delete meta.value[buildKey(workflowId, nodeId)];
  }

  /**
   * 清理整个 workflow 的 meta（标签页关闭时调）
   */
  function clearWorkflow(workflowId) {
    const prefix = `${workflowId ?? "_"}:`;
    for (const key of Object.keys(meta.value)) {
      if (key.startsWith(prefix)) delete meta.value[key];
    }
  }

  /**
   * 清空全部
   */
  function clear() {
    meta.value = {};
  }

  return {
    meta,
    getMeta,
    updateMeta,
    markStale,
    setError,
    getColumns,
    removeMeta,
    clearWorkflow,
    clear,
  };
});
