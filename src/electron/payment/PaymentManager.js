// payment-system/payment-manager.js
import { 
    PaymentProvider, 
    AppleStorePaymentProvider, 
    MicrosoftStorePaymentProvider,
    WechatPaymentProvider,
    AlipayPaymentProvider,
    AdRevenueProvider
} from './PaymentProvider.js';

export class PaymentManager {
    constructor(appConfig) {
        this.providers = new Map();
        this.currentProvider = null;
        this.config = appConfig;
        this.orderHistory = [];
        this.MAX_HISTORY = 100;
    }

    async initialize() {
        // 根据平台和配置初始化支付提供商
        if (process.platform === 'darwin' && this.config.appleStoreEnabled) {
            const appleProvider = new AppleStorePaymentProvider({
                bundleId: this.config.bundleId,
                verificationServer: this.config.verificationServer,
                productIds: this.config.productIds
            });
            this.registerProvider('apple', appleProvider);
        }

        if (process.platform === 'win32' && this.config.microsoftStoreEnabled) {
            const msProvider = new MicrosoftStorePaymentProvider({
                verificationServer: this.config.verificationServer,
                productIds: this.config.productIds
            });
            this.registerProvider('microsoft', msProvider);
        }

        if (this.config.wechatEnabled) {
            const wechatProvider = new WechatPaymentProvider({
                appId: this.config.wechatAppId,
                mchId: this.config.wechatMchId,
                apiKey: this.config.wechatApiKey,
                notifyUrl: `${this.config.serverUrl}/wechat/notify`,
                returnUrl: `${this.config.appUrl}/payment/return`
            });
            this.registerProvider('wechat', wechatProvider);
        }

        if (this.config.adEnabled) {
            const adProvider = new AdRevenueProvider({
                adProvider: this.config.adProvider,
                adUnits: this.config.adUnits
            });
            await adProvider.setupAdUnits();
            this.registerProvider('ad', adProvider);
        }

        // 设置默认提供商
        this.setDefaultProvider();
        
        return this;
    }

    registerProvider(name, provider) {
        this.providers.set(name, provider);
        
        // 设置全局事件监听
        provider.on('payment-success', (data) => {
            this.handlePaymentSuccess(name, data);
        });
        
        provider.on('payment-error', (data) => {
            this.handlePaymentError(name, data);
        });
    }

    getProvider(name) {
        const provider = this.providers.get(name);
        if (!provider) {
            throw new Error(`Payment provider '${name}' not found`);
        }
        return provider;
    }

    setDefaultProvider() {
        // 根据平台和用户偏好设置默认提供商
        if (process.platform === 'darwin' && this.providers.has('apple')) {
            this.currentProvider = this.getProvider('apple');
        } else if (process.platform === 'win32' && this.providers.has('microsoft')) {
            this.currentProvider = this.getProvider('microsoft');
        } else if (this.providers.has('wechat')) {
            this.currentProvider = this.getProvider('wechat');
        } else if (this.providers.has('ad')) {
            this.currentProvider = this.getProvider('ad');
        }
    }

    async processPayment(order, providerName = null) {
        const provider = providerName ? this.getProvider(providerName) : this.currentProvider;
        
        if (!provider) {
            throw new Error('No payment provider available');
        }

        try {
            const result = await provider.requestPayment(order);
            return result;
        } catch (error) {
            console.error('Payment processing failed:', error);
            throw error;
        }
    }

    async showPaymentOptions(order) {
        // 显示支付方式选择界面
        const { BrowserWindow, ipcMain } = await import('electron');
        
        return new Promise((resolve, reject) => {
            const optionsWindow = new BrowserWindow({
                width: 500,
                height: 400,
                modal: true,
                parent: BrowserWindow.getFocusedWindow(),
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false
                }
            });

            // 构建可用提供商列表
            const availableProviders = Array.from(this.providers.entries())
                .filter(([name, provider]) => 
                    name !== 'ad' && // 广告不是支付选项
                    this.isProviderAvailable(name)
                )
                .map(([name, provider]) => ({
                    name,
                    type: provider.providerType,
                    displayName: this.getProviderDisplayName(name)
                }));

            ipcMain.once('payment-option-selected', async (event, selectedProvider) => {
                optionsWindow.close();
                
                try {
                    const result = await this.processPayment(order, selectedProvider);
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            });

            optionsWindow.loadFile('payment-options.html', {
                query: { 
                    providers: JSON.stringify(availableProviders),
                    order: JSON.stringify(order)
                }
            });
        });
    }

    handlePaymentSuccess(providerName, data) {
        // 记录订单历史
        this.orderHistory.unshift({
            provider: providerName,
            order: data.order,
            receipt: data.receipt,
            timestamp: new Date()
        });

        // 保持历史记录数量
        if (this.orderHistory.length > this.MAX_HISTORY) {
            this.orderHistory.pop();
        }

        // 触发全局事件
        this.emit('global-payment-success', {
            provider: providerName,
            ...data
        });

        // 解锁应用功能
        this.unlockFeatures(data.order.productId);
    }

    handlePaymentError(providerName, data) {
        console.error(`Payment error from ${providerName}:`, data.error);
        
        this.emit('global-payment-error', {
            provider: providerName,
            ...data
        });
    }

    isProviderAvailable(providerName) {
        const provider = this.providers.get(providerName);
        if (!provider) return false;

        // 检查提供商特定条件
        switch (providerName) {
            case 'apple':
                return process.platform === 'darwin';
            case 'microsoft':
                return process.platform === 'win32';
            case 'wechat':
            case 'alipay':
                // 检查网络连接等
                return navigator.onLine;
            default:
                return true;
        }
    }

    getProviderDisplayName(name) {
        const names = {
            'apple': 'App Store',
            'microsoft': 'Microsoft Store',
            'wechat': '微信支付',
            'alipay': '支付宝',
            'ad': '广告支持'
        };
        return names[name] || name;
    }

    unlockFeatures(productId) {
        // 根据产品ID解锁相应功能
        console.log(`Unlocking features for product: ${productId}`);
        // 实现具体的功能解锁逻辑
    }

    // 事件代理方法
    on(event, listener) {
        // 将事件代理给所有提供商
        this.providers.forEach(provider => {
            provider.on(event, listener);
        });
    }

    emit(event, data) {
        // 全局事件触发
        // 实际实现中可能需要事件总线
    }
}