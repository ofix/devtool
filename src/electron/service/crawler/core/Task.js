export default class Task {
    constructor(options = {}) {
        // 唯一标识
        this.id = options.id || this._generateId(options);
        
        // 核心信息
        this.siteName = options.siteName;
        this.type = options.type;           // list | page | download
        this.model = options.model;         // pagination | standard | video
        this.url = options.url;
        
        // 步骤引用（用于查找配置）
        this.stepRef = options.stepRef;
        
        // 状态
        this.status = options.status || 'pending';
        this.retryCount = options.retryCount || 0;
        this.maxRetries = options.maxRetries || 3;
        
        // 时间
        this.createdAt = options.createdAt || Date.now();
        this.startedAt = null;
        this.completedAt = null;
        
        // 结果
        this.result = null;
        this.error = null;
    }
    
    _generateId(options) {
        const siteName = options.siteName;
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 6);
        return `${siteName}_${timestamp}_${random}`;
    }
    
    /**
     * 创建子任务 - 只需要 URL 和步骤引用
     */
    createSubTask(url, stepRef) {
        return new Task({
            siteName: this.siteName,
            type: 'page',           // 默认是 page
            model: 'standard',      // 默认模型
            url: url,
            stepRef: stepRef,
            maxRetries: this.maxRetries
        });
    }
    
    start() {
        this.status = 'running';
        this.startedAt = Date.now();
        return this;
    }
    
    complete(result) {
        this.status = 'completed';
        this.completedAt = Date.now();
        this.result = result;
        return this;
    }
    
    fail(error) {
        this.status = 'failed';
        this.completedAt = Date.now();
        this.error = error;
        return this;
    }
    
    toString() {
        return `Task[${this.id}] ${this.type}.${this.model} ${this.url}`;
    }
}