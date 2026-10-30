// Script 算子：shell 命令执行
export default {
    type: "script",
    meta: {
        label: "Script",
        icon: "IconCode",
        color: "#64748b",
        category: "develop",
        inputs: 1,
        outputs: 1,
        inputPortType: "table",
        outputPortType: "table",
    },
    schema: [
        { field: "command", label: "Shell 命令", component: "input" },
        { field: "outputFormat", label: "输出格式", component: "select", options: [
            { label: "Text", value: "text" },
            { label: "CSV", value: "csv" },
            { label: "JSON", value: "json" },
        ]},
    ],
    async execute(inputs, params, ctx) {
        const data = inputs[0] || { rows: [], columns: [] };
        if (!params.command) return data;

        try {
            const result = await window.api.dataClean.command.exec(params.command, {
                timeout: 30000,
                maxOutput: 1024 * 1024,
            });

            if (!result.ok) {
                throw new Error(result.stderr || "命令执行失败");
            }

            const outText = result.stdout;
            if (ctx.log) ctx.log(`[Script] 执行完毕，输出 ${outText.length} 字符`);

            // 解析输出
            if (params.outputFormat === "json") {
                const parsed = JSON.parse(outText);
                const rows = Array.isArray(parsed) ? parsed : [parsed];
                const keys = new Set();
                for (const row of rows.slice(0, 10)) {
                    Object.keys(row).forEach(k => keys.add(k));
                }
                const columns = Array.from(keys).map(name => ({ name, type: "string" }));
                return { rows, columns };
            } else if (params.outputFormat === "csv") {
                const { parseCsv } = await import("./input.js");
                const parsed = parseCsv(outText);
                return parsed;
            } else {
                // text 格式：输出单行单列
                return {
                    rows: [{ output: outText }],
                    columns: [{ name: "output", type: "string" }],
                };
            }
        } catch (err) {
            throw new Error(`Script 执行失败: ${err.message}`);
        }
    },
};
