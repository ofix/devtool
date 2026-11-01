<template>
  <el-dialog
    :model-value="visible"
    title="配置Excel数据范围"
    width="600px"
    append-to-body
    modal-append-to-body
    custom-class="dc-excel-dialog"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:visible', $event)"
  >
    <div class="file-path-bar" v-if="filePath">
      <el-tooltip :content="filePath" placement="top">
        <span class="path-text">{{ displayPath }}</span>
      </el-tooltip>
      <div class="path-actions">
        <el-tooltip content="复制完整路径" placement="top">
          <el-icon class="action-icon" @click="copyPath"><CopyDocument /></el-icon>
        </el-tooltip>
        <el-tooltip content="打开所在文件夹" placement="top">
          <el-icon class="action-icon" @click="openFolder"><FolderOpened /></el-icon>
        </el-tooltip>
      </div>
    </div>

    <div class="config-dialog-body">
      <div class="global-settings">
        <div class="setting-item">
          <span class="label">包含表头:</span>
          <el-switch v-model="localHasHeader" size="small" />
        </div>
        <div class="setting-item">
          <span class="label">对齐方式:</span>
          <el-select
            v-model="localAlign"
            size="small"
            style="width: 120px"
            popper-class="dialog-select-popper"
          >
            <el-option label="按列名" value="name" />
            <el-option label="按位置" value="position" />
          </el-select>
        </div>
      </div>

      <el-radio-group v-model="localMode" size="small" class="mode-radio">
        <el-radio-button label="uniform">统一选取范围</el-radio-button>
        <el-radio-button label="custom">自定义选取范围</el-radio-button>
      </el-radio-group>

      <div v-if="localMode === 'uniform'" class="mode-content">
        <div class="input-row">
          <span class="label">选择 Sheet</span>
          <el-popover
            placement="bottom-start"
            :width="300"
            trigger="click"
            popper-class="sheet-picker-popover"
          >
            <template #reference>
              <el-input
                size="small"
                readonly
                :model-value="`已选 ${(localUniformSheets || []).length} / ${(availableSheets || []).length} 个 Sheet`"
                style="flex: 1; cursor: pointer"
              >
                <template #suffix
                  ><el-icon><ArrowDown /></el-icon
                ></template>
              </el-input>
            </template>
            <div class="sheet-picker-content">
              <div class="picker-header">
                <el-button link type="primary" size="small" @click="toggleAllSheets"
                  >全选/反选</el-button
                >
                <span
                  >已选 {{ (localUniformSheets || []).length }} /
                  {{ (availableSheets || []).length }}</span
                >
              </div>
              <div class="picker-search">
                <el-input
                  v-model="sheetSearch"
                  size="small"
                  placeholder="搜索 Sheet..."
                  clearable
                  prefix-icon="Search"
                />
              </div>
              <div class="picker-list custom-scrollbar">
                <el-checkbox-group v-model="localUniformSheets">
                  <div v-for="s in filteredSheets" :key="s" class="picker-item">
                    <el-checkbox :label="s">{{ s }}</el-checkbox>
                  </div>
                </el-checkbox-group>
                <div v-if="filteredSheets.length === 0" class="picker-empty">无匹配 Sheet</div>
              </div>
            </div>
          </el-popover>
        </div>

        <div class="input-row align-top">
          <!-- 修复 2：问号放到前面 -->
          <span class="label">
            <el-tooltip placement="right" effect="light">
              <template #content>
                <div style="width: 260px; font-size: 12px; line-height: 1.6">
                  <p>使用 A1 引用语法，支持空格或换行分隔多个区域：</p>
                  <ul style="padding-left: 16px; margin-bottom: 0">
                    <li>单区域：<code>A1:D100</code></li>
                    <li>多区域：<code>A1:D100 F5:G50</code></li>
                  </ul>
                  <p>留空则默认读取整个 Sheet 的有效数据。</p>
                </div>
              </template>
              <span class="help-icon" style="margin-right: 6px">?</span>
            </el-tooltip>
            数据范围
          </span>
          <div class="textarea-wrapper">
            <el-input
              v-model="localUniformRegionsStr"
              type="textarea"
              :rows="4"
              resize="vertical"
              placeholder="例如: A1:D100 F5:G50"
              class="minimal-scrollbar"
            />
          </div>
        </div>
      </div>

      <div v-else class="mode-content">
        <div class="custom-table-container">
          <div class="table-header">
            <span class="check-col">
              <!-- 修复 3：自定义列表全选 -->
              <el-checkbox
                :model-value="isAllCustomSelected"
                :indeterminate="isCustomIndeterminate"
                @change="toggleAllCustom"
              />
            </span>
            <span class="name-col">Sheet 名称</span>
            <span class="region-col">数据范围</span>
          </div>
          <div class="table-scroll minimal-scrollbar">
            <div v-if="(localCustomTasks || []).length > 0">
              <div v-for="(row, idx) in localCustomTasks" :key="idx" class="table-row">
                <el-checkbox v-model="row.checked" class="check-col" />
                <span class="sheet-name-text name-col" :title="row.sheetName">{{
                  row.sheetName
                }}</span>
                <el-input
                  v-model="row.regionsStr"
                  type="textarea"
                  :rows="2"
                  size="small"
                  placeholder="留空读全表，或输入: A1:D100 F5:G50"
                  style="flex: 1"
                  class="minimal-scrollbar"
                />
              </div>
            </div>
            <div v-else class="empty-tip">请先在主面板选择 Excel 文件</div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button size="small" @click="$emit('update:visible', false)">取消</el-button>
      <el-button size="small" type="primary" @click="onConfirm">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
  import { ref, watch, computed } from "vue"
  import { ArrowDown, CopyDocument, FolderOpened } from "@element-plus/icons-vue"
  import { ElMessage } from "element-plus"

  const props = defineProps({
    visible: { type: Boolean, default: false },
    modelValue: { type: Object, default: () => ({}) },
    availableSheets: { type: Array, default: () => [] },
  })
  const emit = defineEmits(["update:visible", "update:modelValue", "trigger-run"])

  const localMode = ref("uniform")
  const localHasHeader = ref(true)
  const localAlign = ref("name")
  const localUniformSheets = ref([])
  const localUniformRegionsStr = ref("")
  const localCustomTasks = ref([])
  const sheetSearch = ref("")

  // 自定义列表的全选逻辑
  const isAllCustomSelected = computed(() => {
    if (!localCustomTasks.value || localCustomTasks.value.length === 0) return false
    return localCustomTasks.value.every(t => t.checked)
  })
  const isCustomIndeterminate = computed(() => {
    if (!localCustomTasks.value || localCustomTasks.value.length === 0) return false
    const checkedCount = localCustomTasks.value.filter(t => t.checked).length
    return checkedCount > 0 && checkedCount < localCustomTasks.value.length
  })
  function toggleAllCustom(checked) {
    localCustomTasks.value.forEach(t => (t.checked = checked))
  }

  const filePath = computed(() => props.modelValue?.filePath || "")

  const displayPath = computed(() => {
    const path = filePath.value
    if (!path) return "未选择文件"

    // 如果小于等于 60 个字符，直接完整显示
    if (path.length <= 60) return path

    // 如果超过 60，保留最后 57 个字符，前面用 "..." 替代（3 + 57 = 60）
    return `...${path.slice(-57)}`
  })

  const filteredSheets = computed(() => {
    const sheets = props.availableSheets || []
    if (!sheetSearch.value) return sheets
    const lower = sheetSearch.value.toLowerCase()
    return sheets.filter(s => s.toLowerCase().includes(lower))
  })

  function copyPath() {
    if (!filePath.value) return
    navigator.clipboard.writeText(filePath.value).then(() => ElMessage.success("路径已复制"))
  }
  function openFolder() {
    if (!filePath.value) return
    window.api.dataClean.shell.showItemInFolder(filePath.value)
  }

  watch(
    () => props.visible,
    val => {
      if (val) {
        const params = props.modelValue || {}
        localMode.value = params.configMode || "uniform"
        localHasHeader.value = params.hasHeader !== false
        localAlign.value = params.alignStrategy || "name"
        localUniformSheets.value = params.uniformSheets || []
        localUniformRegionsStr.value = (params.uniformRegions || []).join("\n")

        const existingTasks = params.tasks || []
        const sheets = props.availableSheets || []
        localCustomTasks.value = sheets.map(sheetName => {
          const found = existingTasks.find(t => t.sheetName === sheetName)
          return {
            sheetName,
            checked: !!found,
            regionsStr: found && found.regions ? found.regions.join("\n") : "",
          }
        })
      }
    },
  )

  watch(
    () => props.availableSheets,
    newSheets => {
      if (props.visible) {
        const existingTasks = localCustomTasks.value || []
        const sheets = newSheets || []
        localCustomTasks.value = sheets.map(sheetName => {
          const found = existingTasks.find(t => t.sheetName === sheetName)
          return {
            sheetName,
            checked: found ? found.checked : false,
            regionsStr: found ? found.regionsStr : "",
          }
        })
      }
    },
  )

  function toggleAllSheets() {
    const allSheets = props.availableSheets || []
    if (localUniformSheets.value.length === allSheets.length) {
      localUniformSheets.value = []
    } else {
      localUniformSheets.value = [...allSheets]
    }
  }

  function parseRegions(str) {
    if (!str || !str.trim()) return []
    return str
      .split(/[\n\s]+/)
      .map(r => r.trim())
      .filter(Boolean)
  }

  function onConfirm() {
    let tasks = []
    if (localMode.value === "uniform") {
      const regions = parseRegions(localUniformRegionsStr.value)
      tasks = localUniformSheets.value.map(s => ({ sheetName: s, regions }))
    } else {
      tasks = localCustomTasks.value
        .filter(t => t.checked)
        .map(t => ({
          sheetName: t.sheetName,
          regions: parseRegions(t.regionsStr),
        }))
    }

    emit("update:modelValue", {
      configMode: localMode.value,
      hasHeader: localHasHeader.value,
      alignStrategy: localAlign.value,
      uniformSheets: localUniformSheets.value,
      uniformRegions: parseRegions(localUniformRegionsStr.value),
      tasks,
    })
    emit("update:visible", false)
    emit("trigger-run")
  }
</script>

<style scoped>
  .file-path-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 4px;
    background: var(--dc-preview-header-bg, #a5c4e2);
    margin: 0 0px 10px 0px;
    font-size: 12px;
    width: 100%;
    box-sizing: border-box;
  }

  .path-text {
    color: var(--dc-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 2;
  }

  .path-actions {
    display: flex;
    gap: 8px;
    margin-left: 12px;
  }

  .action-icon {
    font-size: 14px;
    cursor: pointer;
    color: var(--dc-text-secondary);
    transition: color 0.2s;
  }

  .action-icon:hover {
    color: var(--dc-edge-selected, #3b82f6);
  }

  .config-dialog-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .global-settings {
    display: flex;
    gap: 24px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--dc-border, #e2e8f0);
  }

  .setting-item {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .setting-item .label {
    font-size: 12px;
    color: var(--dc-text-secondary);
  }

  .mode-radio {
    align-self: flex-start;
    margin-bottom: 4px;
  }

  .mode-content {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .input-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }

  .input-row .label {
    font-size: 12px;
    color: var(--dc-text-secondary);
    width: 80px;
    text-align: right;
    line-height: 24px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }

  .textarea-wrapper {
    flex: 1;
  }

  .help-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    background-color: #3b82f6;
    color: white;
    border-radius: 50%;
    font-size: 10px;
    cursor: help;
    font-weight: bold;
  }

  .sheet-picker-content {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .picker-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    color: var(--dc-text-secondary);
    padding-bottom: 4px;
  }

  .picker-search {
    padding-bottom: 0px;
  }

  .picker-list {
    max-height: 200px;
    overflow-y: auto;
    padding-right: 4px;
  }

  .picker-item {
    padding: 4px 0;
  }

  .picker-empty {
    text-align: center;
    color: var(--dc-text-secondary);
    font-size: 12px;
    padding: 12px;
  }

  .custom-table-container {
    border: 1px solid var(--dc-border, #e2e8f0);
    border-radius: 4px;
    max-height: 320px;
    display: flex;
    flex-direction: column;
  }

  .table-header {
    display: flex;
    gap: 8px;
    background: var(--dc-preview-header-bg, #f8fafc);
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 600;
    color: var(--dc-text-secondary);
    border-bottom: 1px solid var(--dc-border);
    align-items: center;
  }

  .check-col {
    width: 24px;
    flex-shrink: 0;
    display: flex;
    align-items: left;
    justify-content: center;
  }

  .name-col {
    width: 120px;
    flex-shrink: 0;
    text-align: left;
  }

  .region-col {
    flex: 1;
  }

  .table-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
  }

  .table-row {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
    align-items: flex-start;
  }

  .sheet-name-text {
    width: 120px;
    flex-shrink: 0;
    font-size: 13px;
    line-height: 32px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: left;
  }

  .empty-tip {
    text-align: center;
    color: var(--dc-text-secondary);
    font-size: 12px;
    padding: 20px;
  }

  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }

  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }

  .custom-scrollbar::-webkit-scrollbar-thumb {
    background-color: transparent;
    border-radius: 3px;
  }

  .custom-scrollbar:hover::-webkit-scrollbar-thumb {
    background-color: rgba(150, 150, 150, 0.4);
  }
</style>

<style>
  .dc-excel-dialog {
    border-radius: 8px;
    overflow: hidden;
  }
  .dc-excel-dialog .el-dialog__body {
    padding: 10px 20px 20px 20px; /* 统一控制内部间距 */
  }
  .dialog-select-popper {
    z-index: 9999 !important;
  }
  .sheet-picker-popover {
    padding: 12px !important;
  }
</style>
