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
    type: "jsonReader",
    meta: { label: "JSON Reader", icon: "IconDocument", color: "#f59e0b", category: "source", inputs: 0, outputs: 1, inputPortType: null, outputPortType: "table" },
    schema: [
        { field: "filePath", label: "文件", component: "file", extensions: ["json"] },
        { field: "rootPath", label: "根节点", component: "input" }
    ],
    execute(_inputs, params, ctx) {
        return parseJson(ctx.rawText || "");
    }
};