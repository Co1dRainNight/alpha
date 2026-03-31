/**
 * Mock 数据服务 — 模拟币安 API 返回的实时数据
 * 后续可替换为真实 API 调用，接口保持不变
 */

class MockDataService {
  constructor() {
    this._basePrices = {};
    this._baseOI = {};
    this._history = {};  // symbol -> { prices: [], oi: [], volumes: [] }
    this._init();
  }

  _init() {
    const priceRanges = {
      MOVE: [0.35, 0.55], PARTI: [0.20, 0.40], GPS: [0.02, 0.05],
      SHELL: [0.15, 0.35], FORM: [1.50, 3.00], BMT: [0.08, 0.15],
      KAITO: [0.80, 1.60], NIL: [0.30, 0.60], RED: [0.40, 0.80],
      B2: [0.05, 0.12], LAYER: [1.80, 3.50], TUT: [0.01, 0.04],
    };

    COIN_POOL.forEach(coin => {
      const range = priceRanges[coin.symbol] || [0.1, 1.0];
      const base = range[0] + Math.random() * (range[1] - range[0]);
      this._basePrices[coin.symbol] = base;
      this._baseOI[coin.symbol] = 500000 + Math.random() * 5000000;
      this._history[coin.symbol] = { prices: [], oi: [], volumes: [], timestamps: [] };
    });
  }

  _jitter(value, pct) {
    return value * (1 + (Math.random() - 0.5) * 2 * pct / 100);
  }

  _trend(symbol) {
    // 随机给部分币制造趋势，模拟真实场景
    if (!this._trendMap) this._trendMap = {};
    if (!this._trendMap[symbol] || Math.random() < 0.02) {
      this._trendMap[symbol] = (Math.random() - 0.5) * 0.06;
    }
    return this._trendMap[symbol];
  }

  fetch(coin) {
    const sym = coin.symbol;
    const trend = this._trend(sym);
    this._basePrices[sym] *= (1 + trend);

    const spotPrice = this._jitter(this._basePrices[sym], 1.5);
    const perpPrice = coin.hasPerp ? this._jitter(this._basePrices[sym], 1.8) : null;
    const volume = this._jitter(1000000, 80);
    const oi = coin.hasPerp ? this._jitter(this._baseOI[sym], 3) : null;
    const funding = coin.hasPerp ? (Math.random() - 0.45) * 0.12 : null;

    const hist = this._history[sym];
    const now = Date.now();
    hist.prices.push(spotPrice);
    hist.oi.push(oi);
    hist.volumes.push(volume);
    hist.timestamps.push(now);

    // 保留最多 720 个数据点（约 1h @5s interval）
    const maxPoints = 720;
    if (hist.prices.length > maxPoints) {
      hist.prices = hist.prices.slice(-maxPoints);
      hist.oi = hist.oi.slice(-maxPoints);
      hist.volumes = hist.volumes.slice(-maxPoints);
      hist.timestamps = hist.timestamps.slice(-maxPoints);
    }

    const price5mAgo = this._getHistoricValue(hist.prices, hist.timestamps, now, 5 * 60 * 1000);
    const price1hAgo = this._getHistoricValue(hist.prices, hist.timestamps, now, 60 * 60 * 1000);
    const oi5mAgo = this._getHistoricValue(hist.oi, hist.timestamps, now, 5 * 60 * 1000);
    const oi1hAgo = this._getHistoricValue(hist.oi, hist.timestamps, now, 60 * 60 * 1000);
    const volumeAvg = this._getAvgVolume(hist.volumes);

    return {
      symbol: sym,
      spotPrice,
      perpPrice,
      volume,
      oi,
      funding,
      price5mAgo: price5mAgo || spotPrice * (1 - trend * 60),
      price1hAgo: price1hAgo || spotPrice * (1 - trend * 720),
      oi5mAgo: oi5mAgo || (oi ? oi * 0.97 : null),
      oi1hAgo: oi1hAgo || (oi ? oi * 0.92 : null),
      volumeAvg: volumeAvg || volume,
      timestamp: now,
    };
  }

  _getHistoricValue(arr, timestamps, now, deltaMs) {
    const target = now - deltaMs;
    for (let i = timestamps.length - 1; i >= 0; i--) {
      if (timestamps[i] <= target) return arr[i];
    }
    return null;
  }

  _getAvgVolume(volumes) {
    if (volumes.length < 2) return null;
    const sum = volumes.reduce((a, b) => a + b, 0);
    return sum / volumes.length;
  }

  fetchAll() {
    return COIN_POOL.map(coin => this.fetch(coin));
  }
}
