/**
 * 连接适配器抽象类
 * 每个协议实现自己的适配器
 */
class BaseAdapter {
    async create() {
        throw new Error("必须实现 create 方法");
    }
    async destroy(connection) {
        throw new Error("必须实现 destroy 方法");
    }
    async isValid(connection) {
        return true;
    }
}

export default BaseAdapter;