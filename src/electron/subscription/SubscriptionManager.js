// subscription-strategy/subscription-manager.js
export class SubscriptionManager {
    constructor(config) {
        this.config = config;
        this.plans = new Map();
        this.userSubscriptions = new Map();
        this.strategies = new Map();
        this.apiBaseUrl = config.apiBaseUrl;
        this.refreshInterval = config.refreshInterval || 300000; // 5分钟
        this.init();
    }

    async init() {
        // 加载默认定价策略
        await this.loadDefaultStrategies();
        
        // 从服务器加载订阅计划
        await this.refreshPlansFromServer();
        
        // 启动定期刷新
        this.startAutoRefresh();
    }

    async loadDefaultStrategies() {
        const defaultStrategies = [
            {
                id: 'simple',
                type: 'simple',
                config: {
                    basePrices: {
                        basic: 10,
                        pro: 25,
                        enterprise: 100
                    }
                }
            },
            {
                id: 'tiered',
                type: 'tiered',
                config: {
                    tiers: [
                        { id: 'standard', priceMultiplier: 1.0 },
                        { id: 'educational', priceMultiplier: 0.7 },
                        { id: 'nonprofit', priceMultiplier: 0.5 }
                    ]
                }
            }
        ];

        for (const strategyConfig of defaultStrategies) {
            const strategy = this.createStrategy(strategyConfig);
            this.strategies.set(strategyConfig.id, strategy);
        }
    }

    createStrategy(config) {
        switch (config.type) {
            case 'simple':
                return new SimplePricingStrategy(config.config);
            case 'tiered':
                return new TieredPricingStrategy(config.config);
            case 'dynamic':
                return new DynamicPricingStrategy(config.config);
            default:
                throw new SubscriptionError(
                    `Unknown strategy type: ${config.type}`,
                    'UNKNOWN_STRATEGY'
                );
        }
    }

    async refreshPlansFromServer() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/plans`);
            const plansData = await response.json();
            
            this.plans.clear();
            for (const planData of plansData) {
                const strategy = this.strategies.get(planData.pricingStrategyId);
                if (strategy) {
                    const plan = new SubscriptionPlan({
                        ...planData,
                        pricingStrategy: strategy
                    });
                    this.plans.set(plan.id, plan);
                }
            }
            
            console.log(`Loaded ${this.plans.size} plans from server`);
            return true;
        } catch (error) {
            console.error('Failed to refresh plans:', error);
            return false;
        }
    }

    startAutoRefresh() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }
        
        this.refreshTimer = setInterval(() => {
            this.refreshPlansFromServer().catch(console.error);
        }, this.refreshInterval);
    }

    stopAutoRefresh() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
    }

    getPlan(planId) {
        const plan = this.plans.get(planId);
        if (!plan) {
            throw new SubscriptionError(`Plan ${planId} not found`, 'PLAN_NOT_FOUND');
        }
        return plan;
    }

    async calculatePrice(planId, periodType, options = {}) {
        const plan = this.getPlan(planId);
        return await plan.calculatePrice(periodType, options);
    }

    async createSubscription(userId, planId, periodType, paymentProvider, options = {}) {
        const plan = this.getPlan(planId);
        const price = await plan.calculatePrice(periodType, options);
        const period = SubscriptionPeriod.fromType(periodType);
        
        const subscription = {
            id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            userId,
            planId,
            planName: plan.name,
            periodType,
            period,
            price,
            currency: plan.currency,
            startDate: new Date(),
            endDate: period.calculateEndDate(),
            status: 'pending',
            paymentProvider,
            createdAt: new Date()
        };
        
        // 保存到本地
        if (!this.userSubscriptions.has(userId)) {
            this.userSubscriptions.set(userId, []);
        }
        this.userSubscriptions.get(userId).push(subscription);
        
        // 同步到服务器
        await this.syncSubscriptionToServer(subscription);
        
        return subscription;
    }

    async syncSubscriptionToServer(subscription) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/subscriptions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(subscription)
            });
            
            if (!response.ok) {
                throw new Error('Failed to sync subscription');
            }
            
            return await response.json();
        } catch (error) {
            console.error('Failed to sync subscription:', error);
            // 可以在这里实现重试逻辑
            return subscription;
        }
    }

    getUserSubscriptions(userId) {
        return this.userSubscriptions.get(userId) || [];
    }

    getActiveSubscription(userId) {
        const subscriptions = this.getUserSubscriptions(userId);
        const now = new Date();
        
        return subscriptions.find(sub => 
            sub.status === 'active' && 
            sub.endDate && 
            new Date(sub.endDate) > now
        );
    }

    async updateSubscriptionStatus(subscriptionId, status) {
        // 更新本地状态
        for (const [userId, subs] of this.userSubscriptions) {
            const sub = subs.find(s => s.id === subscriptionId);
            if (sub) {
                sub.status = status;
                sub.updatedAt = new Date();
                
                // 同步到服务器
                await this.updateSubscriptionOnServer(sub);
                break;
            }
        }
    }

    async updateSubscriptionOnServer(subscription) {
        try {
            const response = await fetch(
                `${this.apiBaseUrl}/subscriptions/${subscription.id}`,
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(subscription)
                }
            );
            
            if (!response.ok) {
                throw new Error('Failed to update subscription on server');
            }
            
            return await response.json();
        } catch (error) {
            console.error('Failed to update subscription:', error);
            throw error;
        }
    }

    async cancelSubscription(subscriptionId) {
        await this.updateSubscriptionStatus(subscriptionId, 'cancelled');
    }

    async renewSubscription(subscriptionId, newPeriodType) {
        const subscription = this.findSubscriptionById(subscriptionId);
        if (!subscription) {
            throw new SubscriptionError('Subscription not found', 'SUBSCRIPTION_NOT_FOUND');
        }
        
        const newSubscription = await this.createSubscription(
            subscription.userId,
            subscription.planId,
            newPeriodType,
            subscription.paymentProvider
        );
        
        newSubscription.previousSubscriptionId = subscriptionId;
        return newSubscription;
    }

    findSubscriptionById(subscriptionId) {
        for (const [, subs] of this.userSubscriptions) {
            const sub = subs.find(s => s.id === subscriptionId);
            if (sub) return sub;
        }
        return null;
    }

    async updatePricingStrategy(strategyId, updates) {
        const strategy = this.strategies.get(strategyId);
        if (!strategy) {
            throw new SubscriptionError('Strategy not found', 'STRATEGY_NOT_FOUND');
        }
        
        strategy.updateConfiguration(updates);
        
        // 同步到服务器
        await this.syncStrategyToServer(strategyId, strategy);
        
        return strategy;
    }

    async syncStrategyToServer(strategyId, strategy) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/pricing-strategies/${strategyId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    config: strategy.config,
                    lastUpdated: strategy.lastUpdated
                })
            });
            
            if (!response.ok) {
                throw new Error('Failed to sync strategy');
            }
        } catch (error) {
            console.error('Failed to sync strategy:', error);
        }
    }

    getAvailablePlans() {
        return Array.from(this.plans.values()).filter(plan => plan.isActive);
    }

    getPlanComparison() {
        const plans = this.getAvailablePlans();
        const comparison = [];
        
        for (const plan of plans) {
            const periodPrices = {};
            for (const periodType of plan.availablePeriods) {
                const price = plan.calculatePrice(periodType);
                periodPrices[periodType] = {
                    price,
                    monthlyEquivalent: price / SubscriptionPeriod.fromType(periodType).months,
                    savings: plan.calculateSavings(periodType)
                };
            }
            
            comparison.push({
                plan: plan.toJSON(),
                prices: periodPrices
            });
        }
        
        return comparison;
    }

    dispose() {
        this.stopAutoRefresh();
        this.plans.clear();
        this.userSubscriptions.clear();
        this.strategies.clear();
    }
}