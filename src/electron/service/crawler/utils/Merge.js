// src/crawler/utils/merge.js

/**
 * 深度合并工具函数
 * 支持对象、数组的深度合并
 * 
 * @example
 * // 基础深度合并
 * import { mergeDeep } from './merge.js';
 * 
 * const obj1 = { a: 1, b: { c: 2 } };
 * const obj2 = { b: { d: 3 }, e: 4 };
 * 
 * mergeDeep(obj1, obj2);
 * // 结果: { a: 1, b: { c: 2, d: 3 }, e: 4 }
 * 
 * @example
 * // 数组合并策略 - 替换（默认）
 * import { mergeDeep } from './merge.js';
 * 
 * const target = { arr: [1, 2, 3] };
 * const source = { arr: [4, 5] };
 * 
 * mergeDeep(target, source);
 * // 结果: { arr: [4, 5] }
 * 
 * @example
 * // 数组合并策略 - 拼接
 * import { mergeDeep } from './merge.js';
 * 
 * const target = { arr: [1, 2, 3] };
 * const source = { arr: [4, 5] };
 * 
 * mergeDeep(target, source, { arrayMerge: 'concat' });
 * // 结果: { arr: [1, 2, 3, 4, 5] }
 * 
 * @example
 * // 数组合并策略 - 按索引合并
 * import { mergeDeep } from './merge.js';
 * 
 * const target = { arr: [{ id: 1, name: 'a' }, { id: 2, name: 'b' }] };
 * const source = { arr: [{ id: 2, age: 20 }, { id: 3, name: 'c' }] };
 * 
 * mergeDeep(target, source, { arrayMerge: 'merge' });
 * // 结果: { arr: [
 * //   { id: 1, name: 'a' },      // 保留 target[0]
 * //   { id: 2, name: 'b', age: 20 }, // 合并 target[1] 和 source[1]
 * //   { id: 3, name: 'c' }       // 添加 source[2]
 * // ]}
 * 
 * @example
 * // 忽略 undefined 值
 * import { mergeDeep } from './merge.js';
 * 
 * const target = { a: 1, b: 2 };
 * const source = { a: undefined, c: 3 };
 * 
 * mergeDeep(target, source, { ignoreUndefined: true });
 * // 结果: { a: 1, b: 2, c: 3 }  // a 保持原值
 * 
 * @example
 * // 浅合并（只合并第一层）
 * import { mergeShallow } from './merge.js';
 * 
 * const obj1 = { a: 1, b: { c: 2 } };
 * const obj2 = { b: { d: 3 }, e: 4 };
 * 
 * mergeShallow(obj1, obj2);
 * // 结果: { a: 1, b: { d: 3 }, e: 4 }  // b 被完全替换
 * 
 * @example
 * // 合并多个对象
 * import { mergeAll } from './merge.js';
 * 
 * const obj1 = { a: 1 };
 * const obj2 = { b: 2 };
 * const obj3 = { c: 3 };
 * 
 * mergeAll(obj1, obj2, obj3);
 * // 结果: { a: 1, b: 2, c: 3 }
 * 
 * @example
 * // 安全合并（处理循环引用）
 * import { safeMerge } from './merge.js';
 * 
 * const circular = {};
 * circular.self = circular;
 * 
 * safeMerge({ a: 1 }, circular);
 * // 结果: { a: 1, self: [Circular] }
 * 
 * @example
 * // 排除指定字段后合并
 * import { mergeExclude } from './merge.js';
 * 
 * const target = { a: 1, b: 2 };
 * const source = { a: 10, b: 20, c: 30 };
 * 
 * mergeExclude(target, source, ['c']);
 * // 结果: { a: 10, b: 20 }
 * 
 * @example
 * // 只合并指定字段
 * import { mergeInclude } from './merge.js';
 * 
 * const target = { a: 1, b: 2 };
 * const source = { a: 10, b: 20, c: 30 };
 * 
 * mergeInclude(target, source, ['a', 'c']);
 * // 结果: { a: 10, b: 2, c: 30 }
 * 
 * @example
 * // 带转换的合并
 * import { mergeWithTransform } from './merge.js';
 * 
 * const target = { count: 1, data: { value: 10 } };
 * const source = { count: 2, data: { value: 20 } };
 * 
 * mergeWithTransform(target, source, {
 *   count: (target, source) => target + source,  // 累加
 *   data: (target, source) => ({ ...target, ...source })  // 浅合并
 * });
 * // 结果: { count: 3, data: { value: 20 } }
 * 
 * @example
 * // 在策略合并中使用
 * import { mergeDeep } from './merge.js';
 * 
 * // 策略合并（支持继承）
 * const defaultPolicy = {
 *   rate_limit: { qps: 10, algorithm: 'token_bucket' },
 *   proxy: { enabled: false }
 * };
 * 
 * const sitePolicy = {
 *   extends: 'high_concurrency',
 *   rate_limit: { qps: 50 }
 * };
 * 
 * const result = mergeDeep(defaultPolicy, sitePolicy, {
 *   arrayMerge: 'merge',
 *   ignoreUndefined: true
 * });
 * // 结果: {
 * //   rate_limit: { qps: 50, algorithm: 'token_bucket' },
 * //   proxy: { enabled: false }
 * // }
 * 
 * @example
 * // 创建带缓存的合并器（适合多次合并相同对象）
 * import { createMerger } from './merge.js';
 * 
 * const merge = createMerger();
 * const base = { a: 1, b: { c: 2 } };
 * 
 * merge(base, { b: { d: 3 } });  // 第一次合并，计算并缓存
 * merge(base, { b: { d: 3 } });  // 第二次合并，直接返回缓存结果
 */

/**
 * 深度合并两个对象
 * @param {Object} target - 目标对象
 * @param {Object} source - 源对象
 * @param {Object} options - 合并选项
 * @param {string} [options.arrayMerge='replace'] - 数组合并策略: 'replace', 'concat', 'merge'
 * @param {boolean} [options.ignoreUndefined=true] - 是否忽略 undefined 值
 * @param {number} [options.maxDepth=10] - 最大深度
 * @returns {Object} 合并后的对象
 * 
 * @example
 * // 基本用法
 * mergeDeep({ a: 1 }, { a: 2, b: 3 });  // { a: 2, b: 3 }
 * 
 * @example
 * // 嵌套对象深度合并
 * mergeDeep({ user: { name: 'John', age: 30 } }, { user: { age: 31, city: 'NYC' } });
 * // { user: { name: 'John', age: 31, city: 'NYC' } }
 */
export function mergeDeep(target, source, options = {}) {
    if (!source) return target;
    if (!target) return source;

    const result = { ...target };
    const {
        arrayMerge = 'replace',
        ignoreUndefined = true,
        maxDepth = 10,
        currentDepth = 0
    } = options;

    if (currentDepth > maxDepth) {
        return result;
    }

    for (const [key, sourceValue] of Object.entries(source)) {
        if (ignoreUndefined && sourceValue === undefined) {
            continue;
        }

        const targetValue = target[key];

        if (Array.isArray(sourceValue)) {
            if (Array.isArray(targetValue)) {
                switch (arrayMerge) {
                    case 'concat':
                        result[key] = [...targetValue, ...sourceValue];
                        break;
                    case 'merge':
                        const maxLength = Math.max(targetValue.length, sourceValue.length);
                        const mergedArray = [];
                        for (let i = 0; i < maxLength; i++) {
                            if (i < sourceValue.length && i < targetValue.length) {
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
                    default:
                        result[key] = sourceValue;
                }
            } else {
                result[key] = sourceValue;
            }
            continue;
        }

        if (isObject(sourceValue) && isObject(targetValue)) {
            result[key] = mergeDeep(targetValue, sourceValue, {
                ...options,
                currentDepth: currentDepth + 1
            });
            continue;
        }

        result[key] = sourceValue;
    }

    return result;
}

/**
 * 浅合并（只合并第一层）
 * @param {Object} target - 目标对象
 * @param {Object} source - 源对象
 * @returns {Object} 合并后的对象
 * 
 * @example
 * // 浅合并示例
 * mergeShallow({ a: 1, b: { c: 2 } }, { b: { d: 3 }, e: 4 });
 * // 结果: { a: 1, b: { d: 3 }, e: 4 }  // b 被完全替换
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
 * 
 * @example
 * // 合并多个对象
 * mergeAll({ a: 1 }, { b: 2 }, { a: 3, c: 4 });
 * // 结果: { a: 3, b: 2, c: 4 }
 * 
 * @example
 * // 在配置合并中使用
 * const defaultConfig = { timeout: 30000, retry: 3 };
 * const siteConfig = { timeout: 60000 };
 * const runtimeConfig = { debug: true };
 * 
 * mergeAll(defaultConfig, siteConfig, runtimeConfig);
 * // 结果: { timeout: 60000, retry: 3, debug: true }
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
 * 
 * @example
 * // 创建带缓存的合并器
 * const merge = createMerger();
 * const base = { a: 1, b: { c: 2 } };
 * 
 * const result1 = merge(base, { b: { d: 3 } });  // 第一次合并，计算并缓存
 * const result2 = merge(base, { b: { d: 3 } });  // 第二次合并，直接返回缓存
 * 
 * console.log(result1 === result2);  // true
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
 * 
 * @example
 * // 处理循环引用
 * const circular = {};
 * circular.self = circular;
 * 
 * safeMerge({ a: 1 }, circular);
 * // 结果: { a: 1, self: [Circular] }
 * 
 * @example
 * // 处理嵌套循环引用
 * const obj = { a: { b: {} } };
 * obj.a.b.c = obj;
 * 
 * safeMerge({ x: 1 }, obj);
 * // 结果: { x: 1, a: { b: { c: [Circular] } } }
 */
export function safeMerge(target, source) {
    const seen = new WeakMap();
    
    function merge(target, source) {
        if (!source) return target;
        if (!target) return source;
        
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
 * 
 * @example
 * // 排除敏感字段
 * const target = { id: 1, name: 'John', password: '123' };
 * const source = { name: 'Jane', email: 'jane@example.com', password: '456' };
 * 
 * mergeExclude(target, source, ['password']);
 * // 结果: { id: 1, name: 'Jane', email: 'jane@example.com' }
 * 
 * @example
 * // 在配置合并中使用
 * const base = { apiKey: 'xxx', timeout: 30000 };
 * const user = { apiKey: 'yyy', debug: true };
 * 
 * mergeExclude(base, user, ['apiKey']);  // 保留原 apiKey
 * // 结果: { apiKey: 'xxx', timeout: 30000, debug: true }
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
 * 
 * @example
 * // 只合并特定字段
 * const target = { id: 1, name: 'John', age: 30 };
 * const source = { name: 'Jane', age: 31, email: 'jane@example.com' };
 * 
 * mergeInclude(target, source, ['name', 'email']);
 * // 结果: { id: 1, name: 'Jane', age: 30, email: 'jane@example.com' }
 * 
 * @example
 * // 在配置合并中使用
 * const base = { timeout: 30000, retry: 3, debug: false };
 * const runtime = { timeout: 60000, debug: true, logLevel: 'info' };
 * 
 * mergeInclude(base, runtime, ['timeout', 'debug']);
 * // 结果: { timeout: 60000, retry: 3, debug: true }
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
 * 
 * @example
 * // 自定义转换函数
 * const target = { count: 1, data: { value: 10 } };
 * const source = { count: 2, data: { value: 20, extra: 30 } };
 * 
 * mergeWithTransform(target, source, {
 *   count: (target, source) => target + source,  // 累加
 *   data: (target, source) => ({ ...target, ...source })  // 浅合并
 * });
 * // 结果: { count: 3, data: { value: 20, extra: 30 } }
 * 
 * @example
 * // 在配置合并中使用
 * const base = { rate: 10, timeout: 30000 };
 * const override = { rate: 20, timeout: 60000 };
 * 
 * mergeWithTransform(base, override, {
 *   rate: (t, s) => Math.min(t, s),  // 取最小值
 *   timeout: (t, s) => Math.max(t, s)  // 取最大值
 * });
 * // 结果: { rate: 10, timeout: 60000 }
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
 * @example
 * // 导入所有方法
 * import merge from './merge.js';
 * 
 * merge.deep({ a: 1 }, { b: 2 });  // { a: 1, b: 2 }
 * merge.shallow({ a: { b: 1 } }, { a: { c: 2 } });  // { a: { c: 2 } }
 * merge.all({ a: 1 }, { b: 2 }, { c: 3 });  // { a: 1, b: 2, c: 3 }
 * 
 * @example
 * // 在策略管理中使用
 * import merge from './merge.js';
 * 
 * const defaultPolicy = { rate_limit: { qps: 10 } };
 * const sitePolicy = { rate_limit: { burst: 20 } };
 * 
 * const finalPolicy = merge.deep(defaultPolicy, sitePolicy);
 * // 结果: { rate_limit: { qps: 10, burst: 20 } }
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