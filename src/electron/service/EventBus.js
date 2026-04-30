// 事件总线（发布/订阅模式）
export class EventBus {
    constructor() {
      this.events = new Map()
    }
  
    // 订阅事件
    on(event, callback) {
      if (!this.events.has(event)) {
        this.events.set(event, [])
      }
      this.events.get(event).push(callback)
    }
  
    // 取消订阅
    off(event, callback) {
      const cbs = this.events.get(event)
      if (!cbs) return
      this.events.set(
        event,
        cbs.filter(cb => cb !== callback)
      )
    }
  
    // 发布事件（触发所有订阅者）
    emit(event, ...args) {
      const cbs = this.events.get(event)
      if (!cbs) return
  
      cbs.forEach(cb => {
        try {
          cb(...args)
        } catch (e) {
          console.error(`[EventBus] ${event} 执行异常`, e)
        }
      })
    }
  }
  
  // 全局唯一单例
  export const eventBus = new EventBus()
  export default eventBus;