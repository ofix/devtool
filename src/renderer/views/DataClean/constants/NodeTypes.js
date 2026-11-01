// 确保分类涵盖所有新算子
export const NODE_TYPES = {
  INPUT: "input",
  OUTPUT: "output",
  MESSAGE: "message",
  FILTER: "filter",
}

export const NODE_CATEGORIES = [
  { key: "source", label: "数据源" },
  { key: "prepare", label: "准备" },
  { key: "join", label: "连接" },
  { key: "parse", label: "解析" },
  { key: "transform", label: "转换" },
  { key: "develop", label: "开发" },
  { key: "output", label: "输出" },
]
