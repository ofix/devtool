import { defineStore } from "pinia"
import { ref, markRaw, triggerRef } from "vue"
import { DATA_CATEGORY } from "../constants/DataCategories.js"

export const useStoreDataCleanDatasets = defineStore("dataCleanDatasets", () => {
  const datasets = ref({})

  function setDataset(id, data) {
    const category = data.dataCategory || DATA_CATEGORY.TABLE
    const isTableData = category === DATA_CATEGORY.TABLE

    datasets.value[id] = markRaw({
      dataCategory: category,
      // 双字段严格互斥
      rows: isTableData ? data.rows || [] : [],
      columns: isTableData ? data.columns || [] : [],
      json: category === DATA_CATEGORY.JSON ? data.json || null : null,
      formattedText: data.formattedText || null, // 存放格式化后的 JSON 文本
      isTruncated: data.isTruncated || false, // 大文件截断标记
    })
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
