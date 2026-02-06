// payment-system/payment-core.js
export class PaymentError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = 'PaymentError';
    }
}

export class PaymentReceipt {
    constructor(data) {
        this.transactionId = data.transactionId;
        this.productId = data.productId;
        this.amount = data.amount;
        this.currency = data.currency;
        this.purchaseDate = data.purchaseDate || new Date();
        this.rawData = data.rawData || {};
    }
}

// 抽象基类
export class PaymentProvider {
    static PROVIDER_TYPES = {
        STORE: 'store',
        WECHAT: 'wechat',
        ALIPAY: 'alipay',
        AD: 'ad'
    };

    constructor(config) {
        if (new.target === PaymentProvider) {
            throw new Error('PaymentProvider is abstract and cannot be instantiated directly');
        }
        this.config = config;
        this._listeners = new Map();
    }

     async initiatePayment(order){}
     async verifyPayment(receiptData){}
     get providerType(){}

    async requestPayment(order) {
        try {
            this.emit('payment-start', { order });
            const receipt = await this.initiatePayment(order);
            const verified = await this.verifyPayment(receipt);
            
            if (verified) {
                this.emit('payment-success', { order, receipt });
                return { success: true, receipt };
            } else {
                throw new PaymentError('Payment verification failed', 'VERIFICATION_FAILED');
            }
        } catch (error) {
            this.emit('payment-error', { order, error });
            throw error;
        }
    }

    on(event, listener) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, []);
        }
        this._listeners.get(event).push(listener);
    }

    off(event, listener) {
        const listeners = this._listeners.get(event);
        if (listeners) {
            const index = listeners.indexOf(listener);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    emit(event, data) {
        const listeners = this._listeners.get(event);
        if (listeners) {
            listeners.forEach(listener => {
                try {
                    listener(data);
                } catch (err) {
                    console.error(`Error in ${event} listener:`, err);
                }
            });
        }
    }

    validateOrder(order) {
        const required = ['id', 'productId', 'amount', 'currency'];
        const missing = required.filter(field => !order[field]);
        
        if (missing.length > 0) {
            throw new PaymentError(
                `Missing required fields: ${missing.join(', ')}`,
                'INVALID_ORDER'
            );
        }
        
        if (order.amount <= 0) {
            throw new PaymentError('Amount must be positive', 'INVALID_AMOUNT');
        }
        
        return true;
    }
}