import { DATA_CATEGORY } from "../../constants/DataCategories.js";
import { inferDataCategory } from "../runtime/InferCategory.js";

/**
 * 递归拍平对象
 */
function flattenObject(obj, prefix = "", res = {}) {
    for (const [key, value] of Object.entries(obj)) {
        const newKey = prefix ? `${prefix}.${key}` : key;
        if (value !== null && typeof value === "object" && !Array.isArray(value)) {
            flattenObject(value, newKey, res);
        } else {
            res[newKey] = value;
        }
    }
    return res;
}

export default {
    type: "jsonFlatten",
    meta: {
        label: "JSON Flatten",
        icon: "IconLayers",
        color: "#10b981",
        category: "json",
        inputs: 1,
        outputs: 1,
        inputCategory: DATA_CATEGORY.JSON,
        outputCategory: DATA_CATEGORY.TABLE, 
    },
    schema: [
        { field: "delimiter", label: "路径分隔符", component: "input", defaultValue: "." },
    ],
    execute(inputs, params, ctx) {
        const inputJson = inputs[0]?.json;
        if (!inputJson) throw new Error("未接收到 JSON 数据");

        const dataArray = Array.isArray(inputJson) ? inputJson : [inputJson];
        const delimiter = params.delimiter || ".";
        
        const outRows = dataArray.map(item => {
            if (item && typeof item === "object" && !Array.isArray(item)) {
                const flat = flattenObject(item);
                // 替换分隔符
                if (delimiter !== ".") {
                    const newFlat = {};
                    for (const [k, v] of Object.entries(flat)) {
                        newFlat[k.replace(/\./g, delimiter)] = v;
                    }
                    return newFlat;
                }
                return flat;
            }
            return item;
        });

        if (ctx?.log) ctx.log(`[JSON Flatten] 拍平完成，共 ${outRows.length} 行`);

        const columns = Object.keys(outRows[0] || {}).map(k => ({ name: k, type: "string" }));
        return { dataCategory: DATA_CATEGORY.TABLE, rows: outRows, columns };
    }
};
