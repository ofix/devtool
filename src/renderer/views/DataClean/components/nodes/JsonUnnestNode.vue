<template>
  <BaseNode :node="node" :selected="selected" @preview="$emit('trigger-run')">
    <div class="unnest-panel">
      <div class="hint-text">将选定的数组字段“炸开”为多行数据。</div>

      <ParamRow label="展开数组">
        <el-select
          v-model="targetPath"
          size="small"
          placeholder="请选择要展开的数组"
          style="width: 100%"
          @change="onPathChange"
        >
          <el-option
            v-for="opt in arrayOptions"
            :key="opt.path"
            :label="opt.label"
            :value="opt.path"
          />
        </el-select>
      </ParamRow>

      <div v-if="arrayOptions.length === 0" class="empty-warning">
        ⚠️ 上游数据中未检测到数组字段，无法执行展开。
      </div>
    </div>
  </BaseNode>
</template>

<script setup>
  import { ref, computed, watch } from "vue"
  import BaseNode from "./BaseNode.vue"
  import ParamRow from "../params/ParamRow.vue"
  import { useStoreDataCleanGraph } from "../../stores/StoreDataCleanGraph.js"
  import { useStoreDataCleanMeta } from "../../stores/StoreDataCleanMeta.js"

  const props = defineProps({
    node: { type: Object, required: true },
    selected: { type: Boolean, default: false },
  })
  const emit = defineEmits(["trigger-run"])
  const graphStore = useStoreDataCleanGraph()
  const metaStore = useStoreDataCleanMeta()

  const targetPath = ref(props.node.params?.targetPath || "")

  watch(
    () => props.node.params,
    newParams => {
      if (newParams) targetPath.value = newParams.targetPath || ""
    },
    { deep: true },
  )

  // 核心算法：递归遍历上游 Schema 树，提取出所有类型为 "[]" 的节点
  const arrayOptions = computed(() => {
    const edges = graphStore.getIncomingEdges(props.node.id)
    if (edges.length === 0) return []

    const sourceId = edges[0].source
    const schema = metaStore.getMeta(sourceId).jsonSchemaTree || []

    const options = []

    function traverse(nodes) {
      for (const node of nodes) {
        // 如果这个节点是数组，加入下拉列表
        if (node.typeLabel && node.typeLabel.includes("[]")) {
          options.push({
            label: `${node.label} ${node.typeLabel}`,
            path: node.path.replace(/^\$\./, "").replace(/^root\.?/, ""),
          })
        }
        // 如果有子节点，继续往下找
        if (node.children && node.children.length > 0) {
          traverse(node.children)
        }
      }
    }

    traverse(schema)
    return options
  })

  function onPathChange(val) {
    graphStore.updateNodeParams(props.node.id, { targetPath: val })
    emit("trigger-run")
  }
</script>

<style scoped>
  .unnest-panel {
    width: 100%;
    max-width: 340px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .hint-text {
    font-size: 11px;
    color: var(--dc-text-secondary);
    line-height: 1.4;
  }

  .empty-warning {
    font-size: 11px;
    color: #f59e0b;
    background: #fef3c7;
    padding: 6px 8px;
    border-radius: 4px;
    margin-top: 4px;
  }
</style>
