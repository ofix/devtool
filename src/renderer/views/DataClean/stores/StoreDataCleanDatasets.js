import { defineStore } from "pinia";
import { ref, markRaw, triggerRef } from "vue";

export const useStoreDataCleanDatasets = defineStore("dataCleanDatasets", () => {
    const datasets = ref({});

    function setDataset(id, data) {
        datasets.value[id] = markRaw({
            rows: data.rows || [],
            columns: data.columns || [],
            dataCategory: data.dataCategory || "table", // 新增：形态标记
        });
        triggerRef(datasets);
    }

    function getDataset(id) {
        return datasets.value[id] || null;
    }

    function removeDataset(id) {
        delete datasets.value[id];
        triggerRef(datasets);
    }

    function clear() {
        datasets.value = {};
        triggerRef(datasets);
    }

    return { datasets, setDataset, getDataset, removeDataset, clear };
});
