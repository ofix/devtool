// Sample 算子：前 N 行 / 随机 N 行
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
        { field: "count", label: "行数", component: "input" },
        { field: "mode", label: "模式", component: "select", options: [
            { label: "前 N 行", value: "head" },
            { label: "随机 N 行", value: "random" },
        ]},
    ],
    execute(inputs, params) {
        const data = inputs[0];
        if (!data || !data.rows) return { rows: [], columns: [] };

        const n = parseInt(params.count, 10) || 0;
        if (n <= 0) return data;

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
