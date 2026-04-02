// 预计算CRC32表
const crcTable = new Uint32Array(256);

for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
        crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    crcTable[i] = crc >>> 0;
}

/**
 * 计算CRC32校验值
 * @param {Buffer|Uint8Array|string} data - 输入数据
 * @returns {number} CRC32值
 */
export function crc32(data) {
    let crc = 0xFFFFFFFF;
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    
    for (let i = 0; i < buf.length; i++) {
        crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
    }
    
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * 验证CRC32
 * @param {Buffer} data - 数据
 * @param {number} expectedCrc - 期望的CRC值
 * @returns {boolean} 是否匹配
 */
export function verifyCrc32(data, expectedCrc) {
    return crc32(data) === expectedCrc;
}