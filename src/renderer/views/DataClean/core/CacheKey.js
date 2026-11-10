export function buildCacheKey({ graphId, nodeId }) {
  return `${graphId ?? "_"}:${nodeId}`;
}

export function allocateTableName(graphId, nodeId) {
  let h = 0;
  const raw = `${graphId}_${nodeId}`;
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

export function hashParams(params) {
  try {
    const obj = params ?? {};
    const sortedKeys = Object.keys(obj).sort();
    const ordered = {};
    for (const k of sortedKeys) ordered[k] = obj[k];
    return hashString(JSON.stringify(ordered));
  } catch {
    return hashString(String(Date.now()));
  }
}
