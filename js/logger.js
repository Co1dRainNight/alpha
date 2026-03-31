/**
 * 信号日志模块 v2 — 只记录核心信号，拒绝无效数据
 */

class SignalLogger {
  constructor(maxEntries = CONFIG.maxLogEntries) {
    this.maxEntries = maxEntries;
    this.logs = [];
  }

  add(metrics, signal) {
    if (signal.priority === 'passive') return null;

    const price = metrics.spotPrice || metrics.perpPrice;
    if (!price || price === 0) return null;
    if (!metrics.score && metrics.score !== 0) return null;

    const entry = {
      id: Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      timestamp: new Date().toISOString(),
      symbol: metrics.symbol,
      signalType: signal.name,
      signalKey: signal.key,
      priority: signal.priority,
      spotPrice: metrics.spotPrice,
      perpPrice: metrics.perpPrice,
      spot5mChange: metrics.spot5mChange,
      oiChange5m: metrics.oiChange5m,
      funding: metrics.funding,
      volumeRatio: metrics.volumeRatio,
      score: metrics.score,
      explanation: signal.explanation,
    };
    this.logs.unshift(entry);
    if (this.logs.length > this.maxEntries) {
      this.logs = this.logs.slice(0, this.maxEntries);
    }
    return entry;
  }

  getRecent(count = 50) {
    return this.logs.slice(0, count);
  }

  getBySymbol(symbol, count = 20) {
    return this.logs.filter(l => l.symbol === symbol).slice(0, count);
  }

  getBySignal(signalKey, count = 20) {
    return this.logs.filter(l => l.signalKey === signalKey).slice(0, count);
  }

  getFiltered({ symbol, signalKey, limit } = {}) {
    let result = this.logs;
    if (symbol)    result = result.filter(l => l.symbol === symbol);
    if (signalKey) result = result.filter(l => l.signalKey === signalKey);
    return result.slice(0, limit || 100);
  }

  exportJSON() {
    return JSON.stringify(this.logs, null, 2);
  }

  clear() {
    this.logs = [];
  }
}
