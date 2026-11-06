import { defineStore } from "pinia"
import { ref, markRaw } from "vue"

export const useStoreDataCleanPreview = defineStore("dataCleanPreview", () => {
  // Key: `${projectId}::${nodeId}`
  const previewCache = ref({})

  /**
   * 更新预览缓存
   */
  function setPreviewData(projectId, nodeId, data, versionHash) {
    const key = `${projectId}::${nodeId}`
    previewCache.value[key] = markRaw({
      rows: data.rows || [],
      columns: data.columns || [],
      versionHash: versionHash,
      timestamp: Date.now(),
    })
  }

  function getPreviewData(projectId, nodeId) {
    return previewCache.value[`${projectId}::${nodeId}`] || null
  }

  function clearCache(projectId, nodeId) {
    delete previewCache.value[`${projectId}::${nodeId}`]
  }

  return { previewCache, setPreviewData, getPreviewData, clearCache }
})
