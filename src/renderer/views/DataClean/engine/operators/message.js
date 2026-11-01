// 修改：标准的透传算子
export default {
  type: "message",
  meta: {
    label: "Message",
    icon: "IconChatDot",
    color: "#64748b",
    category: "develop",
    inputs: 1,
    outputs: 1,
    inputPortType: "table",
    outputPortType: "table",
  },
  schema: [{ field: "text", label: "消息", component: "input" }],
  execute(inputs, params, ctx) {
    const data = inputs[0] || { rows: [], columns: [] }
    if (ctx && typeof ctx.log === "function") {
      // 这里的 ctx.log 已经绑定了 nodeId
      ctx.log(`[Message] ${params.text || "调试输出"} | 行数=${data.rows.length}`, "info")
    }
    return data
  },
}
