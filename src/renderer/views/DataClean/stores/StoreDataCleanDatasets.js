import { defineStore } from "pinia"
import { ref, markRaw, triggerRef } from "vue"

export const useStoreDataCleanDatasets = defineStore("dataCleanDatasets", () => {
  const datasets = ref({})

  /**
   * 保存数据集实例
   * 注意：这里的 data 已经是 Engine 处理好的 InMemoryDataset 或 StreamDataset 实例
   */
  function setDataset(id, data) {
    // 直接存实例，用 markRaw 避免 Vue 深度代理流对象内部复杂的生成器状态
    datasets.value[id] = markRaw(data)
    triggerRef(datasets)
  }

  function getDataset(id) {
    return datasets.value[id] || null
  }

  function removeDataset(id) {
    delete datasets.value[id]
    triggerRef(datasets)
  }

  function clear() {
    datasets.value = {}
    triggerRef(datasets)
  }

  return { datasets, setDataset, getDataset, removeDataset, clear }
})
