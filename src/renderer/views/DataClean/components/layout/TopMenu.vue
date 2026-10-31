<!-- 增加暗黑模式切换按钮，清理旧样式 -->
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
                <span class="auto-run-tip">自动运行已开启</span>
                <el-button size="small" @click="$emit('save')">保存管线</el-button>
                <el-button size="small" @click="$emit('load')">加载管线</el-button>
                <el-button size="small" @click="$emit('fit')">适应画布</el-button>
                <!-- 主题切换 -->
                <el-button size="small" @click="toggleTheme">
                    {{ isDark ? '亮色' : '暗色' }}
                </el-button>
            </div>
        </div>
        <div class="menu-toolbar-row">
            <div class="tool-group">
                <div
                    v-for="op in activeOps"
                    :key="op.type"
                    class="tool-btn"
                    @click="onAddNode(op.type)"
                >
                    <div class="tool-icon" :style="{ color: op.meta.color }">
                        <el-icon size="24"><component :is="getIcon(op.meta.icon)" /></el-icon>
                    </div>
                    <span class="tool-text">{{ op.meta.label }}</span>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { Document, Download, ChatDotRound, Files } from "@element-plus/icons-vue";
import { listOperators } from "../../engine/operators/index.js";
import { NODE_CATEGORIES } from "../../constants/NodeTypes.js";
import { useStoreDataCleanGraph } from "../../stores/StoreDataCleanGraph.js";

defineEmits(["fit", "save", "load"]);

const graphStore = useStoreDataCleanGraph();
const allOps = listOperators();
const categories = computed(() => {
    const used = new Set(allOps.map((op) => op.meta.category));
    return NODE_CATEGORIES.filter((c) => used.has(c.key));
});
const activeTab = ref(categories.value.length > 0 ? categories.value[0].key : "");
const activeOps = computed(() => allOps.filter((op) => op.meta.category === activeTab.value));

// 主题切换逻辑
const isDark = ref(false);
onMounted(() => {
    const saved = localStorage.getItem("dc-theme");
    if (saved === "dark") {
        isDark.value = true;
        document.documentElement.setAttribute("data-theme", "dark");
    }
});

function toggleTheme() {
    isDark.value = !isDark.value;
    if (isDark.value) {
        document.documentElement.setAttribute("data-theme", "dark");
        localStorage.setItem("dc-theme", "dark");
    } else {
        document.documentElement.removeAttribute("data-theme");
        localStorage.setItem("dc-theme", "light");
    }
}

function getIcon(iconName) {
    const map = { IconFolder: Document, IconDownload: Download, IconChatDot: ChatDotRound, default: Files };
    return map[iconName] || map.default;
}

function onAddNode(type) {
    const op = allOps.find((o) => o.type === type);
    if (!op) return;
    const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const offset = (graphStore.nodes.length % 6) * 40;
    graphStore.addNode({
        id, type, params: getDefaultParams(op), position: { x: 120 + offset, y: 80 + offset },
    });
    graphStore.setSelected(id);
}

function getDefaultParams(op) {
    const params = {};
    for (const row of op.schema || []) {
        if (row.component === "select" && row.options && row.options.length > 0) {
            params[row.field] = row.options[0].value;
        } else if (row.defaultValue !== undefined) {
            params[row.field] = row.defaultValue;
        } else {
            params[row.field] = "";
        }
    }
    return params;
}
</script>

<style scoped>
.top-menu {
    display: flex; flex-direction: column;
    background: var(--dc-menu-bg, #ffffff);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    z-index: 10;
}
.menu-tabs-row {
    display: flex; align-items: center;
    height: 36px; padding: 0 16px;
    border-bottom: 1px solid var(--dc-border, #e2e8f0);
}
.app-title { font-weight: 700; font-size: 14px; color: var(--dc-text-primary, #1e293b); margin-right: 32px; }
.tabs-container { display: flex; height: 100%; }
.menu-tab {
    padding: 0 16px; height: 100%; display: flex; align-items: center;
    font-size: 13px; cursor: pointer; color: var(--dc-text-primary, #334155);
    border-bottom: 2px solid transparent; transition: all 0.2s;
}
.menu-tab:hover { color: var(--dc-edge-selected, #3b82f6); }
.menu-tab.is-active {
    color: var(--dc-edge-selected, #3b82f6);
    border-bottom-color: var(--dc-edge-selected, #3b82f6);
    font-weight: 600;
}
.menu-right-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.auto-run-tip {
    font-size: 11px; color: #22c55e; background: #dcfce7;
    padding: 2px 6px; border-radius: 4px; margin-right: 8px;
}
.menu-toolbar-row {
    height: 72px; background: var(--dc-preview-header-bg, #f4f5f7);
    padding: 8px 16px; display: flex; align-items: center;
    border-bottom: 1px solid var(--dc-border, #e2e8f0);
}
.tool-group { display: flex; gap: 16px; }
.tool-btn {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    min-width: 64px; padding: 4px 8px; border-radius: 6px;
    cursor: pointer; transition: background 0.15s;
}
.tool-btn:hover { background: rgba(0, 0, 0, 0.05); }
.tool-icon { margin-bottom: 4px; }
.tool-text { font-size: 12px; color: var(--dc-text-primary, #334155); white-space: nowrap; }
</style>
