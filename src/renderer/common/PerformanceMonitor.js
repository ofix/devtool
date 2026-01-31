class PerformanceMonitor {
  constructor() {
    this.timers = new Map();
    this.stats = new Map();
  }

  start(name) {
    this.timers.set(name, performance.now());
  }

  end(name) {
    const startTime = this.timers.get(name);
    if (!startTime) return 0;

    const duration = performance.now() - startTime;
    this.timers.delete(name);

    // 统计信息
    if (!this.stats.has(name)) {
      this.stats.set(name, { count: 0, total: 0, max: 0, min: Infinity });
    }
    const stat = this.stats.get(name);
    stat.count++;
    stat.total += duration;
    stat.max = Math.max(stat.max, duration);
    stat.min = Math.min(stat.min, duration);

    return duration;
  }

  getStats(name) {
    const stat = this.stats.get(name);
    if (!stat) return null;
    return {
      ...stat,
      avg: stat.total / stat.count
    };
  }

  logStats(name, threshold = 1) {
    const stat = this.getStats(name);
    if (!stat || stat.avg < threshold) return;

    wnd?.log(`🎯 ${name}: 平均 ${stat.avg.toFixed(2)}ms, 最大 ${stat.max.toFixed(2)}ms, 最小 ${stat.min.toFixed(2)}ms, 次数 ${stat.count}`);
  }

  clear() {
    this.timers.clear();
    this.stats.clear();
  }
}


export default PerformanceMonitor;