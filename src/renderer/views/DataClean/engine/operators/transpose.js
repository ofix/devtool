// Transpose 算子：宽表转长表 (Unpivot)
export default {
    type: "transpose",
    meta: {
        label: "Transpose",
        icon: "IconSwitch",
        color: "#10b981",
        category: "transform",
        inputs: 1,
        outputs: 1,
        inputPortType: "table",
        outputPortType: "table",
    },
    schema: [
        { field: "keepFields", label: "保留列", component: "fieldSelect", multiple: true },
        { field: "unpivotFields", label: "转置列", component: "fieldSelect", multiple: true },
    ],
    execute(inputs, params) {
        const data = inputs[0];
        if (!data || !data.rows) return { rows: [], columns: [] };

        let keepFields = params.keepFields || [];
        if (typeof keepFields === "string") keepFields = keepFields.split(",").map(s => s.trim()).filter(Boolean);

        let unpivotFields = params.unpivotFields || [];
        if (typeof unpivotFields === "string") unpivotFields = unpivotFields.split(",").map(s => s.trim()).filter(Boolean);

        if (unpivotFields.length === 0) return data;

        const outRows = [];
        for (const row of data.rows) {
            const base = {};
            keepFields.forEach(f => base[f] = row[f]);

            for (const uf of unpivotFields) {
                outRows.push({
                    ...base,
                    "key": uf,
                    "value": row[uf]
                });
            }
        }

        const outCols = [
            ...keepFields.map(f => ({ name: f, type: "string" })),
            { name: "key", type: "string" },
            { name: "value", type: "string" }
        ];

        return { rows: outRows, columns: outCols };
    },
};
