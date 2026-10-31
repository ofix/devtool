// 增加：读取完成后的真实日志打印
import { inferColumns } from "../runtime/Dataset.js";

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
        { field: "format", label: "格式", component: "select", options: [{ label: "CSV", value: "csv" }, { label: "JSON", value: "json" }] },
    ],
    execute(_inputs, params, ctx) {
        const text = ctx && ctx.rawText ? ctx.rawText : "";
        if (ctx && typeof ctx.log === "function") {
            ctx.log(`开始解析 ${params.format.toUpperCase()} 数据...`);
        }
        const result = params.format === "json" ? parseJson(text) : parseCsv(text);
        if (ctx && typeof ctx.log === "function") {
            ctx.log(`解析完成，共 ${result.rows.length} 行数据。`);
        }
        return result;
    },
};
