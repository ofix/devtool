// src/crawler/policy/PolicyInterface.js

/**
 * 策略接口
 * 所有策略插件必须实现这些方法
 */
export default class PolicyInterface {
    /**
     * 策略名称
     */
    getName() {
        throw new Error('Policy must implement getName()');
    }
    
    /**
     * 执行前钩子
     * @param {Object} context - 执行上下文
     */
    async before(context) {
        // 可选实现
    }
    
    /**
     * 执行后钩子
     * @param {Object} context - 执行上下文
     * @param {any} result - 执行结果
     */
    async after(context, result) {
        // 可选实现
    }
    
    /**
     * 错误处理钩子
     * @param {Object} context - 执行上下文
     * @param {Error} error - 错误对象
     */
    async onError(context, error) {
        // 可选实现
    }
    
    /**
     * 是否需要执行
     * @param {Object} context - 执行上下文
     * @returns {boolean}
     */
    shouldExecute(context) {
        return true;
    }
}