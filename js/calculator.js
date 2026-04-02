/**
 * 核心计算模块 v3 — 数据有效性检测 + 主动资金指标 + 大盘相关性
 */

const Calculator = {

  _isValid(v) {
    return v !== null && v !== undefined && isFinite(v);
  },

  priceChange(current, previous) {
    if (!this._isValid(current) || !this._isValid(previous) || previous === 0) return null;
    return ((current - previous) / previous) * 100;
  },

  volumeRatio(currentVol, avgVol) {
    if (!this._isValid(currentVol) || !this._isValid(avgVol) || avgVol === 0) return null;
    return currentVol / avgVol;
  },

  oiChange(currentOI, previousOI) {
    if (!this._isValid(currentOI) || !this._isValid(previousOI) || previousOI === 0) return null;
    return ((currentOI - previousOI) / previousOI) * 100;
  },

  relativeStrength(spotChange, perpChange) {
    if (spotChange === null || perpChange === null) return null;
    return spotChange - perpChange;
  },

  /**
   * 主动资金比率（做多 vs 做空）
   * > 1 表示多头主导，< 1 表示空头主导
   */
  longShortRatio(longsRatio) {
    if (!this._isValid(longsRatio) || longsRatio === 0) return null;
    return longsRatio;
  },

  /**
   * 大盘相关性（简化版）
   * 比较币种变化与 BTC 变化的关系
   */
  marketCorrelation(symbolChange, btcChange) {
    if (!this._isValid(symbolChange) || !this._isValid(btcChange) || btcChange === 0) return null;
    return symbolChange - btcChange; // 相对强弱
  },

  /**
   * 数据有效性检测 — 每个维度独立判断
   */
  dataValidity(raw, coinConfig) {
    const spotValid = this._isValid(raw.spotPrice);
    const perpValid = coinConfig.hasPerp ? this._isValid(raw.perpPrice) : null;
    const historyValid = this._isValid(raw.price5mAgo) && this._isValid(raw.price1hAgo) && raw.klinesOk;
    const oiValid = coinConfig.hasPerp 
      ? (this._isValid(raw.oi) && this._isValid(raw.oi5mAgo)) 
      : null;
    const fundingValid = coinConfig.hasPerp ? this._isValid(raw.funding) : null;
    const longsValid = coinConfig.hasPerp ? this._isValid(raw.longsRatio) : null;

    const total = [spotValid, perpValid, historyValid, oiValid, fundingValid, longsValid]
      .filter(v => v !== null);
    const validCount = total.filter(Boolean).length;

    return {
      spotValid,
      perpValid,
      historyValid,
      oiValid,
      fundingValid,
      longsValid,
      completeness: total.length > 0 ? validCount / total.length : 0,
      isUsable: spotValid || (perpValid === true),
    };
  },

  /**
   * 机会评分
   */
  opportunityScore(metrics, validity) {
    const w = CONFIG.scoreWeights;
    let totalWeight = 0;
    let weightedSum = 0;
    const breakdown = {};

    const dims = [
      { key: 'priceChange5m', raw: metrics.spot5mChange, scale: 5, valid: validity.historyValid },
      { key: 'priceChange1h', raw: metrics.spot1hChange, scale: 10, valid: validity.historyValid },
      { key: 'volumeRatio', raw: metrics.volumeRatio, scale: 3, valid: metrics.volumeRatio !== null, isRatio: true },
      { key: 'oiChange', raw: metrics.oiChange5m, scale: 10, valid: validity.oiValid === true },
      { key: 'fundingAbs', raw: metrics.funding, scale: 0.1, valid: validity.fundingValid === true },
      { key: 'relativeStr', raw: metrics.relativeStrength, scale: 5, valid: metrics.relativeStrength !== null },
      { key: 'longShortRatio', raw: metrics.longsRatio, scale: 1, valid: validity.longsValid === true },
    ];

    for (const d of dims) {
      const weight = w[d.key] || 0;
      if (d.valid && d.raw !== null) {
        let normalized;
        if (d.key === 'longShortRatio') {
          // 主动资金：1.5 以上有意义，标准化到 0-100
          normalized = Math.min(Math.max((d.raw - 0.5) * 100, 0), 100);
        } else if (d.isRatio) {
          normalized = Math.min(Math.max((d.raw - 1) / d.scale * 100, 0), 100);
        } else {
          normalized = Math.min(Math.abs(d.raw) / d.scale * 100, 100);
        }
        totalWeight += weight;
        const contrib = normalized * weight;
        weightedSum += contrib;
        breakdown[d.key] = Math.round(contrib);
      } else {
        breakdown[d.key] = null;
      }
    }

    const score = totalWeight > 0
      ? Math.round(Math.min(100, weightedSum / totalWeight * (totalWeight / 1.0)))
      : 0;

    return { score: Math.max(0, Math.min(100, score)), breakdown };
  },

  /**
   * 完整计算入口
   */
  compute(raw, coinConfig) {
    const validity = this.dataValidity(raw, coinConfig);

    const spotPrice = raw.spotPrice;
    const perpPrice = raw.perpPrice;

    // 价格变化计算
    const spot5mChange = validity.historyValid && spotPrice
      ? this.priceChange(spotPrice, raw.price5mAgo) : null;
    const spot1hChange = validity.historyValid && spotPrice
      ? this.priceChange(spotPrice, raw.price1hAgo) : null;

    let perp5mChange = null;
    if (coinConfig.hasPerp && perpPrice && validity.historyValid && raw.price5mAgo) {
      perp5mChange = this.priceChange(perpPrice, raw.price5mAgo);
    }

    const volRatio = this.volumeRatio(raw.volume, raw.volumeAvg);
    const oiChange5m = this.oiChange(raw.oi, raw.oi5mAgo);
    const oiChange1h = this.oiChange(raw.oi, raw.oi1hAgo);
    const relStr = this.relativeStrength(spot5mChange, perp5mChange);
    const longsRatio = this.longShortRatio(raw.longsRatio);
    const marketCorr = this.marketCorrelation(spot1hChange, raw.btc1hChange);

    const funding = raw.funding;

    const metrics = {
      symbol: raw.symbol,
      isAlpha: raw.isAlpha || false,
      spotPrice,
      perpPrice,
      spot5mChange,
      spot1hChange,
      perp5mChange,
      volumeRatio: volRatio,
      oiChange5m,
      oiChange1h,
      funding,
      longsRatio,
      relativeStrength: relStr,
      marketCorr,
      btc1hChange: raw.btc1hChange,
      eth1hChange: raw.eth1hChange,
      timestamp: raw.timestamp,
      validity,
    };

    const { score, breakdown } = this.opportunityScore(metrics, validity);
    metrics.score = score;
    metrics.scoreBreakdown = breakdown;
    return metrics;
  },
};
