// FolderOutput 算子：按列分文件输出到目录
export default {
    type: "folderOutput",
    meta: {
        label: "Folder Output",
        icon: "IconFolderDownload",
        color: "#8b5cf6",
        category: "output",
        inputs: 1,
        outputs: 0,
        inputPortType: "table",
        outputPortType: null,
    },
    schema: [
        { field: "outputDir", label: "输出目录", component: "folder" },
        { field: "fileNameField", label: "文件名来源列", component: "fieldSelect", multiple: false },
        { field: "format", label: "格式", component: "select", options: [
            { label: "CSV", value: "csv" },
            { label: "JSON", value: "json" },
        ]},
    ],
    execute(inputs, params, ctx) {
        const data = inputs[0] || { rows: [], columns: [] };
        // 实际落盘逻辑在 DataCleanApp 的 writeOutputs 里统一处理
        return data;
    },
};
