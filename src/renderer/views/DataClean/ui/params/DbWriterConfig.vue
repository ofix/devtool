<template>
  <div class="db-config-trigger">
    <el-button type="primary" plain @click="openModal"> 配置数据库写入 </el-button>
    <div v-if="modelValue && modelValue.tableName" class="db-status">
      目标：{{ modelValue.dialect }} / {{ modelValue.tableName }}
    </div>
  </div>

  <el-dialog
    v-model="visible"
    title="配置数据库写入"
    width="850px"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <el-collapse v-model="activePanels" class="db-collapse">
      <!-- 1. 连接设置 -->
      <el-collapse-item title="1. 连接与目标表设置" name="1">
        <el-form label-width="100px" size="small">
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="数据库类型">
                <el-select v-model="form.dialect" @change="onDialectChange">
                  <el-option
                    v-for="(drv, key) in DB_DRIVERS"
                    :key="key"
                    :label="drv.label"
                    :value="key"
                  />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12" v-if="isFileBased">
              <el-form-item label="文件路径">
                <el-input v-model="form.filePath" placeholder="SQLite 文件路径">
                  <template #append><el-button @click="selectFile">选择</el-button></template>
                </el-input>
              </el-form-item>
            </el-col>

            <template v-if="!isFileBased">
              <el-col :span="8">
                <el-form-item label="主机">
                  <el-input v-model="form.host" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="端口">
                  <el-input-number v-model="form.port" :controls="false" style="width: 100%" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="数据库名">
                  <el-input v-model="form.database" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="用户名">
                  <el-input v-model="form.user" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="密码">
                  <el-input v-model="form.password" type="password" show-password />
                </el-form-item>
              </el-col>
            </template>

            <el-col :span="24">
              <el-form-item>
                <el-button @click="testConnection" :loading="testing">测试连接</el-button>
                <span v-if="connStatus === 'success'" style="color: #67c23a; margin-left: 10px"
                  >连接成功</span
                >
                <span v-if="connStatus === 'error'" style="color: #f56c6c; margin-left: 10px"
                  >连接失败</span
                >
              </el-form-item>
            </el-col>

            <el-col :span="12">
              <el-form-item label="目标表名">
                <el-select
                  v-model="form.tableName"
                  filterable
                  allow-create
                  default-first-option
                  placeholder="选择或输入新表名"
                  @change="onTableChange"
                >
                  <el-option v-for="t in tables" :key="t" :label="t" :value="t" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="自动建表">
                <el-switch v-model="form.autoCreate" />
              </el-form-item>
            </el-col>
          </el-row>
        </el-form>
      </el-collapse-item>

      <!-- 2. 写入策略 -->
      <el-collapse-item title="2. 写入策略" name="2">
        <el-form label-width="100px" size="small">
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="写入模式">
                <el-radio-group v-model="form.writeMode">
                  <el-radio value="append">追加</el-radio>
                  <el-radio value="truncate">覆盖</el-radio>
                </el-radio-group>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="批次大小">
                <el-input-number v-model="form.batchSize" :min="1" />
              </el-form-item>
            </el-col>
          </el-row>
        </el-form>
      </el-collapse-item>

      <!-- 3. 字段映射 -->
      <el-collapse-item title="3. 字段映射与预览" name="3">
        <el-row :gutter="20">
          <el-col :span="12">
            <div class="mapping-list">
              <div class="map-header">
                <span>源列名</span>
                <span>目标列名</span>
                <span v-if="form.autoCreate">建表类型</span>
              </div>
              <div v-for="(m, idx) in form.columnMappings" :key="idx" class="map-row">
                <span class="map-src">{{ m.source }}</span>
                <el-input v-model="m.target" size="small" placeholder="目标名" />
                <el-select v-if="form.autoCreate" v-model="m.dbType" size="small">
                  <el-option label="TEXT" value="text" />
                  <el-option label="INT" value="integer" />
                  <el-option label="FLOAT" value="float" />
                  <el-option label="DATETIME" value="datetime" />
                </el-select>
              </div>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="preview-panel">
              <div class="preview-header">目标表预览 (前 10 行)</div>
              <el-table :data="tablePreview" size="small" height="250" border>
                <el-table-column v-for="col in previewCols" :key="col" :prop="col" :label="col" />
              </el-table>
            </div>
          </el-col>
        </el-row>
      </el-collapse-item>
    </el-collapse>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="saveConfig">保存配置</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
  import { ref, reactive, computed, watch } from "vue"
  import { ElMessage } from "element-plus"
  import { DB_DRIVERS } from "../../engine/db/DBDrivers.js"
  import { dbManager } from "../../engine/db/DbManager.js"

  const props = defineProps({
    modelValue: { type: Object, default: () => ({}) },
    nodeId: { type: String, required: true },
    inputColumns: { type: Array, default: () => [] },
  })
  const emit = defineEmits(["update:modelValue"])

  const visible = ref(false)
  const activePanels = ref(["1", "2", "3"])
  const testing = ref(false)
  const connStatus = ref("")
  const tables = ref([])
  const tablePreview = ref([])
  const previewCols = ref([])

  const form = reactive({
    dialect: "mysql",
    host: "localhost",
    port: 3306,
    database: "",
    user: "",
    password: "",
    filePath: "",
    tableName: "",
    autoCreate: false,
    writeMode: "append",
    batchSize: 500,
    columnMappings: [],
  })

  const isFileBased = computed(() => DB_DRIVERS[form.dialect]?.isFileBased)

  watch(
    () => props.modelValue,
    val => {
      if (val) Object.assign(form, val)
    },
    { immediate: true, deep: true },
  )

  watch(
    () => props.inputColumns,
    cols => {
      if (!cols || cols.length === 0) return
      if (!form.columnMappings || form.columnMappings.length === 0) {
        form.columnMappings = cols.map(c => ({ source: c.name, target: c.name, dbType: "text" }))
      } else {
        const existSources = form.columnMappings.map(m => m.source)
        const newMaps = cols
          .filter(c => !existSources.includes(c.name))
          .map(c => ({ source: c.name, target: c.name, dbType: "text" }))
        form.columnMappings.push(...newMaps)
      }
    },
    { immediate: true, deep: true },
  )

  function openModal() {
    visible.value = true
    if (!form.columnMappings || form.columnMappings.length === 0) {
      form.columnMappings = props.inputColumns.map(c => ({
        source: c.name,
        target: c.name,
        dbType: "text",
      }))
    }
  }

  function onDialectChange() {
    const drv = DB_DRIVERS[form.dialect]
    if (drv) form.port = drv.defaultPort
    connStatus.value = ""
  }

  async function testConnection() {
    if (!form.dialect) return ElMessage.warning("请选择数据库类型")
    testing.value = true
    connStatus.value = ""
    try {
      await dbManager.createConnection(props.nodeId, form)
      connStatus.value = "success"
      ElMessage.success("连接成功！")
      const db = dbManager.getConnection(props.nodeId)
      let res
      if (form.dialect === "sqlite") {
        res = await db.raw(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        )
      } else {
        res = await db.raw(
          "SELECT table_name FROM information_schema.tables WHERE table_schema = ?",
          [form.database],
        )
      }
      tables.value = res.rows
        ? res.rows.map(r => r.table_name || r.name)
        : res.map(r => r.table_name || r.name)
    } catch (e) {
      connStatus.value = "error"
      ElMessage.error(e.message)
    } finally {
      testing.value = false
    }
  }

  async function onTableChange(tableName) {
    tablePreview.value = []
    previewCols.value = []
    if (!tableName) return

    try {
      const cols = await dbManager.getTableColumns(props.nodeId, tableName)
      if (cols.length > 0) {
        form.autoCreate = false
        const previewData = await dbManager.previewTable(props.nodeId, tableName)
        tablePreview.value = previewData
        previewCols.value = cols.map(c => c.name)
      }
    } catch (e) {
      console.warn("查询表预览失败", e)
    }
  }

  function saveConfig() {
    const data = { ...form, nodeId: props.nodeId }
    emit("update:modelValue", data)
    visible.value = false
  }
</script>

<style scoped>
  .db-config-trigger {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .db-status {
    font-size: 12px;
    color: var(--dc-text-secondary);
  }
  .mapping-list {
    border: 1px solid var(--el-border-color);
    border-radius: 4px;
    padding: 8px;
  }
  .map-header {
    display: flex;
    gap: 8px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
    margin-bottom: 8px;
  }
  .map-header span {
    flex: 1;
  }
  .map-row {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 6px;
  }
  .map-src {
    flex: 1;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .preview-panel {
    border: 1px solid var(--el-border-color);
    border-radius: 4px;
    padding: 8px;
  }
  .preview-header {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    margin-bottom: 8px;
  }
</style>
