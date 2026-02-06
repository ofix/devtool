// payment-system/ad-revenue-provider.js
import { PaymentProvider, PaymentError } from './PaymentProvider.js';

export class AdRevenueProvider extends PaymentProvider {
    constructor(config) {
        super(config);
        this.adProvider = config.adProvider; // 'overwolf', 'admob', 等
        this.adUnits = config.adUnits || {};
        this.revenue = 0;
        this.adListeners = new Map();
    }

    get providerType() {
        return PaymentProvider.PROVIDER_TYPES.AD;
    }

    async initiatePayment(order) {
        // 广告收入不是直接支付，而是基于展示/点击
        throw new PaymentError('Ad revenue is not a direct payment method', 'INVALID_OPERATION');
    }

    async verifyPayment() {
        // 广告收入验证通常通过广告平台的回调
        return true;
    }

    async setupAdUnits() {
        switch (this.adProvider) {
            case 'overwolf':
                await this.setupOverwolfAds();
                break;
            case 'admob':
                await this.setupAdMob();
                break;
            default:
                throw new PaymentError(`Unsupported ad provider: ${this.adProvider}`, 'UNSUPPORTED_PROVIDER');
        }
    }

    async setupOverwolfAds() {
        // Overwolf广告设置
        if (window.overwolf && window.overwolf.ads) {
            const adService = overwolf.ads;
            
            // 设置广告监听器
            adService.onAdAvailabilityChanged.addListener((event) => {
                this.emit('ad-availability-changed', event);
            });
            
            adService.onAdError.addListener((error) => {
                this.emit('ad-error', error);
            });
            
            // 为每个广告单元设置监听
            for (const [unitId, config] of Object.entries(this.adUnits)) {
                adService.setAdUnit(unitId, config);
                
                adService.onAdRevenue.addListener((revenueData) => {
                    if (revenueData.adUnit === unitId) {
                        this.revenue += revenueData.revenue;
                        this.emit('ad-revenue', {
                            unitId,
                            revenue: revenueData.revenue,
                            totalRevenue: this.revenue
                        });
                    }
                });
            }
        }
    }

    async showAd(adUnitId, options = {}) {
        if (!this.adUnits[adUnitId]) {
            throw new PaymentError(`Ad unit ${adUnitId} not configured`, 'AD_UNIT_NOT_FOUND');
        }

        return new Promise((resolve, reject) => {
            if (window.overwolf && window.overwolf.ads) {
                overwolf.ads.showAd(adUnitId, options, (result) => {
                    if (result.success) {
                        resolve(result);
                    } else {
                        reject(new PaymentError(result.error, 'AD_SHOW_FAILED'));
                    }
                });
            } else {
                reject(new PaymentError('Ad service not available', 'AD_SERVICE_UNAVAILABLE'));
            }
        });
    }

    getRevenue() {
        return this.revenue;
    }

    resetRevenue() {
        this.revenue = 0;
    }
}