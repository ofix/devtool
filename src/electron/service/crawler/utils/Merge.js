// src/crawler/utils/merge.js

/**
 * 深度合并工具函数
 * 支持对象、数组的深度合并
 */

/**
 * 深度合并两个对象
 * @param {Object} target - 目标对象
 * @param {Object} source - 源对象
 * @param {Object} options - 合并选项
 * @returns {Object} 合并后的对象
 */
export function mergeDeep(target, source, options = {}) {
    if (!source) return target;
    if (!target) return source;

    const result = { ...target };
    const {
        arrayMerge = 'replace',  // 'replace', 'concat', 'merge'
        ignoreUndefined = true,   // 是否忽略 undefined 值
        maxDepth = 10,            // 最大深度
        currentDepth = 0
    } = options;

    // 防止循环引用导致的栈溢出
    if (currentDepth > maxDepth) {
        return result;
    }

    for (const [key, sourceValue] of Object.entries(source)) {
        // 忽略 undefined 值
        if (ignoreUndefined && sourceValue === undefined) {
            continue;
        }

        const targetValue = target[key];

        // 处理数组
        if (Array.isArray(sourceValue)) {
            if (Array.isArray(targetValue)) {
                switch (arrayMerge) {
                    case 'concat':
                        result[key] = [...targetValue, ...sourceValue];
                        break;
                    case 'merge':
                        // 按索引合并数组
                        const maxLength = Math.max(targetValue.length, sourceValue.length);
                        const mergedArray = [];
                        for (let i = 0; i < maxLength; i++) {
                            if (i < sourceValue.length && i < targetValue.length) {
                                // 递归合并数组元素
                                if (isObject(sourceValue[i]) && isObject(targetValue[i])) {
                                    mergedArray[i] = mergeDeep(targetValue[i], sourceValue[i], {
                                        ...options,
                                        currentDepth: currentDepth + 1
                                    });
                                } else {
                                    mergedArray[i] = sourceValue[i];
                                }
                            } else if (i < sourceValue.length) {
                                mergedArray[i] = sourceValue[i];
                            } else {
                                mergedArray[i] = targetValue[i];
                            }
                        }
                        result[key] = mergedArray;
                        break;
                    default: // 'replace'
                        result[key] = sourceValue;
                }
            } else {
                result[key] = sourceValue;
            }
            continue;
        }

        // 处理对象
        if (isObject(sourceValue) && isObject(targetValue)) {
            result[key] = mergeDeep(targetValue, sourceValue, {
                ...options,
                currentDepth: currentDepth + 1
            });
            continue;
        }

        // 其他类型直接覆盖
        result[key] = sourceValue;
    }

    return result;
}

/**
 * 浅合并（只合并第一层）
 * @param {Object} target - 目标对象
 * @param {Object} source - 源对象
 * @returns {Object} 合并后的对象
 */
export function mergeShallow(target, source) {
    if (!source) return target;
    if (!target) return source;

    return {
        ...target,
        ...source
    };
}

/**
 * 合并多个对象（从左到右，后面的覆盖前面的）
 * @param {...Object} objects - 要合并的对象
 * @returns {Object} 合并后的对象
 */
export function mergeAll(...objects) {
    return objects.reduce((result, obj) => {
        return mergeDeep(result, obj);
    }, {});
}

/**
 * 判断是否为对象（排除 null 和数组）
 * @param {*} value - 要判断的值
 * @returns {boolean}
 */
function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 带缓存的深度合并（适合多次合并相同对象）
 * @returns {Function} 带缓存的合并函数
 */
export function createMerger() {
    const cache = new Map();

    return function(target, source, options = {}) {
        const cacheKey = JSON.stringify({ target, source, options });
        
        if (cache.has(cacheKey)) {
            return cache.get(cacheKey);
        }
        
        const result = mergeDeep(target, source, options);
        cache.set(cacheKey, result);
        
        return result;
    };
}

/**
 * 安全合并（自动处理循环引用）
 * @param {Object} target - 目标对象
 * @param {Object} source - 源对象
 * @returns {Object} 合并后的对象
 */
export function safeMerge(target, source) {
    const seen = new WeakMap();
    
    function merge(target, source) {
        if (!source) return target;
        if (!target) return source;
        
        // 检测循环引用
        if (seen.has(source)) {
            return target;
        }
        seen.set(source, true);
        
        const result = { ...target };
        
        for (const [key, sourceValue] of Object.entries(source)) {
            const targetValue = target[key];
            
            if (isObject(sourceValue) && isObject(targetValue)) {
                result[key] = merge(targetValue, sourceValue);
            } else {
                result[key] = sourceValue;
            }
        }
        
        return result;
    }
    
    return merge(target, source);
}

/**
 * 排除指定字段后合并
 * @param {Object} target - 目标对象
 * @param {Object} source - 源对象
 * @param {string[]} excludeKeys - 要排除的字段
 * @returns {Object} 合并后的对象
 */
export function mergeExclude(target, source, excludeKeys = []) {
    if (!source) return target;
    if (!target) return source;
    
    const filteredSource = { ...source };
    for (const key of excludeKeys) {
        delete filteredSource[key];
    }
    
    return mergeDeep(target, filteredSource);
}

/**
 * 只合并指定字段
 * @param {Object} target - 目标对象
 * @param {Object} source - 源对象
 * @param {string[]} includeKeys - 要包含的字段
 * @returns {Object} 合并后的对象
 */
export function mergeInclude(target, source, includeKeys = []) {
    if (!source) return target;
    if (!target) return source;
    
    const filteredSource = {};
    for (const key of includeKeys) {
        if (key in source) {
            filteredSource[key] = source[key];
        }
    }
    
    return mergeDeep(target, filteredSource);
}

/**
 * 合并并转换值
 * @param {Object} target - 目标对象
 * @param {Object} source - 源对象
 * @param {Object} transformers - 转换函数映射
 * @returns {Object} 合并后的对象
 */
export function mergeWithTransform(target, source, transformers = {}) {
    if (!source) return target;
    if (!target) return source;
    
    const result = { ...target };
    
    for (const [key, sourceValue] of Object.entries(source)) {
        const targetValue = target[key];
        
        if (transformers[key]) {
            result[key] = transformers[key](targetValue, sourceValue);
        } else if (isObject(sourceValue) && isObject(targetValue)) {
            result[key] = mergeWithTransform(targetValue, sourceValue, transformers);
        } else {
            result[key] = sourceValue;
        }
    }
    
    return result;
}

/**
 * 默认导出
 */
export default {
    deep: mergeDeep,
    shallow: mergeShallow,
    all: mergeAll,
    safe: safeMerge,
    exclude: mergeExclude,
    include: mergeInclude,
    withTransform: mergeWithTransform,
    createMerger
};