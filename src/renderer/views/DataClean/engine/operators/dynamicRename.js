// Dynamic Rename 算子：按映射表批量重命名列
import { DATA_CATEGORY } from "../../constants/DataCategories.js"

export default {
  type: "dynamicRename",
  meta: {
    label: "Dynamic Rename",
    icon: "IconTextRecognition",
    color: "#0ea5e9",
    category: "develop",
    inputs: 1,
    outputs: 1,
    inputCategory: DATA_CATEGORY.TABLE,
    outputCategory: DATA_CATEGORY.TABLE,
  },
  schema: [
    { field: "renameMap", label: "映射表(旧:新,)", component: "input" },
    { field: "prefix", label: "统一前缀", component: "input" },
    { field: "suffix", label: "统一后缀", component: "input" },
  ],
  execute(inputs, params) {
    const data = inputs[0]
    if (!data || !data.rows) return { rows: [], columns: [], columnMapping: {} }

    const renameMap = {}
    if (params.renameMap && params.renameMap.trim()) {
      params.renameMap.split(",").forEach(pair => {
        const [oldName, newName] = pair.split(":").map(s => s.trim())
        if (oldName && newName) renameMap[oldName] = newName
      })
    }

    const { prefix = "", suffix = "" } = params

    // 构建血缘映射字典
    const columnMapping = {}

    const outCols = data.columns.map(c => {
      let name = renameMap[c.name] || c.name
      const finalName = `${prefix}${name}${suffix}`

      // 记录新字段名的来源是哪个旧字段
      columnMapping[finalName] = c.name

      return { name: finalName, type: c.type }
    })

    const outRows = data.rows.map(row => {
      const newRow = {}
      for (const c of data.columns) {
        let name = renameMap[c.name] || c.name
        newRow[`${prefix}${name}${suffix}`] = row[c.name]
      }
      return newRow
    })

    return { rows: outRows, columns: outCols, columnMapping }
  },
}
