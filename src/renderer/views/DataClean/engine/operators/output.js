// Output 算子：单文件导出（批次 1 只做透传，落盘由上层调用 IPC）

export default {
    type: "output",
    meta: {
        label: "Output",
        icon: "IconDownload",
        color: "#8b5cf6",
        category: "output",
        inputs: 1,
        outputs: 0,
        inputPortType: "table",
        outputPortType: null,
    },
    schema: [
        { field: "filePath", label: "输出文件", component: "saveFile" },
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
    execute(inputs, _params) {
        return inputs[0] || { rows: [], columns: [] };
    },
};
