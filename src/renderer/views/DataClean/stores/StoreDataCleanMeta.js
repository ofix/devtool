import { defineStore } from "pinia";
import { ref } from "vue";

const EMPTY_META = {
    rowCount: 0,
    columns: [],
    dataCategory: null, // 新增：存储数据形态
    columnsVersion: 0,
    stale: false,
    staleReason: null,
    error: null,
};

export const useStoreDataCleanMeta = defineStore("dataCleanMeta", () => {
    const meta = ref({});

    function updateMeta(id, patch) {
        const prev = meta.value[id] || { ...EMPTY_META };
        meta.value[id] = { ...prev, ...patch };
    }

    function markStale(id, reason = "上游已变更") {
        const prev = meta.value[id] || { ...EMPTY_META };
        meta.value[id] = { ...prev, stale: true, staleReason: reason };
    }

    function setError(id, message) {
        const prev = meta.value[id] || { ...EMPTY_META };
        meta.value[id] = { ...prev, error: message, stale: true, staleReason: message };
    }

    function clearError(id) {
        const prev = meta.value[id];
        if (!prev) return;
        meta.value[id] = { ...prev, error: null };
    }

    function getMeta(id) {
        return meta.value[id] || { ...EMPTY_META };
    }

    function getColumns(id) {
        return getMeta(id).columns;
    }

    function removeMeta(id) {
        delete meta.value[id];
    }

    function clear() {
        meta.value = {};
    }

    return { meta, updateMeta, markStale, setError, clearError, getMeta, getColumns, removeMeta, clear };
});
