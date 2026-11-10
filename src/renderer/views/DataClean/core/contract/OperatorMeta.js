/**
 * 算子注册元数据（OperatorMeta）。
 *
 * 每个算子注册时必须声明 inputRecordSetsSupport，缺失视为开发错误。
 *
 * @typedef {object} OperatorMeta
 * @property {string} type
 * @property {string} label
 * @property {string} icon
 * @property {string} category
 *
 * @property {number} inputPorts              静态输入端口数
 * @property {number} outputPorts             输出端口数
 * @property {"static"|"dynamic"} inputMode
 * @property {number} [minInputPorts]         dynamic 时必填
 * @property {number} [maxInputPorts]         dynamic 时必填
 *
 * @property {Array<"table"|"json"|"text">} inputRecordSetsSupport  支持的输入形态
 *
 * @property {object} executePolicy
 * @property {boolean} executePolicy.canCompile        能否生成 SQL 片段（lazy）
 * @property {boolean} executePolicy.needAllInputReady 是否等上游全部就绪才执行（屏障）
 *
 * @property {Array<object>} schema           UI 配置面板字段
 */
export {};