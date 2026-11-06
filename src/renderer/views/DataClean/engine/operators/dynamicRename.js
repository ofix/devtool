import { DATA_CATEGORY } from "../../constants/DataCategories.js"
import StreamDataset from "../runtime/StreamDataset.js"
import StreamController from "../runtime/StreamController.js"

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
  async execute(inputs, params, ctx) {
    const data = inputs[0]
    if (!data) return null

    const renameMap = {}
    if (params.renameMap && params.renameMap.trim()) {
      params.renameMap.split(",").forEach(pair => {
        const [oldName, newName] = pair.split(":").map(s => s.trim())
        if (oldName && newName) renameMap[oldName] = newName
      })
    }

    const { prefix = "", suffix = "" } = params

    // 构建列映射
    const columnMapping = {}
    const outCols = data.columns.map(c => {
      let name = renameMap[c.name] || c.name
      const finalName = `${prefix}${name}${suffix}`
      columnMapping[finalName] = c.name
      return { name: finalName, type: c.type }
    })

    async function* renameGenerator() {
      const controller = new StreamController(data.controller.sourceGenerator, "rendezvous")
      const iterator = controller.createIterator("rename-node", ctx.signal)

      for await (const chunk of iterator) {
        if (ctx.signal.aborted) return

        const outRows = chunk.rows.map(row => {
          const newRow = {}
          for (const c of data.columns) {
            let name = renameMap[c.name] || c.name
            newRow[`${prefix}${name}${suffix}`] = row[c.name]
          }
          return newRow
        })

        yield { columns: outCols, rows: outRows }
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    }

    return new StreamDataset({
      dataCategory: DATA_CATEGORY.TABLE,
      columns: outCols,
      controller: { sourceGenerator: renameGenerator, strategy: "rendezvous" },
      columnMapping,
    })
  },
}
