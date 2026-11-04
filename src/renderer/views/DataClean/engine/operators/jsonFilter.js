import { DATA_CATEGORY } from "../../constants/DataCategories.js";
import { inferDataCategory } from "../runtime/InferCategory.js";

/**
 * 根据路径获取深层值
 */
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
    type: "jsonFilter",
    meta: {
        label: "JSON Filter",
        icon: "IconFilter",
        color: "#f97316",
        category: "json",
        inputs: 1,
        outputs: 1,
        inputCategory: DATA_CATEGORY.JSON,
        outputCategory: DATA_CATEGORY.JSON, // 保留结构，输出依然是 JSON
    },
    schema: [
        { field: "field", label: "过滤字段", component: "jsonFieldPicker" },
        { field: "operator", label: "操作符", component: "select", options: [
            { label: "等于", value: "=" },
            { label: "不等于", value: "!=" },
            { label: "大于", value: ">" },
            { label: "小于", value: "<" },
            { label: "包含", value: "CONTAINS" },
            { label: "为空", value: "IS NULL" },
        ]},
        { field: "value", label: "值", component: "input" },
    ],
    execute(inputs, params, ctx) {
        const inputJson = inputs[0]?.json;
        if (!inputJson) throw new Error("未接收到 JSON 数据");

        const dataArray = Array.isArray(inputJson) ? inputJson : [inputJson];
        const { field, operator, value } = params;

        if (!field) throw new Error("请配置过滤字段");

        const outRows = [];

        // 核心过滤逻辑
        for (const item of dataArray) {
            const targetVal = getValueByPath(item, field);
            let isMatch = false;

            switch (operator) {
                case "=": isMatch = String(targetVal) === String(value); break;
                case "!=": isMatch = String(targetVal) !== String(value); break;
                case ">": isMatch = Number(targetVal) > Number(value); break;
                case "<": isMatch = Number(targetVal) < Number(value); break;
                case "CONTAINS": isMatch = String(targetVal).includes(String(value)); break;
                case "IS NULL": isMatch = targetVal === null || targetVal === undefined || targetVal === ""; break;
            }

            if (isMatch) {
                outRows.push(item);
            }
        }

        if (ctx?.log) ctx.log(`[JSON Filter] 过滤完成，保留 ${outRows.length} / ${dataArray.length} 条记录`);

        // 由于保留原结构，自动推断（如果原本是数组且无嵌套，可能依然是 JSON 或 Table）
        const category = inferDataCategory(outRows);
        return { 
            dataCategory: category, 
            rows: category === DATA_CATEGORY.TABLE ? outRows : [],
            columns: category === DATA_CATEGORY.TABLE ? Object.keys(outRows[0] || {}).map(k => ({ name: k, type: "string" })) : [],
            json: category === DATA_CATEGORY.JSON ? outRows : null
        };
    }
};
