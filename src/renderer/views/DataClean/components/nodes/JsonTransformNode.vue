<!-- ==== FILE: src/renderer/views/DataClean/components/nodes/JsonTransformNode.vue ==== -->
<template>
  <BaseNode :node="node" :selected="selected" @preview="$emit('trigger-run')">
    <div class="json-transform-panel">
      <div class="mode-switch">
        <el-radio-group v-model="mode" size="small" @change="onModeChange">
          <el-radio-button value="visual">可视化提取</el-radio-button>
          <el-radio-button value="advanced">高级表达式</el-radio-button>
        </el-radio-group>
      </div>

      <!-- 可视化模式 -->
      <div v-if="mode === 'visual'" class="visual-mode">
        <div class="hint-text" v-if="upstreamSchema.length === 0">请连接上游 JSON 数据。</div>
        <div class="path-selector dc-custom-scrollbar" v-else>
          <el-tree
            ref="treeRef"
            :data="upstreamSchema"
            :props="{ label: 'label', children: 'children' }"
            node-key="path"
            show-checkbox
            @check-change="onCheckChange"
            default-expand-all
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
        <div class="hint-text">支持 jq 语法（例如：<code>.[] | {name, id}</code>）</div>
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
  import { ref, computed, watch, nextTick } from "vue"
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
  const treeRef = ref(null)

  // 获取上游节点的 Schema
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

  // ==== FILE: src/renderer/views/DataClean/components/nodes/JsonTransformNode.vue ====

  // 省略前面的模板和 setup 引入...

  /**
   * 核心算法：向上溯源获取完整路径链
   * @param {object} leafNode - 用户勾选的叶子节点数据
   * @returns {Array} 路径段数组，例如 [{ key: 'vbs', isArray: false }, { key: 'errorid', isArray: false }]
   */
  function tracePath(leafNode) {
    const pathSegments = []
    let current = leafNode

    // 沿树向上爬，直到根节点
    while (current && current.label !== "root") {
      // 记录当前节点的 Key 以及它本身是不是数组
      // 注意：如果节点是 "*" 或者路径包含数组元素，我们在这里不好直接区分
      // 所以我们依赖 Schema 树上提供的节点信息
      pathSegments.unshift({
        key: current.label,
        type: current.typeLabel,
      })
      current = current.parent // 依赖 el-tree 节点自带的 parent 指针
    }
    return pathSegments
  }

  // 当用户在树上勾选字段时
  function onCheckChange() {
    if (!treeRef.value) return

    // 获取所有勾选的节点
    const checkedNodes = treeRef.value.getCheckedNodes()
    // 过滤出叶子节点（基础类型）
    const leafNodes = checkedNodes.filter(n => !n.children || n.children.length === 0)

    if (leafNodes.length === 0) {
      jqCode.value = "."
      graphStore.updateNodeParams(props.node.id, { jqCode: "." })
      return
    }

    // 判断顶层是数组还是对象
    const isRootArray = upstreamSchema.value[0]?.typeLabel === "[]"
    let rootPrefix = isRootArray ? ".[]" : "."

    // 如果只选了一个字段，生成简单的单列提取
    if (leafNodes.length === 1) {
      const leafData = leafNodes[0]
      const pathSegments = tracePath(leafData)

      // 拼接完整的 JQ 路径
      let jqPath = rootPrefix
      for (let i = 0; i < pathSegments.length; i++) {
        const seg = pathSegments[i]
        const isSpecial = !/^[a-zA-Z0-9_]+$/.test(seg.key)
        const accessor = isSpecial ? `.["${seg.key}"]` : `.${seg.key}`

        // 如果这个字段本身是数组，且在最后一位，我们需要展开它
        const isArray = seg.type.includes("[]")

        jqPath += ` | ${accessor}`
        if (isArray && i === pathSegments.length - 1) {
          jqPath += "[]"
        }
      }

      jqCode.value = jqPath
    } else {
      // 如果选了多个字段，生成对象构造语法 (Map)
      const fields = leafNodes
        .map(leafData => {
          const pathSegments = tracePath(leafData)

          let fullAccess = rootPrefix
          let outputKey = leafData.label

          for (let i = 0; i < pathSegments.length; i++) {
            const seg = pathSegments[i]
            const isSpecial = !/^[a-zA-Z0-9_]+$/.test(seg.key)
            const accessor = isSpecial ? `.["${seg.key}"]` : `.${seg.key}`
            fullAccess += ` | ${accessor}`
          }

          // 如果字段是特殊字符，比如 IP，加个引号保证 JQ 合法
          const safeKey = /^[a-zA-Z0-9_]+$/.test(outputKey) ? outputKey : `"${outputKey}"`
          return `${safeKey}: (${fullAccess})`
        })
        .join(", ")

      // 因为是构造对象，我们必须用 ( ) 包裹表达式的右侧，防止管道符优先级导致语法错误
      jqCode.value = `${rootPrefix} | {${fields}}`
    }

    graphStore.updateNodeParams(props.node.id, { jqCode: jqCode.value })
    emit("trigger-run")
  }

  function onJqInput(val) {
    graphStore.updateNodeParams(props.node.id, { jqCode: val })
  }
</script>

<style scoped>
  .json-transform-panel {
    width: 100%;
    max-width: 340px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .mode-switch {
    display: flex;
    justify-content: center;
  }
  .hint-text {
    font-size: 11px;
    color: var(--dc-text-secondary);
    margin-bottom: 4px;
    line-height: 1.4;
  }
  .hint-text code {
    background: var(--dc-border);
    padding: 1px 3px;
    border-radius: 2px;
    font-family: monospace;
  }

  .path-selector {
    border: 1px solid var(--dc-border);
    border-radius: 4px;
    max-height: 220px;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 4px;
    background: var(--dc-node-bg);
  }
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
  .tree-node .type {
    font-size: 10px;
    color: var(--dc-text-secondary);
    opacity: 0.7;
  }
  .tree-node .count-tag {
    background: rgba(139, 92, 246, 0.1);
    color: #8b5cf6;
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 3px;
    font-family: monospace;
  }

  .advanced-mode {
    width: 100%;
  }
  .advanced-mode :deep(.el-textarea__inner) {
    font-family: monospace;
    font-size: 12px;
    line-height: 1.5;
    width: 100% !important;
    box-sizing: border-box;
  }
</style>
