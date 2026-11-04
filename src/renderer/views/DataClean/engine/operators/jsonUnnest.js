import { DATA_CATEGORY } from "../../constants/DataCategories.js"
import { inferDataCategory } from "../runtime/InferCategory.js"

/**
 * 核心逻辑：按路径从对象中提取值（支持特殊字符和中括号）
 */
function getValueByPath(obj, path) {
  if (!path) return obj
  // 简单处理，把 items[0].sku 转为 ["items", "0", "sku"]
  const cleanPath = path.trim().replace(/^\./, "")
  const parts = cleanPath.split(/\.|\[|\]/).filter(Boolean)
  let current = obj
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    current = current[part]
  }
  return current
}

export default {
  type: "jsonUnnest",
  meta: {
    label: "JSON Unnest",
    icon: "IconExpand",
    color: "#06b6d4",
    category: "json",
    inputs: 1,
    outputs: 1,
    inputCategory: DATA_CATEGORY.JSON,
    outputCategory: "dynamic",
  },
  schema: [{ field: "targetPath", label: "展开数组", component: "arrayPicker" }],
  execute(inputs, params, ctx) {
    const inputJson = inputs[0]?.json
    if (!inputJson) throw new Error("未接收到 JSON 数据")

    // 确保我们处理的是一个数组列表
    const dataArray = Array.isArray(inputJson) ? inputJson : [inputJson]
    const path = params.targetPath

    if (!path) throw new Error("请配置需要展开的数组字段")

    if (ctx?.log) ctx.log(`[JSON Unnest] 准备展开路径: ${path}`)

    const outRows = []

    for (const item of dataArray) {
      if (!item || typeof item !== "object") {
        outRows.push(item)
        continue
      }

      // 1. 找到目标数组
      const targetArray = getValueByPath(item, path)

      if (Array.isArray(targetArray)) {
        // 2. 准备父级属性（剥离掉目标数组本身，避免冗余）
        const parentObj = { ...item }
        // 简单删除路径的最后一级（为安全起见，只处理简单的一级属性）
        delete parentObj[path]

        for (const subItem of targetArray) {
          // 3. 组装新行：父级属性 + 子元素属性
          if (subItem !== null && typeof subItem === "object" && !Array.isArray(subItem)) {
            // 如果数组里是对象，合并属性
            // 注意：如果子元素和父元素有同名属性，子元素会覆盖父元素
            outRows.push({ ...parentObj, ...subItem })
          } else {
            // 如果数组里是基础类型（如 ["A", "B"]），给个默认列名
            outRows.push({ ...parentObj, value: subItem })
          }
        }
      } else {
        // 如果这个字段不是数组，原样保留，避免数据丢失
        outRows.push(item)
      }
    }

    if (ctx?.log) ctx.log(`[JSON Unnest] 展开完成，共生成 ${outRows.length} 条数据`)

    // 4. 自动推断并降维
    const category = inferDataCategory(outRows)
    if (category === DATA_CATEGORY.TABLE) {
      // 取第一行的所有 Key 作为列名
      const columns = Object.keys(outRows[0] || {}).map(k => ({ name: k, type: "string" }))
      return { dataCategory: DATA_CATEGORY.TABLE, rows: outRows, columns }
    }

    return { dataCategory: DATA_CATEGORY.JSON, json: outRows }
  },
}
