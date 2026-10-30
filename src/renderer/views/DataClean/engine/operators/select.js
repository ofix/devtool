// Select 算子：选列、重命名、调整顺序
export default {
    type: "select",
    meta: {
        label: "Select",
        icon: "IconList",
        color: "#0ea5e9",
        category: "prepare",
        inputs: 1,
        outputs: 1,
        inputPortType: "table",
        outputPortType: "table",
    },
    schema: [
        { field: "columns", label: "保留列", component: "fieldSelect", multiple: true },
        { field: "renameMap", label: "重命名(旧:新)", component: "input" },
    ],
    execute(inputs, params) {
        const data = inputs[0];
        if (!data || !data.rows) return { rows: [], columns: [] };

        // 处理列筛选
        let keepCols = params.columns || [];
        if (typeof keepCols === "string") {
            keepCols = keepCols.split(",").map(s => s.trim()).filter(Boolean);
        }
        if (keepCols.length === 0) keepCols = data.columns.map(c => c.name);

        // 解析重命名映射 (a:b, c:d)
        const renameMap = {};
        if (params.renameMap && params.renameMap.trim()) {
            params.renameMap.split(",").forEach(pair => {
                const [oldName, newName] = pair.split(":").map(s => s.trim());
                if (oldName && newName) renameMap[oldName] = newName;
            });
        }

        const outCols = [];
        const validCols = new Set();
        for (const c of data.columns) {
            if (keepCols.includes(c.name)) {
                const newName = renameMap[c.name] || c.name;
                outCols.push({ name: newName, type: c.type });
                validCols.add(c.name);
            }
        }

        const outRows = data.rows.map(row => {
            const newRow = {};
            for (const oldName of validCols) {
                const newName = renameMap[oldName] || oldName;
                newRow[newName] = row[oldName];
            }
            return newRow;
        });

        return { rows: outRows, columns: outCols };
    },
};
