// Join 算子：左右表连接
export default {
    type: "join",
    meta: {
        label: "Join",
        icon: "IconLink",
        color: "#6366f1",
        category: "join",
        inputs: 2,
        outputs: 1,
        inputPortType: "table",
        outputPortType: "table",
    },
    schema: [
        // 重点：指定 sourcePort 让 TransformNode 去读对应的输入端口
        { field: "leftKey", label: "左表键", component: "fieldSelect", sourcePort: 0, multiple: false },
        { field: "rightKey", label: "右表键", component: "fieldSelect", sourcePort: 1, multiple: false },
        { field: "joinType", label: "连接方式", component: "select", options: [
            { label: "Inner", value: "inner" },
            { label: "Left", value: "left" },
            { label: "Right", value: "right" },
            { label: "Full", value: "full" },
            { label: "Anti", value: "anti" },
        ]},
    ],
    execute(inputs, params) {
        const left = inputs[0] || { rows: [], columns: [] };
        const right = inputs[1] || { rows: [], columns: [] };
        const { leftKey, rightKey, joinType = "inner" } = params;

        if (!leftKey || !rightKey) {
            throw new Error("请配置左表和右表的连接键");
        }

        const rightMap = new Map();
        for (const row of right.rows) {
            const key = String(row[rightKey]);
            if (!rightMap.has(key)) rightMap.set(key, []);
            rightMap.get(key).push(row);
        }

        const outRows = [];
        const matchedRightKeys = new Set();

        for (const leftRow of left.rows) {
            const key = String(leftRow[leftKey]);
            const matches = rightMap.get(key) || [];

            if (matches.length > 0) {
                matchedRightKeys.add(key);
                for (const rightRow of matches) {
                    outRows.push({ ...leftRow, ...rightRow });
                }
            } else {
                if (joinType === "left" || joinType === "full" || joinType === "anti") {
                    outRows.push({ ...leftRow });
                }
            }
        }

        if (joinType === "right" || joinType === "full") {
            for (const rightRow of right.rows) {
                const key = String(rightRow[rightKey]);
                if (!matchedRightKeys.has(key)) {
                    outRows.push({ ...rightRow });
                }
            }
        }

        // 列名冲突处理
        const outCols = [];
        const seen = new Set();
        for (const c of left.columns) {
            const name = c.name;
            if (seen.has(name)) {
                outCols.push({ name: `${name}_left`, type: c.type });
            } else {
                outCols.push({ name, type: c.type });
                seen.add(name);
            }
        }
        for (const c of right.columns) {
            const name = c.name;
            if (seen.has(name)) {
                outCols.push({ name: `${name}_right`, type: c.type });
            } else {
                outCols.push({ name, type: c.type });
                seen.add(name);
            }
        }

        return { rows: outRows, columns: outCols };
    },
};
