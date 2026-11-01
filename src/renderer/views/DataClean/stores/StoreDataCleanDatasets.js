import { defineStore } from "pinia"
import { ref, markRaw, triggerRef } from "vue"

export const useStoreDataCleanDatasets = defineStore("dataCleanDatasets", () => {
  const datasets = ref({})

  function setDataset(id, data) {
    console.log(
      `[StoreDataCleanDatasets] 设置数据集 ${id}，行数: ${data.rows?.length || 0}, 列数: ${data.columns?.length || 0}`,
    )
    datasets.value[id] = markRaw({
      rows: data.rows || [],
      columns: data.columns || [],
    })
    triggerRef(datasets) // 触发视图更新
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
