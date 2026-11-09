<template>
  <div class="top-menu">
    <div class="menu-tabs-row">
      <div class="app-title">Data Clean</div>
      <div class="tabs-container">
        <div
          v-for="cat in categories"
          :key="cat.key"
          class="menu-tab"
          :class="{ 'is-active': activeTab === cat.key }"
          @click="activeTab = cat.key"
        >
          {{ cat.label }}
        </div>
      </div>
      <div class="menu-right-actions">
        <!-- 新增：引擎切换下拉框 -->
        <el-select
          v-model="engineMode"
          size="small"
          style="width: 110px; margin-right: 8px"
          @change="onEngineChange"
        >
          <el-option label="JS 引擎" value="js" />
          <el-option label="DuckDB 引擎" value="duckdb" />
        </el-select>

        <el-button size="small" type="primary" @click="$emit('run')">运行</el-button>
        <el-button size="small" @click="$emit('save')">保存管线</el-button>
        <el-button size="small" @click="$emit('load')">加载管线</el-button>
        <el-button size="small" @click="$emit('fit')">适应画布</el-button>
        <el-button size="small" @click="toggleTheme">
          {{ isDark ? "亮色" : "暗色" }}
        </el-button>
      </div>
    </div>
    <div class="menu-toolbar-row">
      <div class="tool-group">
        <!-- 根据 supportedEngines 过滤算子 -->
        <div
          v-for="op in activeOps"
          :key="op.type"
          class="tool-btn"
          :class="{ 'is-disabled': !isOpSupported(op) }"
          @click="onAddNode(op)"
        >
          <div class="tool-icon" :style="{ color: op.icon }">
            <el-icon size="24"><component :is="getIcon(op.icon)" /></el-icon>
          </div>
          <span class="tool-text">{{ op.label }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
  import { ref, computed, onMounted } from "vue"
  import { ElMessage } from "element-plus"
  import {
    Document,
    Download,
    ChatDotRound,
    Files,
    Link,
    Connection,
    DataLine,
    Grid,
    Share,
    Position,
    Money,
    Operation,
    Reading,
    Coin,
    Folder,
    DocumentAdd,
    UploadFilled,
    Plus,
    List,
    SetUp,
    CopyDocument,
    Filter,
    FullScreen,
    MagicStick,
  } from "@element-plus/icons-vue"

  // 引入新的元数据字典
  import { operatorMetas } from "../operators/index.js"
  import { NODE_CATEGORIES } from "../../constants/NodeTypes.js"
  import { useStoreDataCleanGraph } from "../../stores/StoreDataCleanGraph.js"

  // 新增引擎切换事件
  const emit = defineEmits(["fit", "save", "load", "run", "engine-change"])

  const graphStore = useStoreDataCleanGraph()
  const engineMode = ref("js")

  // 将字典转为数组
  const allOps = computed(() => Object.values(operatorMetas))

  const categories = computed(() => {
    const used = new Set(allOps.value.map(op => op.category))
    return NODE_CATEGORIES.filter(c => used.has(c.key))
  })

  const activeTab = ref(categories.value.length > 0 ? categories.value[0].key : "")

  const activeOps = computed(() => allOps.value.filter(op => op.category === activeTab.value))

  function isOpSupported(op) {
    return op.supportedEngines && op.supportedEngines.includes(engineMode.value)
  }

  const isDark = ref(false)
  onMounted(() => {
    const saved = localStorage.getItem("dc-theme")
    if (saved === "dark") {
      isDark.value = true
      document.documentElement.setAttribute("data-theme", "dark")
    }
  })

  function toggleTheme() {
    isDark.value = !isDark.value
    if (isDark.value) {
      document.documentElement.setAttribute("data-theme", "dark")
      localStorage.setItem("dc-theme", "dark")
    } else {
      document.documentElement.removeAttribute("data-theme")
      localStorage.setItem("dc-theme", "light")
    }
  }

  function onEngineChange(val) {
    emit("engine-change", val)
  }

  function getIcon(iconName) {
    const map = {
      IconFolder: Document,
      IconDownload: Download,
      IconChatDot: ChatDotRound,
      IconLink: Link,
      IconMerge: Share,
      IconDataLine: DataLine,
      IconSwitch: Connection,
      IconGrid: Grid,
      IconNumber: Position,
      IconCut: SetUp,
      IconSearch: Filter,
      IconCode: DocumentAdd,
      IconTextRecognition: Reading,
      IconFolderOpened: Folder,
      IconFolderDownload: UploadFilled,
      IconList: List,
      IconSort: Operation,
      IconCopy: CopyDocument,
      IconFilter: Filter,
      IconCalculator: Coin,
      IconExcel: DocumentAdd,
      IconDatabase: Coin,
      IconTransform: MagicStick,
      IconExpand: FullScreen,
      IconExtract: Position,
      default: Files,
    }
    return map[iconName] || map.default
  }

  function onAddNode(op) {
    if (!isOpSupported(op)) {
      ElMessage.warning(`当前引擎不支持算子: ${op.label}`)
      return
    }

    const id = `${op.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const offset = (graphStore.nodes.length % 6) * 40

    // 注意：这里的 getDefaultParams 接收的是 op 的 schema
    graphStore.addNode({
      id,
      type: op.type,
      params: getDefaultParams(op),
      position: { x: 120 + offset, y: 80 + offset },
    })
    graphStore.setSelected(id)
  }

  function getDefaultParams(op) {
    const params = {}
    for (const row of op.schema || []) {
      if (row.component === "select" && row.options && row.options.length > 0) {
        params[row.field] = row.options[0].value
      } else if (row.defaultValue !== undefined) {
        params[row.field] = row.defaultValue
      } else {
        params[row.field] = ""
      }
    }
    return params
  }
</script>

<style scoped>
  /* 保持原有样式，新增置灰样式 */
  .top-menu {
    display: flex;
    flex-direction: column;
    background: var(--dc-menu-bg, #ffffff);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    z-index: 10;
  }
  .menu-tabs-row {
    display: flex;
    align-items: center;
    height: 36px;
    padding: 0 16px;
    border-bottom: 1px solid var(--dc-border, #e2e8f0);
  }
  .app-title {
    font-weight: 700;
    font-size: 14px;
    color: var(--dc-text-primary, #1e293b);
    margin-right: 32px;
  }
  .tabs-container {
    display: flex;
    height: 100%;
  }
  .menu-tab {
    padding: 0 16px;
    height: 100%;
    display: flex;
    align-items: center;
    font-size: 13px;
    cursor: pointer;
    color: var(--dc-text-primary, #334155);
    border-bottom: 2px solid transparent;
    transition: all 0.2s;
  }
  .menu-tab:hover {
    color: var(--dc-edge-selected, #3b82f6);
  }
  .menu-tab.is-active {
    color: var(--dc-edge-selected, #3b82f6);
    border-bottom-color: var(--dc-edge-selected, #3b82f6);
    font-weight: 600;
  }
  .menu-right-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .menu-toolbar-row {
    height: 72px;
    background: var(--dc-preview-header-bg, #f4f5f7);
    padding: 8px 16px;
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--dc-border, #e2e8f0);
  }
  .tool-group {
    display: flex;
    gap: 16px;
  }
  .tool-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 64px;
    padding: 4px 8px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .tool-btn:hover {
    background: rgba(0, 0, 0, 0.05);
  }
  .tool-btn.is-disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .tool-btn.is-disabled:hover {
    background: transparent;
  }
  .tool-icon {
    margin-bottom: 4px;
  }
  .tool-text {
    font-size: 12px;
    color: var(--dc-text-primary, #334155);
    white-space: nowrap;
  }
</style>
