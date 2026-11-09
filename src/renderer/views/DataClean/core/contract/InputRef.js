/**
 * 上游输入引用。
 *
 * 编译模式：带 cteName，nodeId 仅用于日志和血缘追踪，
 *          禁止用于读取 meta / resultVersion。
 * 执行模式：带 cacheKey，nodeId 可用于增量判定的上游版本查询。
 */
export class InputRef {
  constructor({ nodeId, cacheKey, cteName, schema, columnMapping, dataCategory }) {
    this.nodeId = nodeId;
    this.cacheKey = cacheKey;
    this.cteName = cteName;
    this.schema = schema ?? [];
    this.columnMapping = columnMapping ?? {};
    this.dataCategory = dataCategory;
  }

  get isCompiled() {
    return !!this.cteName;
  }
}
