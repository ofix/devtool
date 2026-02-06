// payment-system/thirdparty-payment-providers.js
import { PaymentProvider, PaymentError, PaymentReceipt } from './PaymentProvider.js';

// 第三方支付基类
export class ThirdPartyPaymentProvider extends PaymentProvider {
    constructor(config) {
        super(config);
        this.apiKey = config.apiKey;
        this.apiSecret = config.apiSecret;
        this.notifyUrl = config.notifyUrl;
        this.returnUrl = config.returnUrl;
    }

    async createOrder(order) { }
    async queryOrder(orderId) { }
    async closeOrder(orderId) { }
    async refund(orderId, amount) { }

    async initiatePayment(order) {
        await this.validateOrder(order);

        const orderData = await this.createOrder({
            out_trade_no: order.id,
            total_amount: order.amount,
            subject: order.description || `Purchase: ${order.productId}`,
            body: order.details || '',
            notify_url: this.notifyUrl,
            return_url: this.returnUrl
        });

        return orderData;
    }

    async verifyPayment(receiptData) {
        // 第三方支付验证通常通过回调或查询订单状态
        if (receiptData.trade_status === 'TRADE_SUCCESS') {
            return new PaymentReceipt({
                transactionId: receiptData.trade_no,
                productId: receiptData.out_trade_no,
                amount: receiptData.total_amount,
                currency: receiptData.currency || 'CNY',
                rawData: receiptData
            });
        }

        return null;
    }

    generateSignature(params) {
        // 生成支付签名（安全考虑，实际应在后端进行）
        const sortedParams = Object.keys(params)
            .filter(key => params[key] && key !== 'sign')
            .sort()
            .map(key => `${key}=${params[key]}`)
            .join('&');

        return this.hash(sortedParams + this.apiSecret);
    }

    hash(str) {
        // 使用合适的哈希算法
        // 注意：实际项目中应在后端处理签名
        return btoa(str);
    }
}

// 微信支付实现
export class WechatPaymentProvider extends ThirdPartyPaymentProvider {
    constructor(config) {
        super({ ...config, gateway: 'https://api.mch.weixin.qq.com' });
        this.mchId = config.mchId;
        this.subMchId = config.subMchId;
        this.certPath = config.certPath;
    }

    get providerType() {
        return PaymentProvider.PROVIDER_TYPES.WECHAT;
    }

    async createOrder(order) {
        const nonceStr = this.generateNonceStr();
        const timeStamp = Math.floor(Date.now() / 1000);

        const params = {
            appid: this.config.appId,
            mch_id: this.mchId,
            nonce_str: nonceStr,
            body: order.subject,
            out_trade_no: order.out_trade_no,
            total_fee: Math.round(order.total_amount * 100), // 转换为分
            spbill_create_ip: '127.0.0.1',
            notify_url: this.notifyUrl,
            trade_type: 'NATIVE', // 扫码支付
            time_start: this.formatTime(new Date()),
            time_expire: this.formatTime(new Date(Date.now() + 30 * 60 * 1000)) // 30分钟过期
        };

        params.sign = this.generateSignature(params);

        // 调用微信支付统一下单API
        const response = await fetch(`${this.gateway}/pay/unifiedorder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/xml' },
            body: this.buildXML(params)
        });

        const result = await this.parseXML(await response.text());

        if (result.return_code === 'SUCCESS' && result.result_code === 'SUCCESS') {
            return {
                qrCodeUrl: result.code_url,
                prepayId: result.prepay_id,
                ...params
            };
        } else {
            throw new PaymentError(
                result.return_msg || result.err_code_des,
                'WECHAT_ORDER_FAILED'
            );
        }
    }

    async queryOrder(orderId) {
        const params = {
            appid: this.config.appId,
            mch_id: this.mchId,
            out_trade_no: orderId,
            nonce_str: this.generateNonceStr()
        };

        params.sign = this.generateSignature(params);

        const response = await fetch(`${this.gateway}/pay/orderquery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/xml' },
            body: this.buildXML(params)
        });

        return this.parseXML(await response.text());
    }

    async showQRCodePayment(order) {
        // 在Electron中显示二维码支付界面
        const { BrowserWindow, ipcMain } = await import('electron');

        return new Promise((resolve, reject) => {
            const paymentWindow = new BrowserWindow({
                width: 400,
                height: 500,
                modal: true,
                parent: BrowserWindow.getFocusedWindow(),
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false
                }
            });

            // 监听支付结果
            ipcMain.once('wechat-payment-result', (event, result) => {
                paymentWindow.close();

                if (result.success) {
                    resolve(result.receipt);
                } else {
                    reject(new PaymentError(result.error, 'WECHAT_PAYMENT_FAILED'));
                }
            });

            // 加载支付页面
            paymentWindow.loadFile('payment-wechat.html', {
                query: { orderData: JSON.stringify(order) }
            });
        });
    }

    generateNonceStr(length = 32) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    formatTime(date) {
        return date.toISOString().replace(/[-:]/g, '').split('.')[0];
    }

    buildXML(params) {
        // 简化版的XML构建
        const xml = ['<xml>'];
        Object.keys(params).forEach(key => {
            xml.push(`<${key}>${params[key]}</${key}>`);
        });
        xml.push('</xml>');
        return xml.join('');
    }

    parseXML(xml) {
        // 简化版的XML解析
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xml, 'text/xml');
        const result = {};

        Array.from(xmlDoc.getElementsByTagName('xml')[0].children).forEach(child => {
            result[child.tagName] = child.textContent;
        });

        return result;
    }
}

// 支付宝实现（结构类似）
export class AlipayPaymentProvider extends ThirdPartyPaymentProvider {
    constructor(config) {
        super({ ...config, gateway: 'https://openapi.alipay.com/gateway.do' });
    }

    get providerType() {
        return PaymentProvider.PROVIDER_TYPES.ALIPAY;
    }

    // 支付宝特定的实现方法
    async createOrder(order) {
        // 支付宝订单创建逻辑
    }
}