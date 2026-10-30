// dataset store：执行结果缓存
// markRaw 不进响应式，避免 10 万行对象被 Vue 深度代理

import { defineStore } from "pinia";
import { ref, markRaw } from "vue";

export const useStoreDataCleanDatasets = defineStore("dataCleanDatasets", () => {
    const datasets = ref({});

    /**
     * 设置节点数据
     * @param {string} id
     * @param {{rows:object[],columns:object[]}} data
     */
    function setDataset(id, data) {
        datasets.value[id] = markRaw({
            rows: data.rows || [],
            columns: data.columns || [],
        });
    }

    /**
     * 取节点数据
     * @param {string} id
     * @returns {{rows:object[],columns:object[]}|null}
     */
    function getDataset(id) {
        return datasets.value[id] || null;
    }

    /**
     * 删除节点数据
     * @param {string} id
     */
    function removeDataset(id) {
        delete datasets.value[id];
    }

    /**
     * 清空全部
     */
    function clear() {
        datasets.value = {};
    }

    return { datasets, setDataset, getDataset, removeDataset, clear };
});
