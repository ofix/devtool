<template>
  <BaseNode :node="node" :selected="selected" @preview="$emit('trigger-run')">
    <div class="json-transform-panel">
      <div class="mode-switch">
        <el-radio-group v-model="mode" size="small" @change="onModeChange">
          <el-radio-button value="visual">可视化</el-radio-button>
          <el-radio-button value="advanced">高级表达式</el-radio-button>
        </el-radio-group>
      </div>

      <!-- 可视化模式 -->
      <div v-if="mode === 'visual'" class="visual-mode">
        <div class="hint-text" v-if="upstreamSchema.length === 0">请连接上游 JSON 数据。</div>
        <div class="path-selector dc-custom-scrollbar" v-else>
          <el-tree
            :data="upstreamSchema"
            :props="{ label: 'label', children: 'children' }"
            node-key="path"
            @node-click="onPathSelect"
            highlight-current
          >
            <template #default="{ node, data }">
              <span class="tree-node">
                <span>{{ data.label }}</span>
                <span class="type">{{ data.typeLabel }}</span>
                <span v-if="data.countTag" class="count-tag">{{ data.countTag }}</span>
              </span>
            </template>
          </el-tree>
        </div>
      </div>

      <!-- 高级模式 -->
      <div v-else class="advanced-mode">
        <div class="hint-text">
          支持 jq 语法（例如：<code>.items[] | select(.price > 100)</code>）
        </div>
        <el-input
          v-model="jqCode"
          type="textarea"
          :rows="5"
          placeholder=".items[] | {id, name}"
          @input="onJqInput"
          class="dc-custom-scrollbar"
        />
      </div>
    </div>
  </BaseNode>
</template>

<script setup>
  import { ref, computed, watch } from "vue"
  import BaseNode from "./BaseNode.vue"
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

  const upstreamSchema = computed(() => {
    const edges = graphStore.getIncomingEdges(props.node.id)
    if (edges.length === 0) return []
    const sourceId = edges[0].source
    return metaStore.getMeta(sourceId).jsonSchemaTree || []
  })

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

  function onPathSelect(data) {
    // 1. 基础路径（去掉根节点前缀）
    let path = data.path === "root" ? "" : data.path

    // 2. 判断顶层是不是数组，如果是，必须先加上 .[] 才能取值
    // 我们通过检查上游 Schema 树的根节点类型来判断
    const isRootArray =
      upstreamSchema.value.length > 0 && upstreamSchema.value[0].typeLabel === "[]"

    let generatedJq = ""

    if (isRootArray) {
      generatedJq = `.[]`
      if (path) {
        generatedJq += ` | .${path}`
      }
    } else {
      generatedJq = path ? `.${path}` : "."
    }

    // 3. 如果用户点选的节点本身也是数组，自动加上 [] 展开
    if (data.typeLabel.includes("[]")) {
      generatedJq += "[]"
    }

    jqCode.value = generatedJq
    graphStore.updateNodeParams(props.node.id, { jqCode: generatedJq })
    emit("trigger-run")
  }

  function onJqInput(val) {
    graphStore.updateNodeParams(props.node.id, { jqCode: val })
  }
</script>

<style scoped>
  /* 修改这里的宽度，并加上 overflow: hidden */
  .json-transform-panel {
    width: 100%; /* 不要写死 320px，让节点自动适应 BaseNode 的宽度 */
    max-width: 340px;
    overflow: hidden; /* 强制隐藏超出的部分，干掉横向滚动条 */
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* 优化树容器 */
  .path-selector {
    border: 1px solid var(--dc-border);
    border-radius: 4px;
    max-height: 200px;
    overflow-y: auto;
    overflow-x: hidden; /* 禁止树的横向滚动 */
    padding: 4px;
    background: var(--dc-node-bg);
  }

  /* 让树节点内容不要超长 */
  .tree-node {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* 重新排版右侧高级表达式 */
  .advanced-mode {
    width: 100%;
  }
  .advanced-mode :deep(.el-textarea__inner) {
    font-family: monospace;
    font-size: 12px;
    line-height: 1.5;
    width: 100% !important; /* 强制输入框宽度 100% */
    box-sizing: border-box; /* 防止 padding 撑破宽度 */
  }
</style>
