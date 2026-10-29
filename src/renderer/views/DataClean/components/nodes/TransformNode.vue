<template>
    <div
      class="node" :class="{ selected }"
      :style="{ left: node.x + 'px', top: node.y + 'px' }"
      @mousedown.stop="onDragStart"
      @click.stop="$emit('select')"
    >
      <div class="head">
        <span>{{ icon }} {{ node.name }}</span>
        <span class="close" @click.stop="$emit('remove')">×</span>
      </div>
      <div class="body">
        <template v-if="node.stepType === 'csvJoin'">
          <div class="row">左键 <el-input size="small" v-model="leftKey" placeholder="字段" /></div>
          <div class="row">右键 <el-input size="small" v-model="rightKey" placeholder="字段" /></div>
          <div class="row">输出列 <el-select size="small" v-model="outputColumns" multiple allow-create filterable placeholder="列名" style="width:100%" /></div>
        </template>
        <template v-else-if="node.stepType === 'jsonMap'">
          <div class="row">键字段 <el-input size="small" v-model="keyField" placeholder="字段" /></div>
          <div class="row">值字段 <el-input size="small" v-model="valueField" placeholder="字段" /></div>
          <div class="row">保留key <el-switch v-model="keepValueKey" size="small" /></div>
        </template>
        <template v-else-if="node.stepType === 'select'">
          <div class="row">列 <el-select size="small" v-model="columns" multiple allow-create filterable placeholder="列名" style="width:100%" /></div>
        </template>
        <template v-else-if="node.stepType === 'filter'">
          <div class="row">字段 <el-input size="small" v-model="field" placeholder="字段" /></div>
          <div class="row">操作 <el-select size="small" v-model="op" style="width:100%">
            <el-option label="等于" value="eq" /><el-option label="不等于" value="neq" />
            <el-option label="包含" value="contains" /><el-option label="大于" value="gt" /><el-option label="小于" value="lt" />
          </el-select></div>
          <div class="row">值 <el-input size="small" v-model="value" placeholder="值" /></div>
        </template>
        <template v-else-if="node.stepType === 'dedupe'">
          <div class="row">键 <el-input size="small" v-model="key" placeholder="字段" /></div>
        </template>
        <template v-else-if="node.stepType === 'sort'">
          <div class="row">字段 <el-input size="small" v-model="field" placeholder="字段" /></div>
          <div class="row">方向 <el-select size="small" v-model="order" style="width:100%">
            <el-option label="升序" value="asc" /><el-option label="降序" value="desc" />
          </el-select></div>
        </template>
      </div>
      <div class="meta">{{ ds?.count ?? 0 }} 行</div>
      <div
        v-for="i in node.inputCount" :key="i"
        class="in-port" :style="{ top: (36 + (i - 1) * 28) + 'px' }"
      />
      <div class="out-port" @mousedown.stop="onPortDown" />
    </div>
  </template>
  
  <script setup>
  import { computed } from 'vue'
  import { useDataCleanStore } from '@/stores/StoreDataClean'
  import { STEP_MAP } from '../../Steps'
  
  const props = defineProps({ node: Object, selected: Boolean })
  const emit = defineEmits(['select', 'remove', 'start-edge', 'drag'])
  const store = useDataCleanStore()
  
  const icon = computed(() => STEP_MAP[props.node.stepType]?.icon || '⚙️')
  const ds = computed(() => store.datasets[props.node.id])
  
  function bind(key, fallback) {
    return computed({
      get: () => props.node.params?.[key] ?? fallback,
      set: (v) => store.updateParams(props.node.id, { [key]: v }),
    })
  }
  const leftKey = bind('leftKey', '')
  const rightKey = bind('rightKey', '')
  const outputColumns = bind('outputColumns', [])
  const keyField = bind('keyField', '')
  const valueField = bind('valueField', '')
  const keepValueKey = bind('keepValueKey', false)
  const columns = bind('columns', [])
  const field = bind('field', '')
  const op = bind('op', 'eq')
  const value = bind('value', '')
  const key = bind('key', '')
  const order = bind('order', 'asc')
  
  function onDragStart(e) { emit('drag', { node: props.node, event: e }) }
  function onPortDown(e) { emit('start-edge', { node: props.node, port: 0, event: e }) }
  </script>
  
  <style scoped>
  .node { position: absolute; width: 240px; background: #2d2d2d; border: 1px solid #444; border-radius: 6px; color: #ddd; font-size: 12px; user-select: none; }
  .node.selected { border-color: #79b8ff; box-shadow: 0 0 0 1px #79b8ff; }
  .head { display: flex; justify-content: space-between; padding: 6px 8px; border-bottom: 1px solid #444; }
  .close { cursor: pointer; color: #888; }
  .body { padding: 8px; display: flex; flex-direction: column; gap: 6px; }
  .row { display: flex; align-items: center; gap: 6px; }
  .meta { padding: 4px 8px; color: #999; border-top: 1px solid #444; }
  .in-port, .out-port { position: absolute; width: 14px; height: 14px; border-radius: 50%; background: #79b8ff; cursor: crosshair; }
  .in-port { left: -7px; }
  .out-port { right: -7px; top: 42px; }
  </style>