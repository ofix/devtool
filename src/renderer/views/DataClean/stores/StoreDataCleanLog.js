// 日志 store：底部日志条，最多保留 500 条

import { defineStore } from "pinia";
import { ref } from "vue";

const MAX_LOGS = 500;

export const useStoreDataCleanLog = defineStore("dataCleanLog", () => {
    const logs = ref([]);

    /**
     * 追加日志
     * @param {string} message
     * @param {string} [level] info | warn | error
     */
    function push(message, level = "info") {
        const entry = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            message: String(message),
            level,
            time: new Date().toLocaleTimeString(),
        };
        logs.value.push(entry);
        if (logs.value.length > MAX_LOGS) {
            logs.value.splice(0, logs.value.length - MAX_LOGS);
        }
        return entry;
    }

    function clear() {
        logs.value = [];
    }

    return { logs, push, clear };
});
