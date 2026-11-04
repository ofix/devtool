import { DATA_CATEGORY } from "../../constants/DataCategories.js"

/**
 * 数据形态推断算法
 * @param {any} data - 待推断的数据（可能是数组、对象或基础类型）
 * @returns {string} 数据形态枚举
 */
export function inferDataCategory(data) {
  if (!data) return DATA_CATEGORY.EMPTY

  // 处理一维基础数组 [1, 2, 3]
  if (Array.isArray(data)) {
    if (data.length === 0) return DATA_CATEGORY.EMPTY

    const firstItem = data[0]
    if (typeof firstItem !== "object" || firstItem === null) {
      return DATA_CATEGORY.SCALAR_ARRAY
    }

    // 抽样前 100 行，判断是否包含嵌套
    const sample = data.slice(0, 100)
    for (const row of sample) {
      if (row === null || Array.isArray(row)) return DATA_CATEGORY.JSON
      for (const key in row) {
        const val = row[key]
        if (val !== null && typeof val === "object") {
          return DATA_CATEGORY.JSON // 发现嵌套，判定为 JSON
        }
      }
    }
    return DATA_CATEGORY.TABLE
  }

  // 纯对象 {} 直接判定为 JSON
  if (typeof data === "object") {
    return DATA_CATEGORY.JSON
  }

  return DATA_CATEGORY.EMPTY
}
