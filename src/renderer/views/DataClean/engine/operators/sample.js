// 修复：行数为空或非法时，直接透传，不返回空数组
export default {
    type: "sample",
    meta: {
        label: "Sample",
        icon: "IconFilter",
        color: "#f43f5e",
        category: "prepare",
        inputs: 1,
        outputs: 1,
        inputPortType: "table",
        outputPortType: "table",
    },
    schema: [
        { field: "count", label: "行数", component: "input", defaultValue: "10" },
        { field: "mode", label: "模式", component: "select", options: [
            { label: "前 N 行", value: "head" },
            { label: "随机 N 行", value: "random" },
        ]},
    ],
    execute(inputs, params) {
        const data = inputs[0];
        if (!data || !data.rows) return { rows: [], columns: [] };

        const n = parseInt(params.count, 10);
        // 如果解析失败（NaN）或 <=0，说明参数没填好，直接返回原始数据，不要清空
        if (isNaN(n) || n <= 0) return data;

        if (params.mode === "random") {
            const shuffled = [...data.rows];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            return { rows: shuffled.slice(0, n), columns: data.columns };
        } else {
            return { rows: data.rows.slice(0, n), columns: data.columns };
        }
    },
};
