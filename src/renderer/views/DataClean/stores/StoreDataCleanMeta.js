import { defineStore } from "pinia"
import { ref } from "vue"

const EMPTY_META = {
  rowCount: null,
  columns: [],
  dataCategory: null,
  jsonSchemaTree: null, // 缓存的 JSON Schema 树
  formattedText: null,
  isTruncated: false,
  stale: false,
  staleReason: null,
  error: null,
}

export const useStoreDataCleanMeta = defineStore("dataCleanMeta", () => {
  const meta = ref({})

  function updateMeta(id, patch) {
    const prev = meta.value[id] || { ...EMPTY_META }
    meta.value[id] = { ...prev, ...patch }
  }

  function markStale(id, reason = "上游已变更") {
    const prev = meta.value[id] || { ...EMPTY_META }
    meta.value[id] = { ...prev, stale: true, staleReason: reason }
  }

  function setError(id, message) {
    const prev = meta.value[id] || { ...EMPTY_META }
    meta.value[id] = { ...prev, error: message, stale: true, staleReason: message }
  }

  function getMeta(id) {
    return meta.value[id] || { ...EMPTY_META }
  }

  function getColumns(id) {
    return getMeta(id).columns
  }

  function removeMeta(id) {
    delete meta.value[id]
  }

  function clear() {
    meta.value = {}
  }

  return { meta, updateMeta, markStale, setError, getMeta, getColumns, removeMeta, clear }
})
