// 端口类型定义与连接校验矩阵

export const PORT_TYPES = {
  table: { label: "Table", color: "#3b82f6" },
  scalar: { label: "Scalar", color: "#f97316" },
  config: { label: "Config", color: "#22c55e" },
}

/**
 * 判断 from 端口类型能否连接到 to 端口类型
 * 一期只允许 table -> table
 * @param {string} fromType
 * @param {string} toType
 * @returns {boolean}
 */
export function canConnect(fromType, toType) {
  if (fromType === "table" && toType === "table") return true
  return false
}

/**
 * 获取端口颜色
 * @param {string} type
 * @returns {string}
 */
export function getPortColor(type) {
  return PORT_TYPES[type] ? PORT_TYPES[type].color : "#94a3b8"
}
