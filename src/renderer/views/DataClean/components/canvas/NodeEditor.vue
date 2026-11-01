<!-- 确保所有通用 TransformNode 都能抛出 trigger-run 事件 -->
<template>
  <div class="node-editor">
    <VueFlow
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
    >
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

      <template #node-filter="nodeProps">
        <FilterNode
          :node="nodeProps.data"
          :selected="nodeProps.selected"
          @trigger-run="$emit('trigger-run')"
        />
      </template>

      <!-- 其他所有通用算子共享 TransformNode，并绑定 trigger-run -->
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
  /* 保持原有逻辑不变 */
  import { computed, onMounted, onBeforeUnmount, watch } from "vue"
  import { VueFlow, useVueFlow } from "@vue-flow/core"
  import { ElMessage } from "element-plus"
  import JsonReaderNode from "../nodes/JsonReaderNode.vue"
  import CsvReaderNode from "../nodes/CsvReaderNode.vue"
  import OutputNode from "../nodes/OutputNode.vue"
  import BaseNode from "../nodes/BaseNode.vue"
  import TransformNode from "../nodes/TransformNode.vue"
  import FilterNode from "../nodes/FilterNode.vue"
  import ParamRow from "../params/ParamRow.vue"
  import { useStoreDataCleanGraph } from "../../stores/StoreDataCleanGraph.js"
  import { getOperator } from "../../engine/operators/index.js"
  import { canConnect } from "../../constants/PortTypes.js"

  const emit = defineEmits(["trigger-run"])
  const graphStore = useStoreDataCleanGraph()
  const { setViewport, viewport } = useVueFlow()

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

  function onPaneReady() {
    // 强制在画布渲染完毕后，直接设置一个比较舒服的缩放比例
    console.log("Pane ready, setting viewport to 0.8")
    setViewport({ x: 0, y: 0, zoom: 0.8 })
  }

  const nodes = computed(() =>
    graphStore.nodes.map(n => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: n,
    })),
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

  const { removeSelectedElements } = useVueFlow()

  function handleKeyDown(e) {
    if (e.key === "Delete" || e.key === "Backspace") {
      const tag = e.target.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return
      e.preventDefault()
      removeSelectedElements()
    }
  }

  onMounted(() => {
    window.addEventListener("keydown", handleKeyDown)
    // 延迟 100 毫秒，等待节点 DOM 挂载完毕
    setTimeout(() => {
      // 强制将视图缩放设为 0.8（也就是缩小到 80%）
      setViewport({ x: 0, y: 0, zoom: 0.8 })
    }, 100)
  })
  onBeforeUnmount(() => window.removeEventListener("keydown", handleKeyDown))

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

  function onConnect(params) {
    const sourceNode = graphStore.getNode(params.source)
    const targetNode = graphStore.getNode(params.target)
    if (!sourceNode || !targetNode) return

    const sourceOp = getOperator(sourceNode.type)
    const targetOp = getOperator(targetNode.type)
    if (!sourceOp || !targetOp) return

    if (!canConnect(sourceOp.meta.outputPortType, targetOp.meta.inputPortType)) {
      ElMessage.warning(`端口类型不兼容`)
      return
    }

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

  function onNodeClick(event) {
    const id = event && event.node ? event.node.id : null
    if (id) graphStore.setSelected(id)
  }
  function onPaneClick() {
    graphStore.setSelected(null)
  }
  function onMessageChange(id, val) {
    graphStore.updateNodeParams(id, { text: val })
    emit("trigger-run")
  }

  watch(
    viewport,
    newVal => {
      console.log("当前视口:", newVal)
      console.log("当前缩放比例:", newVal.zoom)
    },
    { deep: true },
  )
</script>

<style scoped>
  .node-editor {
    width: 100%;
    height: 100%;
    background: var(--dc-canvas-bg, #e5e7eb);
    outline: none;
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
