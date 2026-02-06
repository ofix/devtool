// 客户端使用示例
import { IntegratedPaymentSystem } from './subscription/IntegratedPaymentSystem.js';

export default class PaymentService {
    constructor() {
        this.paymentSystem = null;
    }
    
    async initialize() {
        const config = {
            payment: {
                // 支付管理器配置
                appleStoreEnabled: true,
                microsoftStoreEnabled: true,
                wechatEnabled: true,
                wechatAppId: 'YOUR_WECHAT_APPID',
                wechatMchId: 'YOUR_WECHAT_MCHID',
                adEnabled: true
            },
            apiBaseUrl: 'https://your-server.com/api',
            refreshInterval: 300000 // 5分钟
        };
        
        this.paymentSystem = await new IntegratedPaymentSystem(config).initialize();
        
        // 设置事件监听
        this.setupEventListeners();
    }
}