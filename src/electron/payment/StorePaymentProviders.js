// payment-system/store-payment-providers.js
import { PaymentProvider, PaymentError, PaymentReceipt } from './PaymentProvider.js';

// 应用商店支付基类
export class StorePaymentProvider extends PaymentProvider {
    constructor(config) {
        super(config);
        this.storeType = config.storeType;
        this._iapModule = null;
    }

    get providerType() {
        return PaymentProvider.PROVIDER_TYPES.STORE;
    }

    getReceiptURL() { }
    setupIAPListeners() { }

    async verifyPayment(receiptData) {
        // 发送收据到服务器进行验证
        const response = await fetch(`${this.config.verificationServer}/verify-receipt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                receipt: receiptData,
                store: this.storeType,
                bundleId: this.config.bundleId
            })
        });

        if (!response.ok) {
            throw new PaymentError('Receipt verification request failed', 'VERIFICATION_REQUEST_FAILED');
        }

        const result = await response.json();

        if (result.status === 0) {
            return new PaymentReceipt({
                transactionId: result.transaction_id,
                productId: result.product_id,
                amount: result.amount,
                currency: result.currency,
                rawData: result
            });
        } else {
            throw new PaymentError(`Receipt invalid: ${result.status}`, 'INVALID_RECEIPT');
        }
    }

    async restorePurchases() {
        if (!this._iapModule) {
            throw new PaymentError('IAP module not initialized', 'MODULE_NOT_INITIALIZED');
        }

        try {
            // 不同商店有不同的恢复购买方法
            const products = await this._iapModule.getProducts([], this.config.productIds);
            const restored = [];

            for (const product of products) {
                if (product.transactionState === 'restored') {
                    restored.push(product);
                }
            }

            return restored;
        } catch (error) {
            throw new PaymentError(`Restore failed: ${error.message}`, 'RESTORE_FAILED');
        }
    }
}

// Apple App Store 实现
export class AppleStorePaymentProvider extends StorePaymentProvider {
    constructor(config) {
        super({ ...config, storeType: 'apple' });
    }

    async initiatePayment(order) {
        await this.validateOrder(order);

        if (!this._iapModule) {
            const { inAppPurchase } = await import('electron');
            this._iapModule = inAppPurchase;
            this.setupIAPListeners();
        }

        return new Promise((resolve, reject) => {
            const transactionHandler = (event, transactions) => {
                transactions.forEach(transaction => {
                    if (transaction.payment.productIdentifier === order.productId) {
                        switch (transaction.transactionState) {
                            case 'purchasing':
                                break;
                            case 'purchased':
                                this._iapModule.off('transactions-updated', transactionHandler);
                                resolve(this.getReceiptURL());
                                break;
                            case 'failed':
                                this._iapModule.off('transactions-updated', transactionHandler);
                                reject(new PaymentError(
                                    transaction.error ? transaction.error.message : 'Purchase failed',
                                    'PURCHASE_FAILED'
                                ));
                                break;
                            case 'restored':
                                // 处理恢复购买
                                break;
                            default:
                                break;
                        }
                    }
                });
            };

            this._iapModule.on('transactions-updated', transactionHandler);
            this._iapModule.purchaseProduct(order.productId, 1);
        });
    }

    getReceiptURL() {
        return this._iapModule.getReceiptURL();
    }

    setupIAPListeners() {
        // 设置通用的交易监听器
        this._iapModule.on('transactions-updated', (event, transactions) => {
            transactions.forEach(transaction => {
                this.emit('transaction-updated', { transaction });
            });
        });
    }
}

// Microsoft Store 实现
export class MicrosoftStorePaymentProvider extends StorePaymentProvider {
    constructor(config) {
        super({ ...config, storeType: 'microsoft' });
    }

    async initiatePayment(order) {
        await this.validateOrder(order);

        // Windows Store 特定的实现
        if (process.platform === 'win32') {
            const { windowsStore } = await import('./windows-store-integration.js');
            this._iapModule = windowsStore;
        }

        // 使用 Windows.ApplicationModel.Store 或 StoreContext API
        return this._iapModule.requestPurchaseAsync(order.productId);
    }

    getReceiptURL() {
        // Microsoft Store 收据处理
        return this._iapModule.getAppReceiptAsync();
    }

    setupIAPListeners() {
        // Microsoft Store 特定监听器
    }
}