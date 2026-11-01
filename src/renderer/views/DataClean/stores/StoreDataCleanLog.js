// 升级：为每条日志打上 nodeId 标签，方便 Message 节点过滤
import { defineStore } from "pinia"
import { ref } from "vue"

export const useStoreDataCleanLog = defineStore("dataCleanLog", () => {
  const logs = ref([])

  /**
   * 追加日志
   * @param {string} message
   * @param {string} level info | warn | error
   * @param {string} nodeId 产生日志的节点 ID
   */
  function push(message, level = "info", nodeId = null) {
    logs.value.push({
      id: `${Date.now()}-${Math.random()}`,
      message: String(message),
      level,
      nodeId,
      time: new Date().toLocaleTimeString(),
    })
  }

  function clear() {
    logs.value = []
  }

  return { logs, push, clear }
})
