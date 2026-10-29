<template>
    <div class="editor" ref="root" @mousedown.self="store.selectedId = null">
      <svg class="edges">
        <path
          v-for="e in store.edges" :key="e.id"
          :d="edgePath(e)" class="edge"
          @click.stop="store.removeEdge(e.id)"
        />
        <path v-if="dragLine" :d="dragLine" class="edge dragging" />
      </svg>
  
      <component
        v-for="n in store.nodes" :key="n.id"
        :is="comp(n)"
        :node="n"
        :selected="store.selectedId === n.id"
        @select="store.selectNode(n.id)"
        @remove="store.removeNode(n.id)"
        @drag="onDrag"
        @start-edge="onStartEdge"
      />
  
      <div class="hint">拖动节点移动 · 拖右侧蓝点连线 · 点击连线删除 · 顶部运行执行</div>
    </div>
  </template>
  
  <script setup>
  import { ref, onBeforeUnmount } from 'vue'
  import { useDataCleanStore } from '/stores/StoreDataClean'
  import InputNode from './nodes/InputNode.vue'
  import TransformNode from './nodes/TransformNode.vue'
  import OutputNode from './nodes/OutputNode.vue'
  
  const store = useDataCleanStore()
  const root = ref(null)
  const dragLine = ref('')
  let pendingEdge = null
  let dragging = null
  
  const comp = (n) => n.kind === 'input' ? InputNode : n.kind === 'output' ? OutputNode : TransformNode
  
  function portPosition(node, side, index) {
    if (side === 'out') return { x: node.x + (node.kind === 'transform' ? 240 : 220), y: node.y + 42 }
    return { x: node.x, y: node.y + 36 + (Number(index) || 0) * 28 }
  }
  
  function edgePath(e) {
    const s = store.nodes.find(n => n.id === e.source)
    const t = store.nodes.find(n => n.id === e.target)
    if (!s || !t) return ''
    const p1 = portPosition(s, 'out')
    const p2 = portPosition(t, 'in', e.targetPort)
    const dx = Math.max(40, Math.abs(p2.x - p1.x) / 2)
    return `M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y}, ${p2.x - dx} ${p2.y}, ${p2.x} ${p2.y}`
  }
  
  function onDrag({ node, event }) {
    if (event.button !== 0) return
    const sx = event.clientX, sy = event.clientY
    const ox = node.x, oy = node.y
    const move = (ev) => {
      store.moveNode(node.id, Math.max(0, ox + ev.clientX - sx), Math.max(0, oy + ev.clientY - sy))
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  
  function onStartEdge({ node, event }) {
    const p = portPosition(node, 'out')
    pendingEdge = { source: node.id, x: p.x, y: p.y }
    dragLine.value = `M ${p.x} ${p.y} L ${p.x} ${p.y}`
    const move = (ev) => {
      if (!pendingEdge) return
      const rect = root.value.getBoundingClientRect()
      const x = ev.clientX - rect.left, y = ev.clientY - rect.top
      dragLine.value = `M ${pendingEdge.x} ${pendingEdge.y} L ${x} ${y}`
    }
    const up = (ev) => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      const rect = root.value.getBoundingClientRect()
      const x = ev.clientX - rect.left, y = ev.clientY - rect.top
      for (const n of store.nodes) {
        if (n.id === pendingEdge.source) continue
        const count = n.kind === 'transform' ? (n.inputCount || 1) : 1
        for (let i = 0; i < count; i++) {
          const pp = portPosition(n, 'in', i)
          if (Math.hypot(pp.x - x, pp.y - y) < 20) {
            store.connect(pendingEdge.source, 0, n.id, i)
            pendingEdge = null; dragLine.value = ''
            return
          }
        }
      }
      pendingEdge = null; dragLine.value = ''
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  
  onBeforeUnmount(() => { pendingEdge = null; dragging = null })
  </script>
  
  <style scoped>
  .editor { flex: 1; position: relative; overflow: hidden; background: #1e1e1e;
    background-image: linear-gradient(#2a2a2a 1px, transparent 1px), linear-gradient(90deg, #2a2a2a 1px, transparent 1px);
    background-size: 24px 24px; }
  .edges { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
  .edge { fill: none; stroke: #79b8ff; stroke-width: 2; pointer-events: stroke; cursor: pointer; }
  .edge.dragging { stroke: #f0b429; stroke-dasharray: 4 4; }
  .hint { position: absolute; left: 12px; bottom: 8px; color: #888; font-size: 12px; pointer-events: none; }
  </style>