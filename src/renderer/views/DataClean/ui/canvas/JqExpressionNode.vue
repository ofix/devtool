<!-- ==== FILE: src/renderer/views/DataClean/components/nodes/JqExpressionNode.vue ==== -->
<template>
  <BaseNode :node="node" :selected="selected" @preview="$emit('trigger-run')">
    <div class="jq-panel">
      <!-- 顶部工具栏 -->
      <div class="panel-toolbar">
        <el-radio-group v-model="mode" size="small" @change="onModeChange">
          <el-radio-button value="visual">可视化点选</el-radio-button>
          <el-radio-button value="advanced">高级 JQ</el-radio-button>
        </el-radio-group>

        <!-- 帮助按钮 -->
        <el-button
          v-if="mode === 'advanced'"
          size="small"
          type="primary"
          plain
          @click="showHelp = true"
        >
          📖 JQ 帮助
        </el-button>
      </div>

      <!-- 可视化点选模式 (假设你已有此部分) -->
      <div v-if="mode === 'visual'" class="visual-mode">
        <div class="hint-text" v-if="upstreamSchema.length === 0">请连接上游数据。</div>
        <!-- 这里放你之前的树形勾选组件 -->
      </div>

      <!-- 高级代码模式 -->
      <div v-else class="advanced-mode">
        <el-input
          v-model="jqCode"
          type="textarea"
          :rows="6"
          placeholder="输入 JQ 表达式，或点击右上角帮助查看示例"
          @input="onJqInput"
          class="dc-custom-scrollbar"
        />
      </div>

      <!-- 挂载帮助弹窗 -->
      <JqHelpDialog v-model:visible="showHelp" @apply="handleApplyCode" />
    </div>
  </BaseNode>
</template>

<script setup>
  import { ref, computed, watch } from "vue"
  import BaseNode from "./BaseNode.vue"
  import JqHelpDialog from "../expression/JqHelpDialog.vue" // 1. 引入 Dialog
  import { useStoreDataCleanGraph } from "../../stores/StoreDataCleanGraph.js"
  import { useStoreDataCleanMeta } from "../../stores/StoreDataCleanMeta.js"

  const props = defineProps({
    node: { type: Object, required: true },
    selected: { type: Boolean, default: false },
  })
  const emit = defineEmits(["trigger-run"])
  const graphStore = useStoreDataCleanGraph()
  const metaStore = useStoreDataCleanMeta()

  const mode = ref(props.node.params?.mode || "visual")
  const jqCode = ref(props.node.params?.jqCode || ".")
  const showHelp = ref(false) // 2. 控制弹窗显示的变量

  // 获取上游 Schema（省略具体实现，保持原有逻辑）
  const upstreamSchema = computed(() => {
    const edges = graphStore.getIncomingEdges(props.node.id)
    if (edges.length === 0) return []
    return metaStore.getMeta(edges[0].source).jsonSchemaTree || []
  })

  // 同步外部参数
  watch(
    () => props.node.params,
    newParams => {
      if (newParams) {
        mode.value = newParams.mode || "visual"
        jqCode.value = newParams.jqCode || "."
      }
    },
    { deep: true },
  )

  function onModeChange(val) {
    graphStore.updateNodeParams(props.node.id, { mode: val })
  }

  function onJqInput(val) {
    graphStore.updateNodeParams(props.node.id, { jqCode: val })
    emit("trigger-run")
  }

  // 3. 接收弹窗抛出的代码，应用到当前节点
  function handleApplyCode(code) {
    jqCode.value = code
    graphStore.updateNodeParams(props.node.id, { jqCode: code })
    emit("trigger-run") // 触发重算
  }
</script>

<style scoped>
  .jq-panel {
    width: 100%;
    max-width: 340px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .panel-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }
  .hint-text {
    font-size: 11px;
    color: var(--dc-text-secondary);
  }
  .advanced-mode :deep(.el-textarea__inner) {
    font-family: monospace;
    font-size: 12px;
    line-height: 1.5;
  }
</style>
