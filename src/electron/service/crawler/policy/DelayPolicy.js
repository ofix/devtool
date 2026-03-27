// src/crawler/policy/policies/DelayPolicy.js
import PolicyInterface from './PolicyInterface.js';
import DelayManager from './DelayManager.js';

export default class DelayPolicy extends PolicyInterface {
    constructor(config) {
        super();
        this.config = config;
        this.delayManager = new DelayManager(config);
    }
    
    getName() {
        return 'delay';
    }
    
    async before(context) {
        await this.delayManager.wait();
    }
    
    async after(context, result) {
        if (this.delayManager.adaptive) {
            this.delayManager.recordRequest();
        }
    }
}