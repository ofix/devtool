import { ref } from "vue";

/**
 * 模拟MFC MESSAGE_MAP / ON_COMMAND / ON_UPDATE_COMMAND_UI
 */
export function useCommandMap() {
  // 存储所有命令映射 { cmd, handler, uiUpdater }
  const commandMap = [];
  // 各菜单UI状态：disabled / checked
  const cmdState = ref({});

  /**
   * ON_COMMAND 绑定命令与执行函数
   * @param {string} cmd MenuCmd 常量
   * @param {Function} handler 执行回调
   */
  const onCommand = (cmd, handler) => {
    const exist = commandMap.find(item => item.cmd === cmd);
    if (exist) {
      exist.handler = handler;
    } else {
      commandMap.push({ cmd, handler, uiUpdater: null });
    }
  };

  /**
   * ON_UPDATE_COMMAND_UI 绑定菜单状态更新器
   * @param {string} cmd MenuCmd
   * @param {Function} updater (state) => void
   */
  const onUpdateUI = (cmd, updater) => {
    const item = commandMap.find(item => item.cmd === cmd);
    if (item) item.uiUpdater = updater;
  };

  /**
   * 分发菜单命令，替代巨型switch
   * @param {string} cmd MenuCmd
   */
  const dispatchMenuCmd = (cmd) => {
    const match = commandMap.find(item => item.cmd === cmd);
    if (match && typeof match.handler === "function") {
      match.handler();
    }
  };

  /**
   * 全局刷新所有菜单UI状态（MFC自动刷新UI）
   */
  const refreshMenuUI = () => {
    commandMap.forEach(item => {
      const state = { disabled: false, checked: false };
      if (typeof item.uiUpdater === "function") {
        item.uiUpdater(state);
      }
      cmdState.value[item.cmd] = { ...state };
    });
  };

  return {
    commandMap,
    cmdState,
    onCommand,
    onUpdateUI,
    dispatchMenuCmd,
    refreshMenuUI
  };
}