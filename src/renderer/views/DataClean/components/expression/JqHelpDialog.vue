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
      <!-- 左侧分类导航 (保持不变) -->
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
        <div class="category-list">
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
            <div class="item-header">
              <span class="title">{{ item.title }}</span>
              <span class="desc">{{ item.desc }}</span>
              <el-button size="small" type="primary" plain @click="applyCode(item.code)"
                >插入代码</el-button
              >
            </div>

            <!-- 表达式区域 -->
            <div class="expr-preview">
              <div class="io-label">JQ 表达式</div>
              <JsonViewer :value="item.code" language="text" max-height="80px" />
            </div>

            <!-- 输入输出对比区域 -->
            <div class="io-preview">
              <!-- 输入 JSON -->
              <div class="io-box">
                <div class="io-header">
                  <span class="io-label">输入 JSON</span>
                  <!-- 切换开关 -->
                  <el-switch
                    v-model="item.isInputTree"
                    inline-prompt
                    active-text="Tree"
                    inactive-text="Raw"
                    size="small"
                  />
                </div>
                <div class="io-content">
                  <vue-json-pretty
                    v-if="item.isInputTree"
                    :data="item.input"
                    :deep="1"
                    :show-icon="true"
                    class="dc-custom-scrollbar"
                  />
                  <jq-expression-panel
                    v-else
                    :value="formatJson(item.input)"
                    language="json"
                    max-height="220px"
                  />
                </div>
              </div>

              <div class="io-arrow">➜</div>

              <!-- 输出 JSON -->
              <div class="io-box">
                <div class="io-header">
                  <span class="io-label">输出 JSON</span>
                  <!-- 切换开关 -->
                  <el-switch
                    v-model="item.isOutputTree"
                    inline-prompt
                    active-text="Tree"
                    inactive-text="Raw"
                    size="small"
                  />
                </div>
                <div class="io-content">
                  <vue-json-pretty
                    v-if="item.isOutputTree"
                    :data="item.output"
                    :deep="1"
                    :show-icon="true"
                    class="dc-custom-scrollbar"
                  />
                  <JsonViewer
                    v-else
                    :value="formatJson(item.output)"
                    language="json"
                    max-height="220px"
                  />
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
  import { ref, computed, watch } from "vue"
  import VueJsonPretty from "vue-json-pretty"
  import "vue-json-pretty/lib/styles.css"
  import JsonViewer from "../common/JsonViewer.vue"
  import { JQ_CHEATSHEET } from "../../constants/jqCheatsheet.js"

  const props = defineProps({
    visible: { type: Boolean, default: false },
  })
  const emit = defineEmits(["update:visible", "apply"])

  const searchText = ref("")
  const currentCategory = ref("")

  // 初始化数据：给每个 item 增加 isInputTree 和 isOutputTree 状态，默认为 false (Raw 模式)
  const cheatsheetData = ref(
    JQ_CHEATSHEET.map(cat => ({
      ...cat,
      items: cat.items.map(item => ({
        ...item,
        isInputTree: false,
        isOutputTree: false,
      })),
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
    height: 600px;
    gap: 16px;
  }

  /* 左侧 */
  .help-sidebar {
    width: 180px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    border-right: 1px solid var(--dc-border);
    padding-right: 12px;
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
  }
  .category-item:hover {
    background: var(--dc-preview-header-bg);
  }
  .category-item.active {
    background: rgba(59, 130, 246, 0.1);
    color: #3b82f6;
    font-weight: 600;
  }

  /* 右侧 */
  .help-content {
    flex: 1;
    overflow-y: auto;
    padding-right: 8px;
  }
  .help-item {
    margin-bottom: 24px;
    background: var(--dc-preview-bg);
    border: 1px solid var(--dc-border);
    border-radius: 6px;
    padding: 16px;
  }
  .item-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }
  .title {
    font-weight: 600;
    font-size: 14px;
    color: var(--dc-text-primary);
  }
  .desc {
    flex: 1;
    font-size: 12px;
    color: var(--dc-text-secondary);
  }

  /* 代码与 IO 预览 */
  .expr-preview {
    margin-bottom: 12px;
  }
  .io-preview {
    display: flex;
    gap: 12px;
    align-items: stretch;
  }
  .io-box {
    flex: 1;
    background: var(--dc-canvas-bg);
    border-radius: 4px;
    border: 1px solid var(--dc-border);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  /* 头部包含标题和 switch */
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

  /* 内容容器，负责统一的高度和滚动 */
  .io-content {
    flex: 1;
    overflow: auto;
    max-height: 220px;
  }
  .io-content :deep(.vjs-tree) {
    padding: 8px;
    font-size: 12px;
    font-family: monospace;
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
