/**
 * 信号引擎 v2 — 增加优先级分层、数据有效性守卫
 *
 * priority: 'primary'   → 核心信号，计入活跃统计
 *           'secondary' → 次要信号
 *           'passive'   → 观察/数据不足，不计入活跃统计
 */

const CORE_SIGNAL_KEYS = new Set([
  'spotFirst', 'perpFollow', 'oiPileUp', 'crowdedRisk', 'shortSqueeze'
]);

const SignalEngine = {
  rules: {
    crowdedRisk: {
      name: '高拥挤风险',
      icon: '🔴',
      color: '#f85149',
      priority: 'primary',
      needsValid: ['fundingValid', 'oiValid'],
      evaluate(m) {
        const t = SIGNAL_THRESHOLDS.crowdedRisk;
        return m.funding !== null &&
               Math.abs(m.funding) > t.fundingMin &&
               m.oiChange5m !== null &&
               m.oiChange5m > t.oiChangeMin;
      },
      explain(m) {
        const side = m.funding > 0 ? '多头' : '空头';
        return `Funding ${(m.funding*100).toFixed(4)}% 极端 + OI增长 ${(m.oiChange5m||0).toFixed(2)}%，${side}拥挤，反向清算风险高。`;
      },
      risk: '极端拥挤状态下，反向波动可能非常剧烈，谨慎追单。',
    },

    shortSqueeze: {
      name: '空头回补',
      icon: '🟣',
      color: '#bc8cff',
      priority: 'primary',
      needsValid: ['historyValid', 'oiValid'],
      evaluate(m) {
        const t = SIGNAL_THRESHOLDS.shortSqueeze;
        return m.spot5mChange !== null &&
               m.spot5mChange > t.priceRiseMin &&
               m.oiChange5m !== null &&
               m.oiChange5m < t.oiDropMax;
      },
      explain(m) {
        return `价格涨 ${(m.spot5mChange||0).toFixed(2)}% 同时 OI 降 ${(m.oiChange5m||0).toFixed(2)}%，空头正在平仓回补。`;
      },
      risk: '空头回补结束后上涨动能可能衰竭，注意拐点。',
    },

    spotFirst: {
      name: '现货先动',
      icon: '🟢',
      color: '#3fb950',
      priority: 'primary',
      needsValid: ['historyValid'],
      evaluate(m) {
        const t = SIGNAL_THRESHOLDS.spotFirst;
        return m.spot5mChange !== null &&
               Math.abs(m.spot5mChange) > t.spot5mMin &&
               m.perp5mChange !== null &&
               Math.abs(m.perp5mChange) < t.perp5mMax;
      },
      explain(m) {
        return `现货5m ${(m.spot5mChange||0).toFixed(2)}% 领先合约 ${(m.perp5mChange||0).toFixed(2)}%，合约可能跟随。`;
      },
      risk: '合约不跟随可能是假突破或流动性差异。',
    },

    perpFollow: {
      name: '合约跟动',
      icon: '🔵',
      color: '#58a6ff',
      priority: 'primary',
      needsValid: ['historyValid'],
      evaluate(m) {
        const t = SIGNAL_THRESHOLDS.perpFollow;
        return m.perp5mChange !== null &&
               Math.abs(m.perp5mChange) > t.perp5mMin &&
               m.spot5mChange !== null &&
               Math.abs(m.spot5mChange) > t.spot5mMin &&
               m.spot1hChange !== null &&
               Math.abs(m.spot1hChange) > t.spot1hMin;
      },
      explain(m) {
        return `现货1h ${(m.spot1hChange||0).toFixed(2)}%，合约5m ${(m.perp5mChange||0).toFixed(2)}% 跟动，联动成立。`;
      },
      risk: '合约跟动阶段波动加剧，注意滑点和资金费率。',
    },

    oiPileUp: {
      name: 'OI堆仓',
      icon: '🟡',
      color: '#d29922',
      priority: 'primary',
      needsValid: ['oiValid', 'historyValid'],
      evaluate(m) {
        const t = SIGNAL_THRESHOLDS.oiPileUp;
        return m.oiChange5m !== null &&
               Math.abs(m.oiChange5m) > t.oiChangeMin &&
               m.spot5mChange !== null &&
               Math.abs(m.spot5mChange) < t.priceChangeMax;
      },
      explain(m) {
        return `OI变化 ${(m.oiChange5m||0).toFixed(2)}% 但价格仅动 ${(m.spot5mChange||0).toFixed(2)}%，资金提前布局。`;
      },
      risk: 'OI堆积不一定代表方向，需结合 funding 判断。',
    },

    watching: {
      name: '观察中',
      icon: '👀',
      color: '#8b949e',
      priority: 'passive',
      needsValid: [],
      evaluate(m) {
        const t = SIGNAL_THRESHOLDS.watching;
        return (m.spot5mChange !== null && Math.abs(m.spot5mChange) > t.anyChangeMin) ||
               (m.oiChange5m  !== null && Math.abs(m.oiChange5m)  > t.anyChangeMin) ||
               (m.volumeRatio !== null && m.volumeRatio > 2.0);
      },
      explain() {
        return '出现轻微异动，尚未触发核心信号。';
      },
      risk: '幅度不大，可能是正常波动。',
    },
  },

  /**
   * 评估所有信号规则。
   * 数据不完整时：跳过需要对应数据的主信号，改为标记 dataInsufficient。
   */
  evaluate(metrics) {
    const v = metrics.validity;
    if (!v || !v.isUsable) {
      return [{
        key: 'dataInsufficient', name: '数据不足', icon: '⚠',
        color: '#484f58', priority: 'passive',
        explanation: '该币当前无法获取有效价格数据。', risk: '不可依据此状态做任何判断。',
      }];
    }

    const triggered = [];
    const order = ['crowdedRisk', 'shortSqueeze', 'spotFirst', 'perpFollow', 'oiPileUp', 'watching'];

    for (const ruleKey of order) {
      const rule = this.rules[ruleKey];

      const depsOk = rule.needsValid.every(dep => {
        const val = v[dep];
        return val === true || val === null;
      });
      if (!depsOk) continue;

      if (rule.evaluate(metrics)) {
        triggered.push({
          key: ruleKey,
          name: rule.name,
          icon: rule.icon,
          color: rule.color,
          priority: rule.priority,
          explanation: rule.explain(metrics),
          risk: rule.risk,
        });
      }
    }

    if (triggered.length === 0 && v.completeness < 0.5) {
      triggered.push({
        key: 'dataInsufficient', name: '数据不足', icon: '⚠',
        color: '#484f58', priority: 'passive',
        explanation: `数据完整度仅 ${Math.round(v.completeness * 100)}%，不足以触发信号。`,
        risk: '等待更多数据后再评估。',
      });
    }

    return triggered;
  },
};
