/**
 * 核心计算模块 v2 — 增加数据有效性检测，杜绝无效数据参与计算
 */

const Calculator = {

  _isValid(v) {
    return v !== null && v !== undefined && v !== 0 && isFinite(v);
  },

  priceChange(current, previous) {
    if (!this._isValid(current) || !this._isValid(previous)) return null;
    return ((current - previous) / previous) * 100;
  },

  volumeRatio(currentVol, avgVol) {
    if (!this._isValid(currentVol) || !this._isValid(avgVol)) return null;
    return currentVol / avgVol;
  },

  oiChange(currentOI, previousOI) {
    if (!this._isValid(currentOI) || !this._isValid(previousOI)) return null;
    return ((currentOI - previousOI) / previousOI) * 100;
  },

  relativeStrength(spotChange, perpChange) {
    if (spotChange === null || perpChange === null) return null;
    return spotChange - perpChange;
  },

  /**
   * 数据有效性检测 — 每个维度独立判断
   */
  dataValidity(raw, coinConfig) {
    const spotValid    = this._isValid(raw.spotPrice);
    const perpValid    = coinConfig.hasPerp ? this._isValid(raw.perpPrice) : null;
    const historyValid = this._isValid(raw.price5mAgo) && this._isValid(raw.price1hAgo);
    const oiValid      = coinConfig.hasPerp ? this._isValid(raw.oi) && this._isValid(raw.oi5mAgo) : null;
    const fundingValid = coinConfig.hasPerp ? this._isValid(raw.funding) : null;

    const total = [spotValid, perpValid, historyValid, oiValid, fundingValid]
      .filter(v => v !== null);
    const validCount = total.filter(Boolean).length;

    return {
      spotValid,
      perpValid,
      historyValid,
      oiValid,
      fundingValid,
      completeness: total.length > 0 ? validCount / total.length : 0,
      isUsable: spotValid || (perpValid === true),
    };
  },

  /**
   * 机会评分 — 只对有效维度打分，缺失维度权重归零
   */
  opportunityScore(metrics, validity) {
    const w = CONFIG.scoreWeights;
    let totalWeight = 0;
    let weightedSum = 0;

    const dims = [
      { key: 'priceChange5m', raw: metrics.spot5mChange,      scale: 5,   valid: validity.historyValid },
      { key: 'priceChange1h', raw: metrics.spot1hChange,      scale: 10,  valid: validity.historyValid },
      { key: 'volumeRatio',   raw: metrics.volumeRatio,       scale: 3,   valid: metrics.volumeRatio !== null, isRatio: true },
      { key: 'oiChange',      raw: metrics.oiChange5m,        scale: 10,  valid: validity.oiValid === true },
      { key: 'fundingAbs',    raw: metrics.funding,           scale: 0.1, valid: validity.fundingValid === true },
      { key: 'relativeStr',   raw: metrics.relativeStrength,  scale: 5,   valid: metrics.relativeStrength !== null },
    ];

    const breakdown = {};

    for (const d of dims) {
      const weight = w[d.key] || 0;
      if (d.valid && d.raw !== null) {
        const normalized = d.isRatio
          ? Math.min(Math.max((d.raw - 1), 0) / d.scale * 100, 100)
          : Math.min(Math.abs(d.raw) / d.scale * 100, 100);
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

    const spotPrice = this._isValid(raw.spotPrice) ? raw.spotPrice : null;
    const perpPrice = this._isValid(raw.perpPrice) ? raw.perpPrice : null;

    const spot5mChange = validity.historyValid && spotPrice
      ? this.priceChange(spotPrice, raw.price5mAgo) : null;
    const spot1hChange = validity.historyValid && spotPrice
      ? this.priceChange(spotPrice, raw.price1hAgo) : null;

    let perp5mChange = null, perp1hChange = null;
    if (coinConfig.hasPerp && perpPrice && validity.historyValid) {
      perp5mChange = this.priceChange(perpPrice, raw.price5mAgo);
      perp1hChange = this.priceChange(perpPrice, raw.price1hAgo);
    }

    const volRatio   = this.volumeRatio(raw.volume, raw.volumeAvg);
    const oiChange5m = this.oiChange(raw.oi, raw.oi5mAgo);
    const oiChange1h = this.oiChange(raw.oi, raw.oi1hAgo);
    const relStr     = this.relativeStrength(spot5mChange, perp5mChange);

    const funding = this._isValid(raw.funding) ? raw.funding : null;

    const metrics = {
      symbol: raw.symbol,
      spotPrice,
      perpPrice,
      spot5mChange,
      spot1hChange,
      perp5mChange,
      perp1hChange,
      volumeRatio: volRatio,
      oiChange5m,
      oiChange1h,
      funding,
      relativeStrength: relStr,
      timestamp: raw.timestamp,
      validity,
    };

    const { score, breakdown } = this.opportunityScore(metrics, validity);
    metrics.score = score;
    metrics.scoreBreakdown = breakdown;
    return metrics;
  },
};
