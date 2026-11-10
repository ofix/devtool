import { defineStore } from "pinia";
import { ref } from "vue";

const EMPTY_META = {
  rowCount: null,
  columns: [],
  jsonOutline: null,
  outputRecordSetsKind: null,
  storeType: null,
  formattedText: null,
  isTruncated: false,
  stale: false,
  staleReason: null,
  error: null,
  duration: null,
  executeMode: null,
  paramsHash: null,
  upstreamVersion: null,
  resultVersion: null,
};

function buildKey(graphId, nodeId) {
  return `${graphId ?? "_"}:${nodeId}`;
}

export const useStoreDataCleanMeta = defineStore("dataCleanMeta", () => {
  const meta = ref({});
  const taskMeta = ref({});

  function getMeta(graphId, nodeId) {
    return meta.value[buildKey(graphId, nodeId)] || { ...EMPTY_META };
  }

  function updateMeta(graphId, nodeId, patch) {
    const key = buildKey(graphId, nodeId);
    const prev = meta.value[key] || { ...EMPTY_META };
    meta.value[key] = { ...prev, ...patch };
  }

  function markStale(graphId, nodeId, reason = "上游已变更") {
    const key = buildKey(graphId, nodeId);
    const prev = meta.value[key] || { ...EMPTY_META };
    meta.value[key] = { ...prev, stale: true, staleReason: reason };
  }

  function setError(graphId, nodeId, message) {
    const key = buildKey(graphId, nodeId);
    const prev = meta.value[key] || { ...EMPTY_META };
    meta.value[key] = { ...prev, error: message, stale: true, staleReason: message };
  }

  function getColumns(graphId, nodeId) {
    return getMeta(graphId, nodeId).columns;
  }

  function removeMeta(graphId, nodeId) {
    delete meta.value[buildKey(graphId, nodeId)];
  }

  function clearGraph(graphId) {
    const prefix = `${graphId ?? "_"}:`;
    for (const key of Object.keys(meta.value)) {
      if (key.startsWith(prefix)) delete meta.value[key];
    }
  }

  function getTaskMeta(taskId) {
    return taskMeta.value[taskId] || null;
  }

  function updateTaskMeta(taskId, patch) {
    const prev = taskMeta.value[taskId] || {};
    taskMeta.value[taskId] = { ...prev, ...patch };
  }

  function clearTaskMeta(taskId) {
    delete taskMeta.value[taskId];
  }

  function clear() {
    meta.value = {};
    taskMeta.value = {};
  }

  return {
    meta,
    taskMeta,
    getMeta,
    updateMeta,
    markStale,
    setError,
    getColumns,
    removeMeta,
    clearGraph,
    getTaskMeta,
    updateTaskMeta,
    clearTaskMeta,
    clear,
  };
});
