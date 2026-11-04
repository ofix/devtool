<template>
    <BaseNode :node="node" :selected="selected" @preview="$emit('trigger-run')">
        <div class="json-extract-panel">
            <div class="hint-text">
                勾选需要提取的字段，系统会自动将其拼装为表格。
            </div>

            <div class="path-selector dc-custom-scrollbar" v-if="upstreamSchema.length > 0">
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
            
            <div class="empty-warning" v-else>
                请先连接上游 JSON 数据。
            </div>
        </div>
    </BaseNode>
</template>

<script setup>
import { ref, computed, watch, nextTick } from "vue";
import BaseNode from "./BaseNode.vue";
import { useStoreDataCleanGraph } from "../../stores/StoreDataCleanGraph.js";
import { useStoreDataCleanMeta } from "../../stores/StoreDataCleanMeta.js";

const props = defineProps({ node: { type: Object, required: true }, selected: { type: Boolean, default: false } });
const emit = defineEmits(["trigger-run"]);
const graphStore = useStoreDataCleanGraph();
const metaStore = useStoreDataCleanMeta();

const treeRef = ref(null);

// 获取上游 Schema
const upstreamSchema = computed(() => {
    const edges = graphStore.getIncomingEdges(props.node.id);
    if (edges.length === 0) return [];
    return metaStore.getMeta(edges[0].source).jsonSchemaTree || [];
});

// 当勾选状态变化时
function onCheckChange() {
    if (!treeRef.value) return;
    const checkedNodes = treeRef.value.getCheckedNodes();
    
    // 只保留叶子节点（基础类型）
    const leafNodes = checkedNodes.filter(n => !n.children || n.children.length === 0);

    // 组装 fields 参数: [{ path: 'user.name', alias: 'name' }]
    const fields = leafNodes.map(leafData => {
        let pathSegments = [];
        let current = leafData;
        
        // 向上溯源拿到完整路径
        while (current && current.label !== "root") {
            pathSegments.unshift(current.label);
            current = current.parent;
        }
        
        // 如果路径中出现特殊字符，这里可以稍微处理一下，但底层有 getValueByPath 兜底
        const pathStr = pathSegments.join(".");
        
        return {
            path: pathStr,
            alias: leafData.label // 默认别名就用字段名
        };
    });

    graphStore.updateNodeParams(props.node.id, { fields });
    emit("trigger-run");
}
</script>

<style scoped>
.json-extract-panel { width: 100%; max-width: 340px; overflow: hidden; display: flex; flex-direction: column; gap: 8px; }
.hint-text { font-size: 11px; color: var(--dc-text-secondary); margin-bottom: 4px; line-height: 1.4; }
.path-selector { border: 1px solid var(--dc-border); border-radius: 4px; max-height: 220px; overflow-y: auto; overflow-x: hidden; padding: 4px; background: var(--dc-node-bg); }
.tree-node { display: flex; align-items: center; gap: 6px; font-size: 12px; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tree-node .type { font-size: 10px; color: var(--dc-text-secondary); opacity: 0.7; }
.tree-node .count-tag { background: rgba(139, 92, 246, 0.1); color: #8b5cf6; font-size: 9px; padding: 1px 4px; border-radius: 3px; font-family: monospace; }
.empty-warning { font-size: 11px; color: #f59e0b; background: #fef3c7; padding: 6px 8px; border-radius: 4px; margin-top: 4px; }
</style>
