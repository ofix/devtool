import { defineStore } from 'pinia'
import { STEP_MAP } from '@/views/DataClean/Steps'

let seq = 1
const uid = (p) => `${p}_${seq++}`

export const useDataCleanStore = defineStore('DawtaClean', {
  state: () => ({
    nodes: [],
    edges: [],
    datasets: {},
    selectedId: null,
    running: false,
  }),
  getters: {
    selectedNode: (s) => s.nodes.find(n => n.id === s.selectedId) || null,
    selectedDataset: (s) => s.selectedId ? s.datasets[s.selectedId] : null,
  },
  actions: {
    addInputNode(name, rows, columns) {
      const node = {
        id: uid('input'), kind: 'input', name,
        x: 60, y: 40 + this.nodes.filter(n => n.kind === 'input').length * 140,
      }
      this.nodes.push(node)
      this.datasets[node.id] = { rows, columns, count: rows.length }
      this.selectedId = node.id
      return node
    },
    addTransformNode(stepType) {
      const meta = STEP_MAP[stepType]
      const node = {
        id: uid(stepType), kind: 'transform', stepType,
        name: meta.label, inputCount: meta.inputs,
        params: {}, x: 360, y: 60 + this.nodes.filter(n => n.kind === 'transform').length * 160,
      }
      this.nodes.push(node)
      this.selectedId = node.id
      return node
    },
    addOutputNode(name = 'output.json') {
      const node = {
        id: uid('output'), kind: 'output', name,
        x: 760, y: 60 + this.nodes.filter(n => n.kind === 'output').length * 140,
      }
      this.nodes.push(node)
      this.selectedId = node.id
      return node
    },
    removeNode(id) {
      this.nodes = this.nodes.filter(n => n.id !== id)
      this.edges = this.edges.filter(e => e.source !== id && e.target !== id)
      delete this.datasets[id]
      if (this.selectedId === id) this.selectedId = null
    },
    connect(source, sourcePort, target, targetPort) {
      this.edges = this.edges.filter(e => !(e.target === target && Number(e.targetPort) === Number(targetPort)))
      this.edges.push({ id: uid('edge'), source, sourcePort: Number(sourcePort), target, targetPort: Number(targetPort) })
    },
    removeEdge(id) { this.edges = this.edges.filter(e => e.id !== id) },
    moveNode(id, x, y) {
      const n = this.nodes.find(n => n.id === id)
      if (n) { n.x = x; n.y = y }
    },
    selectNode(id) { this.selectedId = id },
    setDataset(id, ds) { this.datasets[id] = { ...ds, count: ds.rows.length } },
    updateParams(id, params) {
      const n = this.nodes.find(n => n.id === id)
      if (n) { n.params = { ...n.params, ...params }; delete this.datasets[id] }
    },
  },
})