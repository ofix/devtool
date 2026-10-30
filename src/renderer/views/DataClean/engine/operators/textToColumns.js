// Text to Columns：按分隔符或正则拆分一列
export default {
    type: "textToColumns",
    meta: {
        label: "Text to Columns",
        icon: "IconCut",
        color: "#0ea5e9",
        category: "parse",
        inputs: 1,
        outputs: 1,
        inputPortType: "table",
        outputPortType: "table",
    },
    schema: [
        { field: "sourceField", label: "拆分列", component: "fieldSelect", multiple: false },
        { field: "delimiter", label: "分隔符", component: "input", defaultValue: "," },
        { field: "newFieldPrefix", label: "新列前缀", component: "input", defaultValue: "split" },
    ],
    execute(inputs, params) {
        const data = inputs[0];
        if (!data || !data.rows) return { rows: [], columns: [] };

        const { sourceField, delimiter = ",", newFieldPrefix = "split" } = params;
        if (!sourceField) return data;

        // 先探测最大拆分列数
        let maxParts = 1;
        for (const row of data.rows) {
            const val = String(row[sourceField] || "");
            const parts = val.split(delimiter);
            maxParts = Math.max(maxParts, parts.length);
        }

        const newCols = [];
        for (let i = 0; i < maxParts; i++) {
            newCols.push({ name: `${newFieldPrefix}_${i + 1}`, type: "string" });
        }

        const outCols = [
            ...data.columns.filter(c => c.name !== sourceField),
            ...newCols
        ];

        const outRows = data.rows.map(row => {
            const newRow = {};
            for (const c of data.columns) {
                if (c.name !== sourceField) newRow[c.name] = row[c.name];
            }
            const val = String(row[sourceField] || "");
            const parts = val.split(delimiter);
            for (let i = 0; i < maxParts; i++) {
                newRow[`${newFieldPrefix}_${i + 1}`] = parts[i] || null;
            }
            return newRow;
        });

        return { rows: outRows, columns: outCols };
    },
};
