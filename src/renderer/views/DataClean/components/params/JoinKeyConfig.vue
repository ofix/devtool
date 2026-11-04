<template>
  <div class="join-key-config" :class="{ 'is-disabled': disabled }">
    <div class="jk-header">
      <span class="jk-title">连接键配置</span>
      <el-button size="small" type="primary" plain :disabled="disabled" @click="handleAdd">
        + 添加连接键
      </el-button>
    </div>

    <div v-for="(row, idx) in rows" :key="row.__uid" class="jk-row">
      <span class="jk-index">{{ idx + 1 }}</span>

      <el-select
        v-model="row.left"
        class="jk-select"
        placeholder="左表字段"
        filterable
        :disabled="disabled"
        @change="emitChange"
      >
        <el-option v-for="col in leftColumnNames" :key="col" :label="col" :value="col" />
      </el-select>

      <span class="jk-eq">=</span>

      <el-select
        v-model="row.right"
        class="jk-select"
        placeholder="右表字段"
        filterable
        :disabled="disabled"
        @change="emitChange"
      >
        <el-option v-for="col in rightColumnNames" :key="col" :label="col" :value="col" />
      </el-select>

      <span v-if="fieldMissing(row)" class="jk-warn" :title="fieldWarnText(row)"> ⚠ </span>

      <el-button
        size="small"
        type="danger"
        text
        :disabled="disabled || rows.length <= 1"
        @click="handleRemove(idx)"
      >
        ✕
      </el-button>
    </div>
  </div>
</template>

<script>
  let uidSeed = 0
  function nextUid() {
    uidSeed += 1
    return "jk_" + uidSeed
  }

  export default {
    name: "JoinKeyConfig",
    props: {
      modelValue: {
        type: Array,
        default: () => [],
      },
      leftColumns: {
        type: Array,
        default: () => [],
      },
      rightColumns: {
        type: Array,
        default: () => [],
      },
      disabled: {
        type: Boolean,
        default: false,
      },
    },
    emits: ["update:modelValue"],
    data() {
      return {
        rows: [],
      }
    },
    computed: {
      leftColumnNames() {
        return this.leftColumns.map(c => (typeof c === "string" ? c : c.name))
      },
      rightColumnNames() {
        return this.rightColumns.map(c => (typeof c === "string" ? c : c.name))
      },
    },
    watch: {
      modelValue: {
        immediate: true,
        handler(val) {
          this.syncFromModel(val)
        },
      },
    },
    methods: {
      syncFromModel(val) {
        const arr = Array.isArray(val) ? val : []
        const oldUidBySignature = new Map()
        for (const r of this.rows) {
          oldUidBySignature.set(this.rowSignature(r), r.__uid)
        }
        const next = arr.map(item => {
          const sig = this.rowSignature(item)
          const reused = oldUidBySignature.get(sig)
          return {
            __uid: reused || nextUid(),
            left: item.left || "",
            right: item.right || "",
          }
        })
        // 空列表时补一行空行，保证 UI 至少一行可编辑
        if (next.length === 0) {
          next.push({ __uid: nextUid(), left: "", right: "" })
        }
        this.rows = next
      },
      rowSignature(r) {
        return (r.left || "") + "\u0001" + (r.right || "")
      },
      handleAdd() {
        this.rows.push({ __uid: nextUid(), left: "", right: "" })
        this.emitChange()
      },
      handleRemove(idx) {
        if (this.rows.length <= 1) {
          return
        }
        this.rows.splice(idx, 1)
        this.emitChange()
      },
      emitChange() {
        const payload = this.rows.map(r => ({
          left: r.left,
          right: r.right,
        }))
        this.$emit("update:modelValue", payload)
      },
      fieldMissing(row) {
        if (row.left && !this.leftColumnNames.includes(row.left)) {
          return true
        }
        if (row.right && !this.rightColumnNames.includes(row.right)) {
          return true
        }
        return false
      },
      fieldWarnText(row) {
        if (row.left && !this.leftColumnNames.includes(row.left)) {
          return "左表字段 " + row.left + " 不在当前输入中"
        }
        if (row.right && !this.rightColumnNames.includes(row.right)) {
          return "右表字段 " + row.right + " 不在当前输入中"
        }
        return ""
      },
    },
  }
</script>

<style scoped>
  .join-key-config {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  }
  .join-key-config.is-disabled {
    opacity: 0.6;
  }
  .jk-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .jk-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--dc-text-primary, #303133);
  }
  .jk-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
  }
  .jk-index {
    width: 18px;
    text-align: center;
    font-size: 12px;
    color: var(--dc-text-secondary, #909399);
    flex-shrink: 0;
  }
  .jk-select {
    flex: 1;
    min-width: 0;
  }
  .jk-eq {
    color: var(--dc-text-secondary, #909399);
    font-size: 13px;
    flex-shrink: 0;
  }
  .jk-warn {
    color: #f56c6c;
    font-size: 14px;
    cursor: help;
    flex-shrink: 0;
  }
</style>
