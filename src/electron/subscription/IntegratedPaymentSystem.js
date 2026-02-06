// subscription-strategy/integrated-payment-system.js
import { PaymentManager } from '../payment/payment-manager.js';
import { SubscriptionManager, SubscriptionPeriod } from './subscription-core.js';

export class IntegratedPaymentSystem {
    constructor(config) {
        this.config = config;
        this.paymentManager = null;
        this.subscriptionManager = null;
        this.initialized = false;
    }

    async initialize() {
        // 初始化支付管理器
        this.paymentManager = await new PaymentManager(this.config.payment).initialize();
        
        // 初始化订阅管理器
        this.subscriptionManager = new SubscriptionManager({
            apiBaseUrl: this.config.apiBaseUrl,
            refreshInterval: this.config.refreshInterval || 300000
        });
        
        // 等待订阅计划加载完成
        await this.subscriptionManager.refreshPlansFromServer();
        
        this.initialized = true;
        console.log('Integrated payment system initialized');
        
        return this;
    }

    async processSubscriptionPayment(userId, planId, periodType, paymentMethod, options = {}) {
        if (!this.initialized) {
            throw new Error('Payment system not initialized');
        }

        // 1. 创建订阅记录
        const subscription = await this.subscriptionManager.createSubscription(
            userId,
            planId,
            periodType,
            paymentMethod,
            options
        );

        // 2. 准备支付订单
        const order = {
            id: subscription.id,
            productId: planId,
            amount: subscription.price,
            currency: subscription.currency,
            description: `${subscription.planName} - ${this.getPeriodDisplayName(periodType)}`,
            userId: userId,
            subscriptionData: {
                periodType: periodType,
                months: subscription.period.months,
                startDate: subscription.startDate,
                endDate: subscription.endDate
            }
        };

        // 3. 处理支付
        let paymentResult;
        try {
            if (options.showPaymentOptions) {
                paymentResult = await this.paymentManager.showPaymentOptions(order);
            } else {
                paymentResult = await this.paymentManager.processPayment(order, paymentMethod);
            }
            
            // 4. 支付成功，更新订阅状态
            await this.subscriptionManager.updateSubscriptionStatus(
                subscription.id,
                'active'
            );
            
            return {
                success: true,
                subscription: subscription,
                payment: paymentResult,
                nextBillingDate: subscription.endDate
            };
            
        } catch (paymentError) {
            // 支付失败，更新订阅状态
            await this.subscriptionManager.updateSubscriptionStatus(
                subscription.id,
                'payment_failed'
            );
            
            throw paymentError;
        }
    }

    async getUserSubscriptionStatus(userId) {
        const activeSub = this.subscriptionManager.getActiveSubscription(userId);
        
        if (!activeSub) {
            return {
                hasActiveSubscription: false,
                message: 'No active subscription'
            };
        }

        const plan = this.subscriptionManager.getPlan(activeSub.planId);
        const remainingDays = activeSub.period.getRemainingDays();
        
        return {
            hasActiveSubscription: true,
            subscription: activeSub,
            plan: plan.toJSON(),
            remainingDays: remainingDays,
            isExpiringSoon: remainingDays <= 7,
            canRenew: remainingDays <= 30,
            renewalOptions: this.getRenewalOptions(activeSub.planId)
        };
    }

    getRenewalOptions(planId) {
        const plan = this.subscriptionManager.getPlan(planId);
        const options = [];
        
        for (const periodType of plan.availablePeriods) {
            const price = plan.calculatePrice(periodType);
            options.push({
                periodType: periodType,
                displayName: this.getPeriodDisplayName(periodType),
                price: price,
                monthlyEquivalent: price / SubscriptionPeriod.fromType(periodType).months,
                savings: plan.calculateSavings(periodType)
            });
        }
        
        return options;
    }

    async renewSubscription(userId, subscriptionId, newPeriodType, paymentMethod) {
        const subscription = this.subscriptionManager.findSubscriptionById(subscriptionId);
        
        if (!subscription || subscription.userId !== userId) {
            throw new Error('Subscription not found');
        }

        // 创建续订订阅
        return await this.processSubscriptionPayment(
            userId,
            subscription.planId,
            newPeriodType,
            paymentMethod,
            {
                isRenewal: true,
                previousSubscriptionId: subscriptionId
            }
        );
    }

    async cancelSubscription(userId, subscriptionId) {
        const subscription = this.subscriptionManager.findSubscriptionById(subscriptionId);
        
        if (!subscription || subscription.userId !== userId) {
            throw new Error('Subscription not found');
        }

        await this.subscriptionManager.cancelSubscription(subscriptionId);
        
        // 如果是应用商店订阅，可能需要调用相应的取消API
        if (subscription.paymentProvider === 'apple' || subscription.paymentProvider === 'microsoft') {
            await this.handleStoreSubscriptionCancel(subscription);
        }
        
        return {
            success: true,
            cancelledAt: new Date(),
            refundEligible: this.isRefundEligible(subscription)
        };
    }

    async handleStoreSubscriptionCancel(subscription) {
        // 处理应用商店订阅取消
        // 注意：实际实现需要调用相应的商店API
        console.log(`Store subscription ${subscription.id} cancelled`);
    }

    isRefundEligible(subscription) {
        // 检查是否符合退款条件
        const daysSinceStart = (new Date() - new Date(subscription.startDate)) / (1000 * 60 * 60 * 24);
        return daysSinceStart <= 14; // 14天退款政策
    }

    getPeriodDisplayName(periodType) {
        const names = {
            [SubscriptionPeriod.PERIOD_TYPES.MONTHLY]: '月付',
            [SubscriptionPeriod.PERIOD_TYPES.QUARTERLY]: '季付',
            [SubscriptionPeriod.PERIOD_TYPES.YEARLY]: '年付',
            [SubscriptionPeriod.PERIOD_TYPES.QUINQUENNIAL]: '5年付',
            [SubscriptionPeriod.PERIOD_TYPES.LIFETIME]: '终身',
            [SubscriptionPeriod.PERIOD_TYPES.ONE_TIME]: '一次性'
        };
        return names[periodType] || periodType;
    }

    async updatePricingStrategy(strategyId, updates) {
        return await this.subscriptionManager.updatePricingStrategy(strategyId, updates);
    }

    async refreshPlans() {
        return await this.subscriptionManager.refreshPlansFromServer();
    }

    getAvailablePlans() {
        return this.subscriptionManager.getAvailablePlans();
    }

    getPlanComparison() {
        return this.subscriptionManager.getPlanComparison();
    }

    dispose() {
        if (this.subscriptionManager) {
            this.subscriptionManager.dispose();
        }
        this.initialized = false;
    }
}