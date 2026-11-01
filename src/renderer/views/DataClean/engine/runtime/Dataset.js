// Dataset 工具：类型推断、列元数据构建

/**
 * 推断列类型
 * @param {object[]} rows
 * @param {string[]} keys
 * @returns {{ name: string, type: string }[]}
 */
export function inferColumns(rows, keys) {
  return keys.map(key => ({
    name: key,
    type: inferColumnType(rows, key),
  }))
}

/**
 * 推断单列类型
 * @param {object[]} rows
 * @param {string} key
 * @returns {string} string | number | boolean | date
 */
function inferColumnType(rows, key) {
  let sawNumber = false
  let sawBoolean = false
  let sawDate = false
  let sawValue = false
  const sample = rows.slice(0, 100)

  for (const row of sample) {
    const v = row[key]
    if (v === null || v === undefined || v === "") continue
    sawValue = true
    if (typeof v === "number") {
      sawNumber = true
      continue
    }
    if (typeof v === "boolean") {
      sawBoolean = true
      continue
    }
    if (typeof v === "string") {
      if (!isNaN(Number(v)) && v.trim() !== "") {
        sawNumber = true
      } else if (v === "true" || v === "false") {
        sawBoolean = true
      } else if (!isNaN(Date.parse(v))) {
        sawDate = true
      }
    }
  }

  if (!sawValue) return "string"
  if (sawNumber) return "number"
  if (sawBoolean) return "boolean"
  if (sawDate) return "date"
  return "string"
}

/**
 * 创建 Dataset 对象
 * @param {object[]} rows
 * @param {{name:string,type:string}[]} columns
 * @returns {{rows:object[], columns:object[]}}
 */
export function createDataset(rows, columns) {
  return { rows, columns }
}
