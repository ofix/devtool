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
      <!-- 所有专属节点（数据源或特殊UI） -->
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
      <template #node-jqExpression="nodeProps">
        <JqExpressionNode
          :node="nodeProps.data"
          :selected="nodeProps.selected"
          @trigger-run="$emit('trigger-run')"
        />
      </template>
      <template #node-jsonUnnest="nodeProps">
        <JsonUnnestNode
          :node="nodeProps.data"
          :selected="nodeProps.selected"
          @trigger-run="$emit('trigger-run')"
        />
      </template>
      <template #node-jsonExtract="nodeProps">
        <JsonExtractNode
          :node="nodeProps.data"
          :selected="nodeProps.selected"
          @trigger-run="$emit('trigger-run')"
        />
      </template>
      <template #node-jsonFilter="nodeProps">
        <JsonFilterNode
          :node="nodeProps.data"
          :selected="nodeProps.selected"
          @trigger-run="$emit('trigger-run')"
        />
      </template>
      <template #node-filter="nodeProps">
        <FilterNode
          :node="nodeProps.data"
          :selected="nodeProps.selected"
          @trigger-run="$emit('trigger-run')"
        />
      </template>

      <!-- 统一使用 TransformNode 渲染的算子（Table类） -->
      <template v-for="type in transformTypes" :key="type" #[`node-${type}`]="nodeProps">
        <TransformNode
          :node="nodeProps.data"
          :selected="nodeProps.selected"
          @trigger-run="$emit('trigger-run')"
        />
      </template>

      <!-- 源节点/输出节点使用 BaseNode 或 壳子 -->
      <template v-for="type in sourceAndSinkTypes" :key="type" #[`node-${type}`]="nodeProps">
        <TransformNode
          :node="nodeProps.data"
          :selected="nodeProps.selected"
          @trigger-run="$emit('trigger-run')"
        />
      </template>

      <!-- 调试节点 -->
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
    </VueFlow>
  </div>
</template>

<script setup>
  import { computed, onMounted, onBeforeUnmount, ref } from "vue";
  import { VueFlow, useVueFlow } from "@vue-flow/core";
  import { ElMessage } from "element-plus";

  // 新的 UI 路径
  import CsvReaderNode from "./CsvReaderNode.vue";
  import JsonReaderNode from "./JsonReaderNode.vue";
  import JqExpressionNode from "./JqExpressionNode.vue";
  import JsonUnnestNode from "./JsonUnnestNode.vue";
  import JsonExtractNode from "./JsonExtractNode.vue";
  import JsonFilterNode from "./JsonFilterNode.vue";
  import FilterNode from "./FilterNode.vue";
  import BaseNode from "./BaseNode.vue";
  import TransformNode from "./TransformNode.vue";
  import ParamRow from "../params/ParamRow.vue";

  import { useStoreDataCleanGraph } from "../../stores/StoreDataCleanGraph.js";
  // 引入新的元数据注册表，而不是旧的执行器
  import { getOperatorMeta } from "../operators/index.js";
  import { canConnect } from "../../constants/PortTypes.js";

  const isReady = ref(false);
  const emit = defineEmits(["trigger-run"]);
  const graphStore = useStoreDataCleanGraph();
  const { setViewport } = useVueFlow();

  // 拆分：表格处理类（输入/输出1对1）
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
    "dynamicRename",
    "csvWriter",
    "xlsxWriter",
    "jsonWriter",
    "dbWriter",
  ];

  // 拆分：源节点与特殊节点（没有上游，或特殊UI）
  const sourceAndSinkTypes = [
    "folderInput",
    "folderOutput",
    "xlsxInput",
    "xlsxOutput",
    "dbConnection",
    "dbQuery",
    "script",
    "jsonUnpivot",
    "jsonFlatten",
    "output",
  ];

  // 节点高亮逻辑保持不变
  const activeNodeIds = computed(() => {
    if (!graphStore.activeLineageGraph) return new Set();
    return new Set(graphStore.activeLineageGraph.map(item => item.nodeId));
  });

  const nodes = computed(() =>
    graphStore.nodes.map(n => {
      const isActive = activeNodeIds.value.size === 0 || activeNodeIds.value.has(n.id);
      return {
        id: n.id,
        type: n.type,
        position: n.position,
        data: n,
        class: isActive ? "" : "opacity-20",
      };
    }),
  );

  const edges = computed(() =>
    graphStore.edges.map(e => {
      const isActive =
        activeNodeIds.value.size === 0 ||
        (activeNodeIds.value.has(e.source) && activeNodeIds.value.has(e.target));
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        class: isActive ? "" : "opacity-20",
        style:
          isActive && activeNodeIds.value.size > 0
            ? {
                stroke: "#3b82f6",
                strokeWidth: 3,
                strokeDasharray: "5 5",
                animation: "dash 1s linear infinite",
              }
            : {},
      };
    }),
  );

  // 连线类型校验直接读 Meta 配置
  // 连线类型校验：按源节点输出形态 + 目标节点支持的输入形态判断
  function onConnect(params) {
    const sourceNode = graphStore.getNode(params.source);
    const targetNode = graphStore.getNode(params.target);
    if (!sourceNode || !targetNode) return;

    const sourceMeta = getOperatorMeta(sourceNode.type);
    const targetMeta = getOperatorMeta(targetNode.type);
    if (!sourceMeta || !targetMeta) return;

    // 源节点输出形态：源节点 meta 不声明，按 outputPorts 和类型推断
    // - 源节点（inputPorts === 0）：按 category 推断，csvReader → table，jsonReader → json
    // - 中间节点：输入形态决定输出形态，静态校验只能近似
    const sourceOutputKind = inferOutputKind(sourceMeta, sourceNode);

    const targetSupports = targetMeta.inputRecordSetsSupport ?? [];
    if (targetSupports.length === 0) {
      ElMessage.warning(t("graph.edge.targetNoInput"));
      return;
    }
    if (!targetSupports.includes(sourceOutputKind)) {
      ElMessage.warning(
        t("graph.edge.typeIncompatible", {
          source: sourceOutputKind,
          target: targetSupports.join("/"),
        }),
      );
      return;
    }

    // 落库，重复/端口占用/成环都由 addEdge 判断
    const code = graphStore.addEdge({
      id: `e-${params.source}-${params.target}-${Date.now()}`,
      source: params.source,
      target: params.target,
      sourceHandle: params.sourceHandle,
      targetHandle: params.targetHandle,
    });

    if (code !== EDGE_OK) {
      ElMessage.warning(t(edgeErrorI18nKey(code)));
      return;
    }

    graphStore.setSelected(params.target);
    emit("trigger-run");
  }

  /**
   * 推断源节点输出形态。
   * - 源节点（inputPorts === 0）：按 category 推断
   * - 中间节点：输入形态决定输出形态，静态校验只能近似
   */
  function inferOutputKind(sourceMeta, sourceNode) {
    // 源节点：按类型推断
    if (sourceMeta.inputPorts === 0) {
      if (sourceNode.type === "jsonReader") return "json";
      if (sourceNode.type === "csvReader") return "table";
      // 其他源节点默认 table
      return "table";
    }

    // 中间节点：取上游输入形态，上游未连时按 meta.inputRecordSetsSupport 第一个推断
    const inEdges = graphStore.getIncomingEdges(sourceNode.id);
    if (inEdges.length > 0) {
      const upstreamNode = graphStore.getNode(inEdges[0].source);
      const upstreamMeta = upstreamNode ? getOperatorMeta(upstreamNode.type) : null;
      if (upstreamMeta) {
        return inferOutputKind(upstreamMeta, upstreamNode);
      }
    }

    // 兜底：按支持的输入形态第一个推断
    const supports = sourceMeta.inputRecordSetsSupport ?? ["table"];
    return supports[0] ?? "table";
  }

  const contextMenu = ref({ visible: false, x: 0, y: 0 });
  function onNodeContextMenu(event) {
    event.event.preventDefault();
    graphStore.setSelected(event.node.id);
    contextMenu.value = { visible: true, x: event.event.clientX, y: event.event.clientY };
  }
  function onEdgeContextMenu(event) {
    event.event.preventDefault();
    graphStore.removeEdge(event.edge.id);
    emit("trigger-run");
  }
  function onPaneContextMenu(event) {
    event.event.preventDefault();
    graphStore.setSelected(null);
    contextMenu.value.visible = false;
  }
  function onWindowClick() {
    contextMenu.value.visible = false;
  }
  function deleteCurrentNode() {
    const id = graphStore.selectedNodeId;
    if (id) {
      graphStore.removeNode(id);
      emit("trigger-run");
    }
    contextMenu.value.visible = false;
  }
  function handleKeyDown(e) {
    if (
      (e.key === "Delete" || e.key === "Backspace") &&
      !["INPUT", "TEXTAREA"].includes(e.target.tagName) &&
      !e.target.isContentEditable
    ) {
      e.preventDefault();
      const id = graphStore.selectedNodeId;
      if (id) {
        graphStore.removeNode(id);
        emit("trigger-run");
      }
    }
  }
  function onPaneReady() {
    setViewport({ x: 0, y: 0, zoom: 1 });
  }
  onMounted(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("click", onWindowClick);
    setTimeout(() => {
      isReady.value = true;
    }, 100);
  });
  onBeforeUnmount(() => {
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("click", onWindowClick);
  });
  function onNodesChange(changes) {
    for (const c of changes) {
      if (c.type === "position" && c.position) graphStore.updateNodePosition(c.id, c.position);
      else if (c.type === "remove") {
        graphStore.removeNode(c.id);
        emit("trigger-run");
      }
    }
  }
  function onEdgesChange(changes) {
    for (const c of changes) {
      if (c.type === "remove") {
        graphStore.removeEdge(c.id);
        emit("trigger-run");
      }
    }
  }
  function onNodeClick(event) {
    const id = event?.node?.id;
    if (id) graphStore.setSelected(id);
  }
  function onPaneClick() {
    graphStore.setSelected(null);
    contextMenu.value.visible = false;
  }
  function onMessageChange(id, val) {
    graphStore.updateNodeParams(id, { text: val });
    emit("trigger-run");
  }
  function handleMouseDownCapture(e) {
    const t = e.target;
    if (
      t &&
      (t.tagName === "INPUT" ||
        t.tagName === "TEXTAREA" ||
        t.closest(".el-input") ||
        t.closest(".el-select") ||
        t.closest(".el-checkbox") ||
        t.closest(".el-radio-group") ||
        t.closest(".el-switch") ||
        t.closest(".cm-editor"))
    ) {
      e.stopPropagation();
    }
  }
</script>

<style scoped>
  /* 样式部分完全保留你原有的设定，一字未改 */
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
  :deep(.vue-flow__node.opacity-20),
  :deep(.vue-flow__edge.opacity-20) {
    opacity: 0.2;
    transition: opacity 0.3s ease;
  }
  @keyframes dash {
    to {
      stroke-dashoffset: -10;
    }
  }
</style>
