import { EXECUTORS } from "./Steps"

export function runNode(store, nodeId) {
  const node = store.nodes.find(n => n.id === nodeId)
  if (!node) return null
  if (store.datasets[nodeId]) return store.datasets[nodeId]

  if (node.kind === "input" || node.kind === "xlsxInput") {
    return store.datasets[nodeId] // 输入节点在导入时已写入
  }
  if (node.kind === "output") {
    const inEdge = store.edges.find(e => e.target === nodeId)
    if (!inEdge) throw new Error(`输出节点 ${node.name} 缺少输入`)
    const ds = runNode(store, inEdge.source)
    store.setDataset(nodeId, ds)
    return ds
  }
  // transform
  const inputPorts = node.inputCount || 1
  const inputs = []
  for (let i = 0; i < inputPorts; i++) {
    const edge = store.edges.find(e => e.target === nodeId && Number(e.targetPort) === i)
    if (!edge) throw new Error(`${node.name} 输入 ${i + 1} 未连接`)
    inputs.push(runNode(store, edge.source))
  }
  const exec = EXECUTORS[node.stepType]
  if (!exec) throw new Error(`未知步骤类型 ${node.stepType}`)
  const ds = exec(inputs, node.params || {})
  store.setDataset(nodeId, ds)
  return ds
}

export function runAll(store) {
  const outputs = store.nodes.filter(n => n.kind === "output")
  if (!outputs.length) throw new Error("没有输出节点")
  for (const o of outputs) runNode(store, o.id)
}
