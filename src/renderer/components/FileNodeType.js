/**
 *@todo 数值型文件节点枚举（性能优化版）
 */
export const FileNodeType = Object.freeze({
    DIRECTORY: 1 << 0, // 1
    FILE: 1 << 1,      // 2
    SYMLINK: 1 << 2,   // 4
    COLLAPSE_DIR: 1 << 3,     // 8

    // 反向映射：数值 -> 名称（用于序列化/显示）
    getTypeName: function (type) {
        switch (type) {
            case this.DIRECTORY: return 'directory';
            case this.FILE: return 'file';
            case this.SYMLINK: return 'symlink';
            case this.COLLAPSE_DIR: return 'collapse';
            default: return 'unknown';
        }
    },

    // 验证是否为有效枚举值
    isValid: function (type) {
        return [this.DIRECTORY, this.FILE, this.SYMLINK, this.COLLAPSE_DIR].includes(type);
    }
});

/**
 *@todo 排序字段枚举（标准化排序维度）
 */
export const SortField = Object.freeze({
    NAME: 1 << 0,     // 按名称排序
    SIZE: 1 << 1,     // 按大小排序
    DATE: 1 << 2,     // 按日期排序
    TYPE: 1 << 3      // 按类型排序（默认）
});

/**
 *@todo 排序方向枚举
 */
export const SortDirection = Object.freeze({
    ASC: 1 << 0,       // 升序（默认）
    DESC: 1 << 1    // 降序
});