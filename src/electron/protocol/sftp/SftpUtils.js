/**
 * SFTP 工具函数
 * 从原有的 Sftp 类中抽取的静态工具方法
 */
class SftpUtils {
    /**
     * 将 ls 输出的日期格式转换为标准格式
     */
    static getStandardTime({ month, day, time }) {
        const monthMap = {
            '1月': '01', '2月': '02', '3月': '03', '4月': '04',
            '5月': '05', '6月': '06', '7月': '07', '8月': '08',
            '9月': '09', '10月': '10', '11月': '11', '12月': '12',
            'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
            'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
            'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
        };

        const normalizedMonth = month.trim().toLowerCase();
        const numMonth = monthMap[normalizedMonth] || '01';
        const year = new Date().getFullYear().toString();
        const numDay = String(day).padStart(2, '0');
        const timeParts = time.trim().split(':').slice(0, 2);
        const hour = timeParts[0]?.padStart(2, '0') || '00';
        const minute = timeParts[1]?.padStart(2, '0') || '00';

        return `${year}-${numMonth}-${numDay} ${hour}:${minute}`;
    }

    /**
     * 过滤需要传输的文件（断点续传核心）
     */
    static filterNeedTransferFiles(sourceFiles, targetFiles) {
        const targetMap = new Map();
        targetFiles.forEach((file) => targetMap.set(file.relPath, file.size));

        return sourceFiles.filter((sourceFile) => {
            const targetFile = targetMap.get(sourceFile.relPath);
            if (!targetFile) return true;
            if (sourceFile.size !== targetFile.size) return true;
            return false;
        });
    }

    /**
     * 获取缺失的目录列表
     */
    static getMissingDirs(sourceRoot, sourceDirs, targetRoot, targetDirs) {
        const sourceSet = new Set(sourceDirs.map(d => d.replace(sourceRoot, '')));
        const targetSet = new Set(targetDirs.map(d => d.replace(targetRoot, '')));
        const missing = [];

        for (const dir of sourceSet) {
            if (!targetSet.has(dir)) {
                missing.push(dir);
            }
        }

        return missing;
    }

    /**
     * 移除路径末尾的斜杠
     */
    static removeLastChar(str, char) {
        if (str && str.endsWith(char)) {
            return str.slice(0, -1);
        }
        return str;
    }
}

export default SftpUtils;