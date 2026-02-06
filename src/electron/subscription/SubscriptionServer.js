import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// 获取所有订阅计划
router.get('/plans', async (req, res) => {
    try {
        const plans = await prisma.subscriptionPlan.findMany({
            where: { isActive: true },
            include: {
                features: true,
                pricingStrategy: true
            }
        });
        
        const formattedPlans = plans.map(plan => ({
            id: plan.id,
            name: plan.name,
            description: plan.description,
            basePrice: plan.basePrice,
            currency: plan.currency,
            features: plan.features.map(f => f.name),
            availablePeriods: JSON.parse(plan.availablePeriods),
            pricingStrategyId: plan.pricingStrategyId,
            isActive: plan.isActive,
            createdAt: plan.createdAt,
            updatedAt: plan.updatedAt
        }));
        
        res.json(formattedPlans);
    } catch (error) {
        console.error('Error fetching plans:', error);
        res.status(500).json({ error: 'Failed to fetch plans' });
    }
});

// 更新订阅计划
router.put('/plans/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        const updatedPlan = await prisma.subscriptionPlan.update({
            where: { id },
            data: {
                ...updates,
                availablePeriods: JSON.stringify(updates.availablePeriods || []),
                updatedAt: new Date()
            }
        });
        
        res.json(updatedPlan);
    } catch (error) {
        console.error('Error updating plan:', error);
        res.status(500).json({ error: 'Failed to update plan' });
    }
});

// 获取定价策略
router.get('/pricing-strategies/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const strategy = await prisma.pricingStrategy.findUnique({
            where: { id }
        });
        
        if (!strategy) {
            return res.status(404).json({ error: 'Strategy not found' });
        }
        
        res.json({
            ...strategy,
            config: JSON.parse(strategy.config)
        });
    } catch (error) {
        console.error('Error fetching strategy:', error);
        res.status(500).json({ error: 'Failed to fetch strategy' });
    }
});

// 更新定价策略
router.put('/pricing-strategies/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { config } = req.body;
        
        const updatedStrategy = await prisma.pricingStrategy.update({
            where: { id },
            data: {
                config: JSON.stringify(config),
                lastUpdated: new Date()
            }
        });
        
        res.json({
            ...updatedStrategy,
            config: JSON.parse(updatedStrategy.config)
        });
    } catch (error) {
        console.error('Error updating strategy:', error);
        res.status(500).json({ error: 'Failed to update strategy' });
    }
});

// 获取市场需求数据（用于动态定价）
router.get('/market-demand', async (req, res) => {
    try {
        // 这里可以计算实时市场需求
        const demandData = await calculateMarketDemand();
        
        res.json({
            demandLevel: demandData.level,
            trend: demandData.trend,
            timestamp: new Date()
        });
    } catch (error) {
        console.error('Error calculating market demand:', error);
        res.status(500).json({ error: 'Failed to calculate demand' });
    }
});

// 订阅管理接口
router.post('/subscriptions', async (req, res) => {
    try {
        const subscription = req.body;
        
        const savedSubscription = await prisma.subscription.create({
            data: {
                id: subscription.id,
                userId: subscription.userId,
                planId: subscription.planId,
                periodType: subscription.periodType,
                price: subscription.price,
                currency: subscription.currency,
                startDate: subscription.startDate,
                endDate: subscription.endDate,
                status: subscription.status,
                paymentProvider: subscription.paymentProvider,
                metadata: JSON.stringify(subscription.metadata || {})
            }
        });
        
        res.json(savedSubscription);
    } catch (error) {
        console.error('Error creating subscription:', error);
        res.status(500).json({ error: 'Failed to create subscription' });
    }
});

router.put('/subscriptions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        const updatedSubscription = await prisma.subscription.update({
            where: { id },
            data: {
                ...updates,
                metadata: updates.metadata ? JSON.stringify(updates.metadata) : undefined,
                updatedAt: new Date()
            }
        });
        
        res.json(updatedSubscription);
    } catch (error) {
        console.error('Error updating subscription:', error);
        res.status(500).json({ error: 'Failed to update subscription' });
    }
});

async function calculateMarketDemand() {
    // 模拟市场需求计算
    // 实际实现可以从数据库查询销售数据、用户行为等
    const hour = new Date().getHours();
    const day = new Date().getDay();
    
    // 基于时间和星期的简单需求模型
    let baseDemand = 1.0;
    
    // 工作时间需求较高
    if (hour >= 9 && hour <= 17) {
        baseDemand *= 1.2;
    }
    
    // 工作日需求较高
    if (day >= 1 && day <= 5) {
        baseDemand *= 1.1;
    }
    
    // 添加随机波动
    const randomFactor = 0.9 + Math.random() * 0.2;
    baseDemand *= randomFactor;
    
    return {
        level: Math.round(baseDemand * 100) / 100,
        trend: randomFactor > 1 ? 'up' : 'down'
    };
}

export default router;