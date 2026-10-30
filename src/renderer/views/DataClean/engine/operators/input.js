// Input 算子：CSV / JSON 导入 + 类型推断
// 实际文件读取通过 window.api.dataClean.fs.readFile 完成，
// execute 接收 ctx.rawText（已读取的文件内容）

import { inferColumns } from "../runtime/Dataset.js";

/**
 * 简单 CSV 解析（支持双引号转义，不支持跨行字段）
 * @param {string} text
 * @returns {{ rows: object[], columns: object[] }}
 */
export function parseCsv(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return { rows: [], columns: [] };

    const header = splitCsvLine(lines[0]);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const cells = splitCsvLine(lines[i]);
        const row = {};
        for (let c = 0; c < header.length; c++) {
            row[header[c]] = cells[c] !== undefined ? cells[c] : "";
        }
        rows.push(row);
    }
    return { rows, columns: inferColumns(rows, header) };
}

/**
 * 解析一行 CSV（处理双引号包裹与转义）
 * @param {string} line
 * @returns {string[]}
 */
function splitCsvLine(line) {
    const cells = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (line[i + 1] === '"') {
                    cur += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                cur += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ",") {
                cells.push(cur);
                cur = "";
            } else {
                cur += ch;
            }
        }
    }
    cells.push(cur);
    return cells;
}

/**
 * 简单 JSON 解析：支持对象数组
 * @param {string} text
 * @returns {{ rows: object[], columns: object[] }}
 */
export function parseJson(text) {
    const data = JSON.parse(text);
    const rows = Array.isArray(data) ? data : [data];
    const keys = new Set();
    for (const row of rows.slice(0, 100)) {
        if (row && typeof row === "object") {
            Object.keys(row).forEach((k) => keys.add(k));
        }
    }
    return { rows, columns: inferColumns(rows, Array.from(keys)) };
}

export default {
    type: "input",
    meta: {
        label: "Input",
        icon: "IconFolder",
        color: "#3b82f6",
        category: "source",
        inputs: 0,
        outputs: 1,
        inputPortType: null,
        outputPortType: "table",
    },
    schema: [
        { field: "filePath", label: "文件", component: "file" },
        {
            field: "format",
            label: "格式",
            component: "select",
            options: [
                { label: "CSV", value: "csv" },
                { label: "JSON", value: "json" },
            ],
        },
    ],
    /**
     * 执行入口
     * @param {object[]} inputs 上游数据（Input 无输入）
     * @param {object} params
     * @param {object} ctx 运行上下文，包含 rawText（已读取的文件内容）
     * @returns {{ rows: object[], columns: object[] }}
     */
    execute(_inputs, params, ctx) {
        const text = ctx && ctx.rawText ? ctx.rawText : "";
        if (params.format === "json") return parseJson(text);
        return parseCsv(text);
    },
};
