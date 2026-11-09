export function buildCacheKey({ workflowId, nodeId }) {
  return `${workflowId ?? "_"}:${nodeId}`;
}

export function allocateTableName(workflowId, nodeId) {
  let h = 0;
  const raw = `${workflowId}_${nodeId}`;
  for (let i = 0; i < raw.length; i++) h = (h * 31 + raw.charCodeAt(i)) | 0;
  return `tbl_${(h >>> 0).toString(36)}`;
}

export function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/**
 * 对节点参数做确定性哈希。
 * node.params 来自 UI 面板，录入时已完成过滤，只含计算参数。
 */
export function hashParams(params) {
  try {
    const obj = params ?? {};
    const sortedKeys = Object.keys(obj).sort();
    const ordered = {};
    for (const k of sortedKeys) ordered[k] = obj[k];
    return hashString(JSON.stringify(ordered));
  } catch {
    // 无法序列化时给唯一值，强制重跑
    return hashString(String(Date.now()));
  }
}
