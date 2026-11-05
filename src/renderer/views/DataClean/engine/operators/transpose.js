// Transpose 算子：宽表转长表 (Unpivot)
import { DATA_CATEGORY } from "../../constants/DataCategories.js"

export default {
  type: "transpose",
  meta: {
    label: "Transpose",
    icon: "IconSwitch",
    color: "#10b981",
    category: "transform",
    inputs: 1,
    outputs: 1,
    inputCategory: DATA_CATEGORY.TABLE,
    outputCategory: DATA_CATEGORY.TABLE,
  },
  schema: [
    { field: "keepFields", label: "保留列", component: "fieldSelect", multiple: true },
    { field: "unpivotFields", label: "转置列", component: "fieldSelect", multiple: true },
  ],
  execute(inputs, params) {
    const data = inputs[0]
    if (!data || !data.rows) return { rows: [], columns: [], columnMapping: {} }

    let keepFields = params.keepFields || []
    if (typeof keepFields === "string")
      keepFields = keepFields
        .split(",")
        .map(s => s.trim())
        .filter(Boolean)

    let unpivotFields = params.unpivotFields || []
    if (typeof unpivotFields === "string")
      unpivotFields = unpivotFields
        .split(",")
        .map(s => s.trim())
        .filter(Boolean)

    // 如果没有指定转置列，原样透传，补齐映射
    if (unpivotFields.length === 0) {
        const columnMapping = {}
        data.columns.forEach(c => columnMapping[c.name] = c.name)
        return { ...data, columnMapping }
    }

    const outRows = []
    for (const row of data.rows) {
      const base = {}
      keepFields.forEach(f => (base[f] = row[f]))

      for (const uf of unpivotFields) {
        outRows.push({
          ...base,
          key: uf,
          value: row[uf],
        })
      }
    }

    const outCols = [
      ...keepFields.map(f => ({ name: f, type: "string" })),
      { name: "key", type: "string" },
      { name: "value", type: "string" },
    ]

    // 核心：构建血缘映射字典
    const columnMapping = {}
    
    // 保留列：直接透传
    for (const f of keepFields) {
      columnMapping[f] = f
    }
    
    // key 列：来源于被转置的列名，依赖多列
    columnMapping["key"] = unpivotFields
    
    // value 列：来源于被转置列的具体值，依赖多列
    columnMapping["value"] = unpivotFields

    return { rows: outRows, columns: outCols, columnMapping }
  },
}