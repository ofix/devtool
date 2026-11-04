<template>
  <div class="node-editor" @mousedown.capture="handleMouseDownCapture">
    <!-- 右键菜单 -->
    <div
      v-if="contextMenu.visible"
      class="context-menu"
      :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
    >
      <div class="menu-item" @click="deleteCurrentNode">删除 (Delete)</div>
    </div>

    <VueFlow
      v-if="isReady"
      :nodes="nodes"
      :edges="edges"
      @pane-ready="onPaneReady"
      :default-viewport="{ zoom: 1 }"
      :min-zoom="0.2"
      :max-zoom="2"
      @connect="onConnect"
      @edges-change="onEdgesChange"
      @nodes-change="onNodesChange"
      @node-click="onNodeClick"
      @pane-click="onPaneClick"
      @node-context-menu="onNodeContextMenu"
      @edge-context-menu="onEdgeContextMenu"
      @pane-context-menu="onPaneContextMenu"
    >
      <!-- 数据源节点 -->
      <template #node-csvReader="nodeProps">
        <CsvReaderNode
          :node="nodeProps.data"
          :selected="nodeProps.selected"
          @trigger-run="$emit('trigger-run')"
        />
      </template>
      <template #node-jsonReader="nodeProps">
        <JsonReaderNode
          :node="nodeProps.data"
          :selected="nodeProps.selected"
          @trigger-run="$emit('trigger-run')"
        />
      </template>

      <!-- JSON 处理专属节点 -->
      <template #node-jsonTransform="nodeProps">
        <JsonTransformNode
          :node="nodeProps.data"
          :selected="nodeProps.selected"
          @trigger-run="$emit('trigger-run')"
        />
      </template>

      <!-- 输出与调试 -->
      <template #node-output="nodeProps">
        <OutputNode :node="nodeProps.data" :selected="nodeProps.selected" />
      </template>
      <template #node-message="nodeProps">
        <BaseNode :node="nodeProps.data" :selected="nodeProps.selected">
          <ParamRow label="消息">
            <el-input
              :model-value="nodeProps.data.params.text || ''"
              size="small"
              placeholder="调试消息"
              @change="v => onMessageChange(nodeProps.data.id, v)"
            />
          </ParamRow>
        </BaseNode>
      </template>

      <!-- 表格处理节点 -->
      <template #node-filter="nodeProps">
        <FilterNode
          :node="nodeProps.data"
          :selected="nodeProps.selected"
          @trigger-run="$emit('trigger-run')"
        />
      </template>
      <template v-for="type in transformTypes" :key="type" #[`node-${type}`]="nodeProps">
        <TransformNode
          :node="nodeProps.data"
          :selected="nodeProps.selected"
          @trigger-run="$emit('trigger-run')"
        />
      </template>
    </VueFlow>
  </div>
</template>

<script setup>
  import { computed, onMounted, onBeforeUnmount, ref } from "vue"
  import { VueFlow, useVueFlow } from "@vue-flow/core"
  import { ElMessage } from "element-plus"
  import CsvReaderNode from "../nodes/CsvReaderNode.vue"
  import JsonReaderNode from "../nodes/JsonReaderNode.vue"
  import JsonTransformNode from "../nodes/JsonTransformNode.vue" // 新增
  import OutputNode from "../nodes/OutputNode.vue"
  import BaseNode from "../nodes/BaseNode.vue"
  import TransformNode from "../nodes/TransformNode.vue"
  import FilterNode from "../nodes/FilterNode.vue"
  import ParamRow from "../params/ParamRow.vue"
  import { useStoreDataCleanGraph } from "../../stores/StoreDataCleanGraph.js"
  import { getOperator } from "../../engine/operators/index.js"
  import { canConnect } from "../../constants/PortTypes.js"

  const isReady = ref(false)
  const emit = defineEmits(["trigger-run"])
  const graphStore = useStoreDataCleanGraph()
  const { setViewport } = useVueFlow()

  const transformTypes = [
    "select",
    "sort",
    "unique",
    "sample",
    "formula",
    "join",
    "union",
    "summarize",
    "transpose",
    "crossTab",
    "countRecords",
    "textToColumns",
    "regexExtract",
    "folderInput",
    "folderOutput",
    "script",
    "dynamicRename",
    "xlsxInput",
    "xlsxOutput",
    "dbConnection",
    "dbQuery",
  ]

  const nodes = computed(() =>
    graphStore.nodes.map(n => ({ id: n.id, type: n.type, position: n.position, data: n })),
  )
  const edges = computed(() =>
    graphStore.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
    })),
  )

  // ====== 右键菜单逻辑 ======
  const contextMenu = ref({ visible: false, x: 0, y: 0 })

  function onNodeContextMenu(event) {
    event.event.preventDefault()
    graphStore.setSelected(event.node.id)
    contextMenu.value = { visible: true, x: event.event.clientX, y: event.event.clientY }
  }

  function onEdgeContextMenu(event) {
    event.event.preventDefault()
    graphStore.removeEdge(event.edge.id)
    emit("trigger-run")
  }

  function onPaneContextMenu(event) {
    event.event.preventDefault()
    graphStore.setSelected(null)
    contextMenu.value.visible = false
  }

  function onWindowClick() {
    contextMenu.value.visible = false
  }

  function deleteCurrentNode() {
    const id = graphStore.selectedNodeId
    if (id) {
      graphStore.removeNode(id)
      emit("trigger-run")
    }
    contextMenu.value.visible = false
  }

  // ====== 键盘删除 ======
  function handleKeyDown(e) {
    if (e.key === "Delete" || e.key === "Backspace") {
      const tag = e.target.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return
      e.preventDefault()
      const id = graphStore.selectedNodeId
      if (id) {
        graphStore.removeNode(id)
        emit("trigger-run")
      }
    }
  }

  // ====== 画布初始化 ======
  function onPaneReady() {
    setViewport({ x: 0, y: 0, zoom: 1 })
  }

  onMounted(() => {
    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("click", onWindowClick)
    setTimeout(() => {
      isReady.value = true
    }, 100)
  })

  onBeforeUnmount(() => {
    window.removeEventListener("keydown", handleKeyDown)
    window.removeEventListener("click", onWindowClick)
  })

  // ====== Vue Flow 变更监听 ======
  function onNodesChange(changes) {
    for (const change of changes) {
      if (change.type === "position" && change.position) {
        graphStore.updateNodePosition(change.id, change.position)
      } else if (change.type === "remove") {
        graphStore.removeNode(change.id)
        emit("trigger-run")
      }
    }
  }

  function onEdgesChange(changes) {
    for (const change of changes) {
      if (change.type === "remove") {
        graphStore.removeEdge(change.id)
        emit("trigger-run")
      }
    }
  }

  // ====== 连线逻辑（核心：类型强校验） ======
  function onConnect(params) {
    const sourceNode = graphStore.getNode(params.source)
    const targetNode = graphStore.getNode(params.target)
    if (!sourceNode || !targetNode) return

    const sourceOp = getOperator(sourceNode.type)
    const targetOp = getOperator(targetNode.type)
    if (!sourceOp || !targetOp) return

    // 优先使用新的 outputCategory/inputCategory 契约
    const sourceCategory = sourceOp.meta.outputCategory || "table"
    const targetCategory = targetOp.meta.inputCategory

    // 如果目标节点的类型契约是动态的，或者未声明，暂时放行
    if (targetCategory && targetCategory !== "dynamic") {
      // JSON 连到 Table 算子，或者 Table 连到 JSON 算子，拦截
      if (sourceCategory !== targetCategory && sourceCategory !== "dynamic") {
        ElMessage.warning(`类型不兼容：上游输出 [${sourceCategory}]，下游要求 [${targetCategory}]`)
        return
      }
    }

    // 针对多输入节点（如 Join）的占用校验
    if (targetOp.meta.inputs > 1) {
      const existingInputs = graphStore.getIncomingEdges(params.target)
      const portHandle = params.targetHandle
      if (existingInputs.some(e => e.targetHandle === portHandle)) {
        ElMessage.warning(`该输入端口已被占用`)
        return
      }
    } else {
      if (graphStore.edges.some(e => e.source === params.source && e.target === params.target))
        return
    }

    graphStore.addEdge({
      id: `e-${params.source}-${params.target}-${Date.now()}`,
      source: params.source,
      target: params.target,
      sourceHandle: params.sourceHandle,
      targetHandle: params.targetHandle,
    })

    graphStore.setSelected(params.target)
    emit("trigger-run")
  }

  // ====== 选中与交互 ======
  function onNodeClick(event) {
    const id = event && event.node ? event.node.id : null
    if (id) graphStore.setSelected(id)
  }

  function onPaneClick() {
    graphStore.setSelected(null)
    contextMenu.value.visible = false
  }

  function onMessageChange(id, val) {
    graphStore.updateNodeParams(id, { text: val })
    emit("trigger-run")
  }

  // ====== 输入框拖拽拦截 ======
  function handleMouseDownCapture(e) {
    const target = e.target
    if (!target) return
    const isInteractive =
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.closest(".el-input") ||
      target.closest(".el-select") ||
      target.closest(".el-checkbox") ||
      target.closest(".el-radio-group") ||
      target.closest(".el-switch") ||
      target.closest(".cm-editor")
    if (isInteractive) {
      e.stopPropagation()
    }
  }
</script>

<style scoped>
  .node-editor {
    width: 100%;
    height: 100%;
    background: var(--dc-canvas-bg, #e5e7eb);
    outline: none;
    position: relative;
  }

  .context-menu {
    position: fixed;
    z-index: 9999;
    background: var(--dc-node-bg, #ffffff);
    border: 1px solid var(--dc-border, #e2e8f0);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    border-radius: 4px;
    padding: 4px 0;
    min-width: 120px;
  }

  .menu-item {
    padding: 6px 12px;
    font-size: 12px;
    color: #ef4444;
    cursor: pointer;
  }
  .menu-item:hover {
    background: var(--dc-preview-header-bg, #f8fafc);
  }

  :deep(.vue-flow__node) {
    background: transparent;
    border: none;
    padding: 0;
    border-radius: 0;
  }
  :deep(.vue-flow__edge-path) {
    stroke: var(--dc-edge-color, #64748b);
    stroke-width: 2;
  }
  :deep(.vue-flow__edge.selected .vue-flow__edge-path) {
    stroke: #3b82f6;
    stroke-width: 3;
  }
</style>
