/**
 * 算子输入端口（OperatorInputPort）。
 *
 * Scheduler 构造，传给算子 execute() 的第一个参数（数组）。
 *
 * @typedef {object} OperatorInputPort
 * @property {string} upstreamNodeId          上游节点 id
 * @property {string} [recordSetsKey]         执行模式：指向已物化结果
 * @property {string} [sqlCteName]            编译模式：指向上游 SQL CTE 名称
 * @property {"table"|"json"|"text"} recordSetsKind  实际输入形态
 * @property {Column[]} columns               列元数据（json / text 输入可为空）
 * @property {object} [jsonOutline]           JSON 输入结构概览，结构待定
 * @property {object} columnMapping           血缘映射
 * @property {string} upstreamResultVersion   上游结果版本，增量判定用
 * @property {number} inputPortIndex          输入端口序号
 */
export {};