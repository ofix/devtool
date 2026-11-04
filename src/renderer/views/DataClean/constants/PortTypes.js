export const PORT_TYPES = {
    table: { label: "Table", color: "#3b82f6" },
    json: { label: "JSON", color: "#8b5cf6" }, // 新增 JSON 端口
    scalar: { label: "Scalar", color: "#f97316" },
    config: { label: "Config", color: "#22c55e" },
};

export function canConnect(fromType, toType) {
    // 目前只允许同类型互连（table -> table，json -> json）
    if (fromType === toType) return true;
    return false;
}

export function getPortColor(type) {
    return PORT_TYPES[type] ? PORT_TYPES[type].color : "#94a3b8";
}
