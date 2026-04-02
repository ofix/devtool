// 文件结构常量
export const RECORD_SIZE = 48;        // K线记录大小（字节）
export const INDEX_SIZE = 12;         // 索引记录大小（字节）
export const HEADER_SIZE = 256;       // 文件头大小（字节）

// 魔法数字
export const MAGIC_NUMBER = 0x4B4C494E;  // 'KLIN'
export const VERSION = 0x00010001;       // v1.1

// 性能配置
export const BATCH_SIZE = 100;           // 批量写入大小
export const FLUSH_INTERVAL = 5000;      // 刷新间隔（毫秒）
export const MAX_CACHE_SIZE = 10000;     // 最大缓存数量
export const WAL_CLEAR_THRESHOLD = 1000; // WAL清理阈值

// 索引批量读取大小
export const INDEX_BATCH_SIZE = 1000;