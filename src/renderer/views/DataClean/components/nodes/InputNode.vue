<template>
    <div
      class="node" :class="{ selected }"
      :style="{ left: node.x + 'px', top: node.y + 'px' }"
      @mousedown.stop="onDragStart"
      @click.stop="$emit('select')"
    >
      <div class="head">
        <span>📄 {{ node.name }}</span>
        <span class="close" @click.stop="$emit('remove')">×</span>
      </div>
      <div class="meta">{{ ds?.count ?? 0 }} 行 · {{ ds?.columns?.length ?? 0 }} 列</div>
      <div class="out-port" @mousedown.stop="onPortDown" />
    </div>
  </template>
  
  <script setup>
  import { computed } from 'vue'
  import { useDataCleanStore } from '@/stores/StoreDataClean'
  
  const props = defineProps({ node: Object, selected: Boolean })
  const emit = defineEmits(['select', 'remove', 'start-edge', 'drag'])
  const store = useDataCleanStore()
  const ds = computed(() => store.datasets[props.node.id])
  
  function onDragStart(e) {
    emit('drag', { node: props.node, event: e })
  }
  function onPortDown(e) {
    emit('start-edge', { node: props.node, port: 0, event: e })
  }
  </script>
  
  <style scoped>
  .node { position: absolute; width: 220px; background: #2d2d2d; border: 1px solid #444; border-radius: 6px; color: #ddd; font-size: 12px; user-select: none; }
  .node.selected { border-color: #79b8ff; box-shadow: 0 0 0 1px #79b8ff; }
  .head { display: flex; justify-content: space-between; padding: 6px 8px; border-bottom: 1px solid #444; }
  .close { cursor: pointer; color: #888; }
  .meta { padding: 8px; color: #999; }
  .out-port { position: absolute; right: -7px; top: 42px; width: 14px; height: 14px; border-radius: 50%; background: #79b8ff; cursor: crosshair; }
  </style>