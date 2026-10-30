// Summarize 算子：按字段分组，对指定列执行聚合 (SUM/AVG/COUNT/MIN/MAX)
export default {
    type: "summarize",
    meta: {
        label: "Summarize",
        icon: "IconDataLine",
        color: "#f59e0b",
        category: "transform",
        inputs: 1,
        outputs: 1,
        inputPortType: "table",
        outputPortType: "table",
    },
    schema: [
        { field: "groupFields", label: "分组字段", component: "fieldSelect", multiple: true },
        // 聚合配置目前采用简化的输入文本格式：聚合字段:函数, 如 "sales:SUM,cost:AVG"
        { field: "aggregations", label: "聚合配置", component: "input" },
    ],
    execute(inputs, params) {
        const data = inputs[0];
        if (!data || !data.rows) return { rows: [], columns: [] };

        let groupFields = params.groupFields || [];
        if (typeof groupFields === "string") groupFields = groupFields.split(",").map(s => s.trim()).filter(Boolean);

        // 解析聚合：field:func, field2:func2
        const aggConfigs = [];
        if (params.aggregations && params.aggregations.trim()) {
            params.aggregations.split(",").forEach(pair => {
                const [field, func] = pair.split(":").map(s => s.trim());
                if (field && func) aggConfigs.push({ field, func: func.toUpperCase() });
            });
        }

        if (aggConfigs.length === 0) return data;

        // 分组 & 聚合
        const groups = new Map();

        for (const row of data.rows) {
            // 生成分组 key
            const keyVals = groupFields.map(f => String(row[f]));
            const key = keyVals.join("|||");

            if (!groups.has(key)) {
                const gRow = {};
                groupFields.forEach(f => gRow[f] = row[f]);
                groups.set(key, { base: gRow, aggs: {} });
            }

            const group = groups.get(key);
            for (const { field, func } of aggConfigs) {
                const val = row[field];
                const numVal = Number(val);
                const aggKey = `${field}_${func}`;

                if (!group.aggs[aggKey]) {
                    group.aggs[aggKey] = { sum: 0, count: 0, min: Infinity, max: -Infinity };
                }
                const state = group.aggs[aggKey];

                if (!isNaN(numVal)) {
                    state.sum += numVal;
                    state.count++;
                    state.min = Math.min(state.min, numVal);
                    state.max = Math.max(state.max, numVal);
                } else if (val !== null && val !== undefined && val !== "") {
                    state.count++; // COUNT 统计非空行
                }
            }
        }

        // 构建输出
        const outRows = [];
        const outCols = groupFields.map(f => ({ name: f, type: "string" }));
        
        for (const cfg of aggConfigs) {
            outCols.push({ name: `${cfg.field}_${cfg.func}`, type: "number" });
        }

        for (const { base, aggs } of groups.values()) {
            const newRow = { ...base };
            for (const cfg of aggConfigs) {
                const state = aggs[`${cfg.field}_${cfg.func}`];
                if (!state) continue;

                switch (cfg.func) {
                    case "SUM": newRow[`${cfg.field}_SUM`] = state.sum; break;
                    case "AVG": newRow[`${cfg.field}_AVG`] = state.count > 0 ? state.sum / state.count : null; break;
                    case "COUNT": newRow[`${cfg.field}_COUNT`] = state.count; break;
                    case "MIN": newRow[`${cfg.field}_MIN`] = state.min === Infinity ? null : state.min; break;
                    case "MAX": newRow[`${cfg.field}_MAX`] = state.max === -Infinity ? null : state.max; break;
                }
            }
            outRows.push(newRow);
        }

        return { rows: outRows, columns: outCols };
    },
};
