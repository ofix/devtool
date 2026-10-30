// Message 算子：调试输出，写日志条，透传数据

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
    schema: [
        { field: "text", label: "消息", component: "input" },
    ],
    execute(inputs, params, ctx) {
        const data = inputs[0] || { rows: [], columns: [] };
        if (ctx && typeof ctx.log === "function") {
            ctx.log(`[Message] ${params.text || ""} | 行数=${data.rows.length}`);
        }
        return data;
    },
};
