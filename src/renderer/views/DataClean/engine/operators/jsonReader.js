import { inferDataCategory } from "../runtime/InferCategory.js";

export default {
    type: "jsonReader",
    meta: {
        label: "JSON Reader",
        icon: "IconFile",
        color: "#8b5cf6",
        category: "source",
        inputs: 0,
        outputs: 1,
        inputCategory: null,
        outputCategory: "json",
    },
    schema: [
        { field: "filePath", label: "文件", component: "file", extensions: ["json"] },
    ],
    execute(_inputs, params, ctx) {
        if (!params.filePath) throw new Error("未配置文件路径");

        // 核心修复：从 ctx.rawText 读取
        const text = ctx && ctx.rawText ? ctx.rawText : "";
        if (!text || !text.trim()) {
            if (ctx?.log) ctx.log("[JSON Reader] 尚未读取到文件内容，请重新选择文件", "warn");
            return { rows: [], columns: [], dataCategory: "empty" };
        }

        try {
            const data = JSON.parse(text);
            const rows = Array.isArray(data) ? data : [data];

            const keys = new Set();
            for (const row of rows.slice(0, 100)) {
                if (row && typeof row === "object") Object.keys(row).forEach(k => keys.add(k));
            }
            const columns = Array.from(keys).map(name => ({ name, type: "string" }));

            const category = inferDataCategory(rows);

            if (ctx?.log) ctx.log(`[JSON Reader] 解析成功，共 ${rows.length} 个对象`);

            return {
                rows,
                columns,
                dataCategory: category
            };
        } catch (err) {
            throw new Error(`JSON 解析失败: ${err.message}`);
        }
    },
};
