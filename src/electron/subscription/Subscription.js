// subscription-strategy/subscription-core.js
export class SubscriptionError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = 'SubscriptionError';
    }
}

export class SubscriptionPeriod {
    static PERIOD_TYPES = {
        MONTHLY: 'monthly',
        QUARTERLY: 'quarterly',
        YEARLY: 'yearly',
        QUINQUENNIAL: 'quinquennial',
        LIFETIME: 'lifetime',
        ONE_TIME: 'one_time'
    };

    constructor(type, months = 1) {
        this.type = type;
        this.months = months;
        this.days = months * 30; // 近似值
        this.startDate = null;
        this.endDate = null;
    }

    static fromType(type) {
        const periods = {
            [SubscriptionPeriod.PERIOD_TYPES.MONTHLY]: new SubscriptionPeriod(
                SubscriptionPeriod.PERIOD_TYPES.MONTHLY, 1
            ),
            [SubscriptionPeriod.PERIOD_TYPES.QUARTERLY]: new SubscriptionPeriod(
                SubscriptionPeriod.PERIOD_TYPES.QUARTERLY, 3
            ),
            [SubscriptionPeriod.PERIOD_TYPES.YEARLY]: new SubscriptionPeriod(
                SubscriptionPeriod.PERIOD_TYPES.YEARLY, 12
            ),
            [SubscriptionPeriod.PERIOD_TYPES.QUINQUENNIAL]: new SubscriptionPeriod(
                SubscriptionPeriod.PERIOD_TYPES.QUINQUENNIAL, 60
            )
        };
        return periods[type] || periods[SubscriptionPeriod.PERIOD_TYPES.MONTHLY];
    }

    calculateEndDate(startDate = new Date()) {
        this.startDate = new Date(startDate);
        this.endDate = new Date(startDate);
        this.endDate.setMonth(this.endDate.getMonth() + this.months);
        return this.endDate;
    }

    isActive(checkDate = new Date()) {
        if (!this.startDate || !this.endDate) return false;
        return checkDate >= this.startDate && checkDate <= this.endDate;
    }

    getRemainingDays() {
        if (!this.endDate) return 0;
        const now = new Date();
        const diff = this.endDate - now;
        return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }
}