/**
 * 核心计算模块 — 价格变化、成交量比、OI 变化、机会评分
 */

const Calculator = {
  priceChange(current, previous) {
    if (!previous || previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  },

  volumeRatio(currentVol, avgVol) {
    if (!avgVol || avgVol === 0) return 1;
    return currentVol / avgVol;
  },

  oiChange(currentOI, previousOI) {
    if (!previousOI || previousOI === 0 || currentOI === null) return null;
    return ((currentOI - previousOI) / previousOI) * 100;
  },

  relativeStrength(spotChange, perpChange) {
    if (perpChange === null || perpChange === undefined) return null;
    return spotChange - perpChange;
  },

  /**
   * 计算机会评分 (0-100)
   * 综合多个维度的绝对值加权打分
   */
  opportunityScore(metrics) {
    const w = CONFIG.scoreWeights;

    const rawScores = {
      priceChange5m: Math.min(Math.abs(metrics.spot5mChange || 0) / 5 * 100, 100),
      priceChange1h: Math.min(Math.abs(metrics.spot1hChange || 0) / 10 * 100, 100),
      volumeRatio:   Math.min(((metrics.volumeRatio || 1) - 1) / 3 * 100, 100),
      oiChange:      Math.min(Math.abs(metrics.oiChange5m || 0) / 10 * 100, 100),
      fundingAbs:    Math.min(Math.abs(metrics.funding || 0) / 0.1 * 100, 100),
      relativeStr:   Math.min(Math.abs(metrics.relativeStrength || 0) / 5 * 100, 100),
    };

    let score = 0;
    for (const key in w) {
      score += (rawScores[key] || 0) * w[key];
    }
    return Math.round(Math.max(0, Math.min(100, score)));
  },

  /**
   * 对单币原始数据做完整计算，返回可展示的 metrics
   */
  compute(raw, coinConfig) {
    const spot5mChange = this.priceChange(raw.spotPrice, raw.price5mAgo);
    const spot1hChange = this.priceChange(raw.spotPrice, raw.price1hAgo);

    let perp5mChange = null;
    let perp1hChange = null;
    if (coinConfig.hasPerp && raw.perpPrice) {
      perp5mChange = this.priceChange(raw.perpPrice, raw.price5mAgo);
      perp1hChange = this.priceChange(raw.perpPrice, raw.price1hAgo);
    }

    const volRatio = this.volumeRatio(raw.volume, raw.volumeAvg);
    const oiChange5m = this.oiChange(raw.oi, raw.oi5mAgo);
    const oiChange1h = this.oiChange(raw.oi, raw.oi1hAgo);
    const relStr = this.relativeStrength(spot5mChange, perp5mChange);

    const metrics = {
      symbol: raw.symbol,
      spotPrice: raw.spotPrice,
      perpPrice: raw.perpPrice,
      spot5mChange,
      spot1hChange,
      perp5mChange,
      perp1hChange,
      volumeRatio: volRatio,
      oiChange5m,
      oiChange1h,
      funding: raw.funding,
      relativeStrength: relStr,
      timestamp: raw.timestamp,
    };

    metrics.score = this.opportunityScore(metrics);
    return metrics;
  },
};
