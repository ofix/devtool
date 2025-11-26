class EncryptService {
    constructor() {
        // 常量定义
        this.DT_RANDOM = "~JwMj&CNnu5ac1oXh=ryPHvVkQEeisApdB+TD8fl;RLx(FWSKIzYb6mG3ZqtO/Ug";
        this.DT_PREFIX_1 = "7_4*!2)";
        this.DT_PREFIX_2 = "9%,";
        this.DT_SIGNATURE = "%@M_c#1$8";
        
        this.DT_TABLE = [
            0,8,1,2,9,16,24,17,
            10,3,4,11,18,25,32,40,
            33,26,19,12,5,6,13,20,
            27,34,41,48,56,49,42,35,
            28,21,14,7,15,22,29,36,
            43,50,57,58,51,44,37,30,
            23,31,38,45,52,59,60,53,
            46,39,47,54,61,62,55,63
        ];
        
        // 预计算映射表
        this.RANDOM_MAP = new Map();
        for (let i = 0; i < this.DT_RANDOM.length; i++) {
            this.RANDOM_MAP.set(this.DT_RANDOM[i], i);
        }
        
        // 预计算反向表
        this.TABLE_REVERSE = new Array(64);
        for (let i = 0; i < 64; i++) {
            this.TABLE_REVERSE[this.DT_TABLE[i]] = i;
        }
    }
    
    // 生成范围内的随机整数
    randInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    
    // 生成签名
    createSignature() {
        const sig = new Array(40);
        
        // 填充随机字符
        for (let i = 0; i < 31; i++) {
            sig[i] = this.DT_RANDOM[this.randInt(0, this.DT_RANDOM.length - 1)];
        }
        
        // 生成随机序列
        const seq = new Array(9);
        const used = new Array(31).fill(false);
        
        for (let i = 0; i < 9; i++) {
            let idx;
            do {
                idx = this.randInt(0, 30);
            } while (used[idx]);
            
            used[idx] = true;
            seq[i] = idx;
            sig[idx] = this.DT_SIGNATURE[i];
        }
        
        // 添加尾部
        for (let i = 0; i < 9; i++) {
            sig[31 + i] = this.DT_RANDOM[seq[i]];
        }
        
        return sig.join('');
    }
    
    // 验证签名
    verifySignature(data) {
        if (data.length < 40) return false;
        
        for (let i = 31, j = 0; i < 40; i++, j++) {
            const char = data[i];
            const index = this.RANDOM_MAP.get(char);
            
            if (index === undefined || data[index] !== this.DT_SIGNATURE[j]) {
                return false;
            }
        }
        return true;
    }
    
    // 加密函数
    encrypt(data) {
        const sig = this.createSignature();
        let result = sig;
        let idx = 0;
        
        // 遍历字符串的每个字符（JavaScript自动处理UTF-8）
        for (let i = 0; i < data.length; i++) {
            // 获取字符的Unicode码点
            const codePoint = data.codePointAt(i);
            
            // 处理代理对（surrogate pairs）
            if (codePoint > 0xFFFF) {
                i++; // 跳过代理对的高位
            }
            
            let encryptedCode = codePoint;
            encryptedCode ^= 64;
            encryptedCode ^= sig.charCodeAt(idx % sig.length) & 0x3F;
            
            if (encryptedCode <= 0x3F) {
                result += this.DT_RANDOM[this.DT_TABLE[encryptedCode]];
            } else if (encryptedCode <= 0xFFF) {
                result += this.DT_PREFIX_1[idx % 7];
                result += this.DT_RANDOM[this.DT_TABLE[encryptedCode & 0x3F]];
                result += this.DT_RANDOM[this.DT_TABLE[(encryptedCode >> 6) & 0x3F]];
            } else {
                result += this.DT_PREFIX_2[idx % 3];
                result += this.DT_RANDOM[this.DT_TABLE[encryptedCode & 0x3F]];
                result += this.DT_RANDOM[this.DT_TABLE[(encryptedCode >> 6) & 0x3F]];
                result += this.DT_RANDOM[this.DT_TABLE[(encryptedCode >> 12) & 0x3F]];
            }
            idx++;
        }
        
        return result;
    }
    
    // 解密函数
    decrypt(data) {
        if (!this.verifySignature(data)) {
            return "";
        }
        
        let result = "";
        const sig = data.substring(0, 40);
        let offset = 40;
        let idx = 0;
        
        while (offset < data.length) {
            const c = data[offset++];
            let code = 0;
            
            if (this.DT_PREFIX_1.includes(c)) {
                if (offset + 1 >= data.length) break;
                const d1 = this.TABLE_REVERSE[this.RANDOM_MAP.get(data[offset++])];
                const d2 = this.TABLE_REVERSE[this.RANDOM_MAP.get(data[offset++])];
                code = (d2 << 6) | d1;
            } else if (this.DT_PREFIX_2.includes(c)) {
                if (offset + 2 >= data.length) break;
                const s1 = this.TABLE_REVERSE[this.RANDOM_MAP.get(data[offset++])];
                const s2 = this.TABLE_REVERSE[this.RANDOM_MAP.get(data[offset++])];
                const s3 = this.TABLE_REVERSE[this.RANDOM_MAP.get(data[offset++])];
                code = (s3 << 12) | (s2 << 6) | s1;
            } else {
                const index = this.RANDOM_MAP.get(c);
                if (index === undefined) {
                    // 无效字符，跳过
                    continue;
                }
                code = this.TABLE_REVERSE[index];
            }
            
            code ^= sig.charCodeAt(idx % sig.length) & 0x3F;
            code ^= 64;
            
            // 使用String.fromCodePoint正确处理所有Unicode字符
            result += String.fromCodePoint(code);
            idx++;
        }
        
        return result;
    }
}

export default EncryptService;