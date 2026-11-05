import { DATA_CATEGORY } from "../../constants/DataCategories.js";

function getValueByPath(obj, path) {
    if (!path) return obj;
    const cleanPath = path.trim().replace(/^\./, "");
    const parts = cleanPath.split(/\.|\[|\]/).filter(Boolean);
    let current = obj;
    for (const part of parts) {
        if (current === null || current === undefined) return undefined;
        current = current[part];
    }
    return current;
}

export default {
    type: "jsonExtract",
    meta: {
        label: "JSON Extract",
        icon: "IconExtract",
        color: "#0ea5e9",
        category: "json",
        inputs: 1,
        outputs: 1,
        inputCategory: DATA_CATEGORY.JSON,
        outputCategory: DATA_CATEGORY.TABLE, // 强制降维输出 Table
    },
    schema: [
        { field: "fields", label: "提取字段", component: "jsonFieldPicker" }, // 专属多选树
    ],
    execute(inputs, params, ctx) {
        const inputJson = inputs[0]?.json;
        if (!inputJson) throw new Error("未接收到 JSON 数据");

        const dataArray = Array.isArray(inputJson) ? inputJson : [inputJson];
        const fields = params.fields || []; // 期望格式: [{ path: 'user.name', alias: 'name' }]

        if (fields.length === 0) {
            throw new Error("请至少选择一个提取字段");
        }

        const outRows = dataArray.map(item => {
            const newRow = {};
            for (const f of fields) {
                newRow[f.alias || f.path] = getValueByPath(item, f.path);
            }
            return newRow;
        });

        if (ctx?.log) ctx.log(`[JSON Extract] 提取完成，共 ${outRows.length} 行`);

        const columns = fields.map(f => ({ name: f.alias || f.path, type: "string" }));

        // 构建血缘映射字典
        // 输出的列名是别名（或路径），它的来源就是对应的 JSON Path
        const columnMapping = {};
        for (const f of fields) {
            const outName = f.alias || f.path;
            columnMapping[outName] = f.path;
        }

        return { dataCategory: DATA_CATEGORY.TABLE, rows: outRows, columns, columnMapping };
    }
};