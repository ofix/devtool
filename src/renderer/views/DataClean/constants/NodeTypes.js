// 节点类型常量
// 与 engine/operators/index.js 中的算子 type 保持一一对应

export const NODE_TYPES = {
    INPUT: "input",
    OUTPUT: "output",
    MESSAGE: "message",
    FILTER: "filter",
};

// 分类列表，与算子的 meta.category 对应
export const NODE_CATEGORIES = [
    { key: "source", label: "数据源" },
    { key: "prepare", label: "准备" },
    { key: "join", label: "连接" },    // 新增 Join 分类
    { key: "parse", label: "解析" },
    { key: "transform", label: "转换" },
    { key: "develop", label: "开发" },
    { key: "output", label: "输出" },
];
