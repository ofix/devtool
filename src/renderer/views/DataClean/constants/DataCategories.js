// 数据形态枚举，防止硬编码字符串带来的拼写错误
export const DATA_CATEGORY = Object.freeze({
  TABLE: "table", // 二维表格
  JSON: "json", // 原生 JSON 对象/数组
  SCALAR_ARRAY: "scalar_array", // 一维基础数组 [1, 2, 3]
  EMPTY: "empty", // 空数据
})

export const isTable = category => category === DATA_CATEGORY.TABLE
export const isJson = category => category === DATA_CATEGORY.JSON
