// FolderInput 算子：递归读取文件夹，per-file 或 merged 模式
export default {
    type: "folderInput",
    meta: {
        label: "Folder Input",
        icon: "IconFolderOpened",
        color: "#3b82f6",
        category: "source",
        inputs: 0,
        outputs: 1,
        inputPortType: null,
        outputPortType: "table",
    },
    schema: [
        { field: "folderPath", label: "文件夹", component: "folder" },
        { field: "extensions", label: "扩展名", component: "input", defaultValue: "csv,json" },
        { field: "mode", label: "模式", component: "select", options: [
            { label: "按文件输出", value: "per-file" },
            { label: "合并输出", value: "merged" },
        ]},
        { field: "format", label: "格式", component: "select", options: [
            { label: "CSV", value: "csv" },
            { label: "JSON", value: "json" },
        ]},
    ],
    // 异步执行（逐文件上报进度）
    async execute(_inputs, params, ctx) {
        const { folderPath, extensions = "csv,json", mode = "merged", format = "csv" } = params;
        if (!folderPath) return { rows: [], columns: [] };

        const exts = extensions.split(",").map(e => "." + e.trim().toLowerCase());
        const files = await window.api.dataClean.fs.listFiles(folderPath, exts);
        if (files.length === 0) return { rows: [], columns: [] };

        const { parseCsv, parseJson } = await import("./input.js");

        // 逐文件读取并解析
        const allRows = [];
        let baseColumns = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (ctx.onProgress) ctx.onProgress(i + 1, files.length, file);

            try {
                const text = await window.api.dataClean.fs.readFile(file);
                const ext = file.toLowerCase().endsWith(".json") ? "json" : "csv";
                const parsed = ext === "json" ? parseJson(text) : parseCsv(text);

                if (baseColumns.length === 0) baseColumns = parsed.columns;

                const fileName = file.split(/[/\\]/).pop();
                for (const row of parsed.rows) {
                    if (mode === "merged") {
                        allRows.push({ ...row, _source_file: fileName });
                    } else {
                        allRows.push({ ...row, _source_file: fileName });
                    }
                }
            } catch (err) {
                if (ctx.log) ctx.log(`[FolderInput] 读取失败 ${file}: ${err.message}`, "warn");
            }
        }

        // per-file 模式下，输出里带 _source_file，下游可以用 FolderOutput 按文件拆分
        const outCols = [...baseColumns];
        if (!outCols.some(c => c.name === "_source_file")) {
            outCols.push({ name: "_source_file", type: "string" });
        }

        return { rows: allRows, columns: outCols };
    },
};
