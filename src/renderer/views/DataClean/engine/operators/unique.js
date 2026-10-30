// Unique 算子：单列或多列去重
export default {
    type: "unique",
    meta: {
        label: "Unique",
        icon: "IconCopy",
        color: "#8b5cf6",
        category: "prepare",
        inputs: 1,
        outputs: 1,
        inputPortType: "table",
        outputPortType: "table",
    },
    schema: [
        { field: "fields", label: "去重列", component: "fieldSelect", multiple: true },
    ],
    execute(inputs, params) {
        const data = inputs[0];
        if (!data || !data.rows) return { rows: [], columns: [] };

        let keys = params.fields || [];
        if (typeof keys === "string") {
            keys = keys.split(",").map(s => s.trim()).filter(Boolean);
        }
        
        const seen = new Set();
        const outRows = [];

        for (const row of data.rows) {
            let keyStr = "";
            if (keys.length > 0) {
                keyStr = keys.map(k => String(row[k])).join("|||");
            } else {
                keyStr = JSON.stringify(row);
            }

            if (!seen.has(keyStr)) {
                seen.add(keyStr);
                outRows.push(row);
            }
        }

        return { rows: outRows, columns: data.columns };
    },
};
