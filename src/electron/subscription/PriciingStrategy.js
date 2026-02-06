// subscription-strategy/pricing-strategy.js
export class PricingStrategy {
    constructor(config) {
        if (new.target === PricingStrategy) {
            throw new Error('PricingStrategy is abstract and cannot be instantiated directly');
        }
        this.config = config;
        this.lastUpdated = new Date();
        this.strategyId = config.id || `strategy_${Date.now()}`;
    }

    calculatePrice(basePrice, period, options = {}) { }
    validateConfiguration() { }

    async refreshFromServer() {
        try {
            const response = await fetch(`${this.config.apiBaseUrl}/pricing-strategies/${this.strategyId}`);
            const serverConfig = await response.json();
            this.updateConfiguration(serverConfig);
            return true;
        } catch (error) {
            console.warn('Failed to refresh pricing strategy:', error);
            return false;
        }
    }

    updateConfiguration(newConfig) {
        Object.assign(this.config, newConfig);
        this.lastUpdated = new Date();
        this.validateConfiguration();
    }

    getDiscountPercentage(period) {
        // 基础折扣策略：周期越长折扣越大
        const discountMap = {
            [SubscriptionPeriod.PERIOD_TYPES.MONTHLY]: 0,
            [SubscriptionPeriod.PERIOD_TYPES.QUARTERLY]: 5, // 5%折扣
            [SubscriptionPeriod.PERIOD_TYPES.YEARLY]: 15,   // 15%折扣
            [SubscriptionPeriod.PERIOD_TYPES.QUINQUENNIAL]: 40 // 40%折扣
        };
        return discountMap[period.type] || 0;
    }
}

// 简单定价策略：固定折扣
export class SimplePricingStrategy extends PricingStrategy {
    validateConfiguration() {
        if (!this.config.basePrices) {
            throw new SubscriptionError('Missing basePrices configuration', 'INVALID_CONFIG');
        }
        return true;
    }

    calculatePrice(basePrice, period, options = {}) {
        const discount = this.getDiscountPercentage(period);
        const discountedPrice = basePrice * (1 - discount / 100);

        // 应用促销码
        if (options.promoCode) {
            const promoDiscount = this.getPromoCodeDiscount(options.promoCode);
            return discountedPrice * (1 - promoDiscount / 100);
        }

        return discountedPrice;
    }

    getPromoCodeDiscount(promoCode) {
        // 从配置中获取促销码折扣
        const promoCodes = this.config.promoCodes || {};
        return promoCodes[promoCode] || 0;
    }
}

// 阶梯定价策略：根据用户类型定价
export class TieredPricingStrategy extends PricingStrategy {
    validateConfiguration() {
        if (!this.config.tiers || !Array.isArray(this.config.tiers)) {
            throw new SubscriptionError('Invalid tiers configuration', 'INVALID_CONFIG');
        }
        return true;
    }

    calculatePrice(basePrice, period, options = {}) {
        const userTier = options.userTier || 'standard';
        const tierConfig = this.config.tiers.find(t => t.id === userTier);

        if (!tierConfig) {
            throw new SubscriptionError(`Tier ${userTier} not found`, 'TIER_NOT_FOUND');
        }

        const periodMultiplier = this.getPeriodMultiplier(period);
        const tierPrice = basePrice * (tierConfig.priceMultiplier || 1);
        const totalPrice = tierPrice * periodMultiplier;

        return this.applyDiscounts(totalPrice, period, options);
    }

    getPeriodMultiplier(period) {
        // 将订阅周期转换为月份倍数
        return period.months;
    }

    applyDiscounts(price, period, options) {
        let finalPrice = price;

        // 应用周期折扣
        const periodDiscount = this.getDiscountPercentage(period);
        finalPrice *= (1 - periodDiscount / 100);

        // 应用数量折扣
        if (options.quantity && options.quantity > 1) {
            const quantityDiscount = this.getQuantityDiscount(options.quantity);
            finalPrice *= (1 - quantityDiscount / 100);
        }

        return finalPrice;
    }

    getQuantityDiscount(quantity) {
        // 数量折扣：买的越多折扣越大
        if (quantity >= 10) return 20;
        if (quantity >= 5) return 10;
        if (quantity >= 3) return 5;
        return 0;
    }
}

// 动态定价策略：根据市场情况调整
export class DynamicPricingStrategy extends PricingStrategy {
    constructor(config) {
        super(config);
        this.marketFactors = config.marketFactors || {};
        this.demandLevel = config.initialDemand || 1.0;
    }

    validateConfiguration() {
        if (!this.config.dynamicFactors) {
            throw new SubscriptionError('Missing dynamicFactors configuration', 'INVALID_CONFIG');
        }
        return true;
    }

    async calculatePrice(basePrice, period, options = {}) {
        // 更新市场需求水平
        await this.updateDemandLevel();

        // 计算动态调整因子
        const dynamicFactor = this.calculateDynamicFactor(options);
        const periodFactor = this.getPeriodFactor(period);

        let finalPrice = basePrice * periodFactor * dynamicFactor * this.demandLevel;

        // 应用最大最小价格限制
        finalPrice = this.applyPriceLimits(finalPrice, period);

        return finalPrice;
    }

    async updateDemandLevel() {
        try {
            const response = await fetch(`${this.config.apiBaseUrl}/market-demand`);
            const data = await response.json();
            this.demandLevel = data.demandLevel || 1.0;
        } catch (error) {
            // 使用默认值
            console.warn('Failed to update demand level:', error);
        }
    }

    calculateDynamicFactor(options) {
        let factor = 1.0;

        // 用户地域因素
        if (options.userRegion && this.marketFactors.regionalMultipliers) {
            const regionalMultiplier = this.marketFactors.regionalMultipliers[options.userRegion] || 1.0;
            factor *= regionalMultiplier;
        }

        // 购买时间因素
        const hour = new Date().getHours();
        if (hour >= 9 && hour <= 17) {
            factor *= 1.1; // 工作时间价格上浮10%
        }

        return factor;
    }

    getPeriodFactor(period) {
        // 根据订阅周期计算系数
        switch (period.type) {
            case SubscriptionPeriod.PERIOD_TYPES.QUINQUENNIAL:
                return 48; // 5年价格 ≈ 4年的月费
            case SubscriptionPeriod.PERIOD_TYPES.YEARLY:
                return 10; // 1年价格 ≈ 10个月的月费
            case SubscriptionPeriod.PERIOD_TYPES.QUARTERLY:
                return 2.8; // 季度价格 ≈ 2.8个月的月费
            default:
                return period.months;
        }
    }

    applyPriceLimits(price, period) {
        const limits = this.config.priceLimits || {};
        const periodLimits = limits[period.type];

        if (periodLimits) {
            if (periodLimits.min !== undefined && price < periodLimits.min) {
                return periodLimits.min;
            }
            if (periodLimits.max !== undefined && price > periodLimits.max) {
                return periodLimits.max;
            }
        }

        return price;
    }
}