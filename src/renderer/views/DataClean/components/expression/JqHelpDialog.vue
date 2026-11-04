<!-- ==== FILE: src/renderer/views/DataClean/components/expression/JqHelpDialog.vue ==== -->
<template>
  <el-dialog
    :model-value="visible"
    title="JQ 语法速查指南"
    width="800px"
    append-to-body
    custom-class="jq-help-dialog"
    @update:model-value="$emit('update:visible', $event)"
  >
    <div class="jq-help-layout">
      <!-- 左侧分类导航 -->
      <div class="help-sidebar">
        <div class="search-box">
          <el-input
            v-model="searchText"
            size="small"
            placeholder="搜索语法..."
            clearable
            prefix-icon="Search"
          />
        </div>
        <div class="category-list dc-custom-scrollbar">
          <div
            v-for="cat in filteredCategories"
            :key="cat.category"
            class="category-item"
            :class="{ active: currentCategory === cat.category }"
            @click="currentCategory = cat.category"
          >
            {{ cat.category }}
          </div>
        </div>
      </div>

      <!-- 右侧内容区 -->
      <div class="help-content dc-custom-scrollbar">
        <template v-if="currentItems.length > 0">
          <div v-for="item in currentItems" :key="item.title" class="help-item">
            <!-- 头部 -->
            <div class="item-header">
              <div class="title-wrap">
                <span class="title">{{ item.title }}</span>
                <span class="desc">{{ item.desc }}</span>
              </div>
              <el-button size="small" type="primary" plain @click="applyCode(item.code)"
                >插入代码</el-button
              >
            </div>

            <!-- 表达式代码 -->
            <div class="expr-box">
              <JsonViewer :value="item.code" height="32px" />
            </div>

            <!-- 输入输出对比 -->
            <div class="io-preview">
              <div class="io-box">
                <div class="io-header">
                  <span class="io-label">输入 JSON</span>
                  <el-switch
                    v-model="item.isInputTree"
                    inline-prompt
                    active-text="Tree"
                    inactive-text="Raw"
                    size="small"
                  />
                </div>
                <div class="io-content dc-custom-scrollbar">
                  <vue-json-pretty
                    v-if="item.isInputTree"
                    :data="item.input"
                    :deep="3"
                    :show-icon="true"
                  />
                  <JsonViewer v-else :value="formatJson(item.input)" max-height="160px" />
                </div>
              </div>

              <div class="io-arrow">➜</div>

              <div class="io-box">
                <div class="io-header">
                  <span class="io-label">输出 JSON</span>
                  <el-switch
                    v-model="item.isOutputTree"
                    inline-prompt
                    active-text="Tree"
                    inactive-text="Raw"
                    size="small"
                  />
                </div>
                <div class="io-content dc-custom-scrollbar">
                  <vue-json-pretty
                    v-if="item.isOutputTree"
                    :data="item.output"
                    :deep="3"
                    :show-icon="true"
                  />
                  <JsonViewer v-else :value="formatJson(item.output)" max-height="160px" />
                </div>
              </div>
            </div>
          </div>
        </template>
        <div v-else class="empty-search">没有找到匹配的语法。</div>
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
  // ... (省略 script setup 里的逻辑，与你之前的一致，无需修改) ...
  import { ref, computed, watch } from "vue"
  import VueJsonPretty from "vue-json-pretty"
  import "vue-json-pretty/lib/styles.css"
  import JsonViewer from "../common/JsonViewer.vue"
  import { JQ_CHEATSHEET } from "../../constants/jqCheatsheet.js"

  const props = defineProps({ visible: { type: Boolean, default: false } })
  const emit = defineEmits(["update:visible", "apply"])
  const searchText = ref("")
  const currentCategory = ref("")

  const cheatsheetData = ref(
    JQ_CHEATSHEET.map(cat => ({
      ...cat,
      items: cat.items.map(item => ({ ...item, isInputTree: false, isOutputTree: false })),
    })),
  )

  watch(
    () => props.visible,
    val => {
      if (val && !currentCategory.value && cheatsheetData.value.length > 0) {
        currentCategory.value = cheatsheetData.value[0].category
      }
    },
  )

  const filteredCategories = computed(() => {
    if (!searchText.value) return cheatsheetData.value
    const lower = searchText.value.toLowerCase()
    return cheatsheetData.value
      .map(cat => ({
        ...cat,
        items: cat.items.filter(
          item =>
            item.title.toLowerCase().includes(lower) ||
            item.desc.toLowerCase().includes(lower) ||
            item.code.toLowerCase().includes(lower),
        ),
      }))
      .filter(cat => cat.items.length > 0)
  })

  watch(filteredCategories, newCats => {
    if (newCats.length > 0 && !newCats.find(c => c.category === currentCategory.value)) {
      currentCategory.value = newCats[0].category
    }
  })

  const currentItems = computed(() => {
    const cat = filteredCategories.value.find(c => c.category === currentCategory.value)
    return cat ? cat.items : []
  })

  function formatJson(obj) {
    try {
      return JSON.stringify(obj, null, 2)
    } catch (e) {
      return String(obj)
    }
  }

  function applyCode(code) {
    emit("apply", code)
    emit("update:visible", false)
  }
</script>

<style scoped>
  .jq-help-layout {
    display: flex;
    height: 550px; /* 调整整体弹窗高度 */
    gap: 0;
    background: var(--dc-app-bg, #ffffff);
  }

  /* 左侧导航 */
  .help-sidebar {
    width: 180px;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--dc-border);
    background: var(--dc-preview-header-bg);
    padding: 12px;
  }
  .search-box {
    margin-bottom: 12px;
  }
  .category-list {
    flex: 1;
    overflow-y: auto;
  }
  .category-item {
    padding: 8px 12px;
    font-size: 13px;
    border-radius: 4px;
    cursor: pointer;
    color: var(--dc-text-primary);
    margin-bottom: 4px;
    transition: background 0.2s;
  }
  .category-item:hover {
    background: rgba(59, 130, 246, 0.08);
  }
  .category-item.active {
    background: rgba(59, 130, 246, 0.15);
    color: #3b82f6;
    font-weight: 600;
  }

  /* 右侧内容区 */
  .help-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  .help-item {
    margin-bottom: 20px;
    background: var(--dc-preview-bg);
    border: 1px solid var(--dc-border);
    border-radius: 6px;
    padding: 12px; /* 减少内边距，更加紧凑 */
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
  }

  .item-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
  }
  .title-wrap {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .title {
    font-weight: 600;
    font-size: 14px;
    color: var(--dc-text-primary);
  }
  .desc {
    font-size: 12px;
    color: var(--dc-text-secondary);
  }

  .expr-box {
    border: 1px solid var(--dc-border);
    border-radius: 4px;
    background: var(--dc-canvas-bg);
    margin-bottom: 12px;
    overflow: hidden;
  }

  .io-preview {
    display: flex;
    gap: 12px;
    align-items: stretch;
  }

  .io-box {
    flex: 1;
    border: 1px solid var(--dc-border);
    border-radius: 4px;
    background: var(--dc-canvas-bg);
    display: flex;
    flex-direction: column;
  }

  .io-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 8px;
    background: var(--dc-preview-header-bg);
    border-bottom: 1px solid var(--dc-border);
  }

  .io-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--dc-text-secondary);
  }

  /* 去掉固定高度，让内容自行撑开，最多撑到 160px，超过就滚动 */
  .io-content {
    overflow: auto;
    max-height: 160px;
  }

  /* 覆盖 vue-json-pretty 默认样式，让它更紧凑 */
  .io-content :deep(.vjs-tree) {
    padding: 4px 8px;
    font-size: 12px;
    font-family: "SF Mono", Consolas, monospace;
    background-color: transparent;
  }

  .io-arrow {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--dc-text-secondary);
    font-size: 18px;
  }
  .empty-search {
    text-align: center;
    padding: 40px 0;
    color: var(--dc-text-secondary);
  }
</style>

<style>
  /* 修复整个 Dialog 的样式 */
  .jq-help-dialog {
    border-radius: 8px;
    overflow: hidden;
    background-color: var(--dc-app-bg, #ffffff);
  }
  .jq-help-dialog .el-dialog__header {
    border-bottom: 1px solid var(--dc-border);
    margin-right: 0;
    padding: 16px 20px;
  }
  .jq-help-dialog .el-dialog__body {
    padding: 0;
  }
</style>
