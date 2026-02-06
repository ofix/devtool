// subscription-strategy/subscription-plan.js
export class SubscriptionPlan {
    constructor(config) {
        this.id = config.id;
        this.name = config.name;
        this.description = config.description;
        this.basePrice = config.basePrice;
        this.currency = config.currency || 'CNY';
        this.features = config.features || [];
        this.availablePeriods = config.availablePeriods || [
            SubscriptionPeriod.PERIOD_TYPES.MONTHLY,
            SubscriptionPeriod.PERIOD_TYPES.QUARTERLY,
            SubscriptionPeriod.PERIOD_TYPES.YEARLY
        ];
        this.pricingStrategy = config.pricingStrategy;
        this.isActive = config.isActive !== false;
        this.createdAt = new Date();
        this.updatedAt = new Date();
    }

    async calculatePrice(periodType, options = {}) {
        const period = SubscriptionPeriod.fromType(periodType);
        
        if (!this.isPeriodAvailable(periodType)) {
            throw new SubscriptionError(
                `Period ${periodType} not available for plan ${this.name}`,
                'PERIOD_NOT_AVAILABLE'
            );
        }

        return await this.pricingStrategy.calculatePrice(
            this.basePrice,
            period,
            options
        );
    }

    isPeriodAvailable(periodType) {
        return this.availablePeriods.includes(periodType);
    }

    getAvailablePeriodsWithPrices(options = {}) {
        const periods = {};
        
        for (const periodType of this.availablePeriods) {
            const price = this.calculatePrice(periodType, options);
            periods[periodType] = {
                type: periodType,
                price: price,
                displayName: this.getPeriodDisplayName(periodType),
                savings: this.calculateSavings(periodType)
            };
        }
        
        return periods;
    }

    getPeriodDisplayName(periodType) {
        const names = {
            [SubscriptionPeriod.PERIOD_TYPES.MONTHLY]: '按月订阅',
            [SubscriptionPeriod.PERIOD_TYPES.QUARTERLY]: '按季度订阅',
            [SubscriptionPeriod.PERIOD_TYPES.YEARLY]: '按年订阅',
            [SubscriptionPeriod.PERIOD_TYPES.QUINQUENNIAL]: '5年订阅',
            [SubscriptionPeriod.PERIOD_TYPES.LIFETIME]: '终身授权',
            [SubscriptionPeriod.PERIOD_TYPES.ONE_TIME]: '一次性购买'
        };
        return names[periodType] || periodType;
    }

    calculateSavings(periodType) {
        if (periodType === SubscriptionPeriod.PERIOD_TYPES.MONTHLY) {
            return 0;
        }

        const monthlyPrice = this.calculatePrice(
            SubscriptionPeriod.PERIOD_TYPES.MONTHLY
        );
        const targetPrice = this.calculatePrice(periodType);
        const period = SubscriptionPeriod.fromType(periodType);
        
        const equivalentMonthlyPrice = targetPrice / period.months;
        const savings = ((monthlyPrice - equivalentMonthlyPrice) / monthlyPrice) * 100;
        
        return Math.round(savings * 100) / 100;
    }

    async refreshFromServer() {
        try {
            const response = await fetch(`${this.config.apiBaseUrl}/plans/${this.id}`);
            const serverData = await response.json();
            this.updateFromServer(serverData);
            return true;
        } catch (error) {
            console.warn(`Failed to refresh plan ${this.id}:`, error);
            return false;
        }
    }

    updateFromServer(serverData) {
        Object.assign(this, serverData);
        this.updatedAt = new Date();
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            basePrice: this.basePrice,
            currency: this.currency,
            features: this.features,
            availablePeriods: this.availablePeriods,
            isActive: this.isActive,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
}