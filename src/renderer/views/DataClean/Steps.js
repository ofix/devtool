export const STEP_TYPES = [
    { type: 'csvJoin', label: 'JOIN', icon: '🔗', inputs: 2, params: ['leftKey', 'rightKey', 'outputColumns'] },
    { type: 'jsonMap', label: '字段映射', icon: '🧩', inputs: 1, params: ['keyField', 'valueField', 'keepValueKey'] },
    { type: 'select', label: '选列', icon: '✂️', inputs: 1, params: ['columns'] },
    { type: 'filter', label: '过滤', icon: '🔍', inputs: 1, params: ['field', 'op', 'value'] },
    { type: 'dedupe', label: '去重', icon: '🧹', inputs: 1, params: ['key'] },
    { type: 'sort', label: '排序', icon: '↕️', inputs: 1, params: ['field', 'order'] },
  ]
  
  export const STEP_MAP = Object.fromEntries(STEP_TYPES.map(s => [s.type, s]))
  
  // 每个 step 的 execute(inputs, params) -> { rows, columns }
  export const EXECUTORS = {
    csvJoin([left, right], p) {
      if (!left || !right) throw new Error('JOIN 需要两个输入')
      const idx = new Map()
      for (const r of right.rows) idx.set(r[p.rightKey], r)
      const rows = []
      for (const l of left.rows) {
        const r = idx.get(l[p.leftKey])
        if (!r) continue
        const merged = { ...l, ...r }
        rows.push(p.outputColumns?.length
          ? Object.fromEntries(p.outputColumns.map(c => [c, merged[c]]))
          : merged)
      }
      const columns = p.outputColumns?.length ? p.outputColumns : Object.keys(rows[0] || {})
      return { rows, columns }
    },
    jsonMap([input], p) {
      if (!input) throw new Error('字段映射需要一个输入')
      const out = {}
      for (const r of input.rows) {
        const k = r[p.keyField]
        if (k == null) continue
        out[k] = p.keepValueKey ? { [p.valueField]: r[p.valueField] } : r[p.valueField]
      }
      const rows = Object.entries(out).map(([k, v]) => ({ key: k, value: v }))
      return { rows, columns: ['key', 'value'] }
    },
    select([input], p) {
      if (!input) throw new Error('选列需要一个输入')
      const cols = p.columns?.length ? p.columns : input.columns
      return { rows: input.rows.map(r => Object.fromEntries(cols.map(c => [c, r[c]]))), columns: cols }
    },
    filter([input], p) {
      if (!input) throw new Error('过滤需要一个输入')
      const rows = input.rows.filter(r => {
        const v = r[p.field]
        switch (p.op) {
          case 'eq': return String(v) === String(p.value)
          case 'neq': return String(v) !== String(p.value)
          case 'contains': return String(v).includes(p.value)
          case 'gt': return Number(v) > Number(p.value)
          case 'lt': return Number(v) < Number(p.value)
          default: return true
        }
      })
      return { rows, columns: input.columns }
    },
    dedupe([input], p) {
      if (!input) throw new Error('去重需要一个输入')
      const seen = new Set()
      const rows = input.rows.filter(r => {
        const k = r[p.key]
        if (seen.has(k)) return false
        seen.add(k); return true
      })
      return { rows, columns: input.columns }
    },
    sort([input], p) {
      if (!input) throw new Error('排序需要一个输入')
      const rows = [...input.rows].sort((a, b) => {
        const av = a[p.field], bv = b[p.field]
        const r = av > bv ? 1 : av < bv ? -1 : 0
        return p.order === 'desc' ? -r : r
      })
      return { rows, columns: input.columns }
    },
  }