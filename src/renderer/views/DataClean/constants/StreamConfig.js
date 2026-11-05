/**
 * 流式处理全局配置
 * 集中管理所有与性能相关的阈值，避免散落在各个算子中
 */
export const STREAM_CONFIG = {
  // 触发流式处理的数据大小阈值 (2MB)
  SIZE_THRESHOLD_BYTES: 2 * 1024 * 1024,

  // 每次流式产出的数据块行数 (5万行)
  CHUNK_SIZE_ROWS: 50000,

  // 预览面板最大允许渲染的行数
  PREVIEW_LIMIT_ROWS: 1000,
}
