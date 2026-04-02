/**
 * 信号引擎 — 基于规则的信号识别，所有阈值可配置
 */

const SignalEngine = {
  rules: {
    spotFirst: {
      name: '现货先动',
      icon: '🟢',
      color: '#3fb950',
      evaluate(m) {
        const t = SIGNAL_THRESHOLDS.spotFirst;
        return Math.abs(m.spot5mChange) > t.spot5mMin &&
               m.perp5mChange !== null &&
               Math.abs(m.perp5mChange) < t.perp5mMax;
      },
      explain(m) {
        return `现货5m变动 ${m.spot5mChange.toFixed(2)}% 显著领先合约 ${(m.perp5mChange||0).toFixed(2)}%，` +
               `合约可能即将跟随补涨/补跌。`;
      },
      risk: '如果合约不跟随，可能是假突破或流动性差异导致。',
    },

    perpFollow: {
      name: '合约跟动',
      icon: '🔵',
      color: '#58a6ff',
      evaluate(m) {
        const t = SIGNAL_THRESHOLDS.perpFollow;
        return m.perp5mChange !== null &&
               Math.abs(m.perp5mChange) > t.perp5mMin &&
               Math.abs(m.spot5mChange) > t.spot5mMin &&
               Math.abs(m.spot1hChange) > t.spot1hMin;
      },
      explain(m) {
        return `现货1h已涨 ${m.spot1hChange.toFixed(2)}%，合约5m涨 ${(m.perp5mChange||0).toFixed(2)}% 开始跟动，` +
               `联动结构成立，可能加速。`;
      },
      risk: '合约跟动阶段波动加剧，注意滑点和资金费率变化。',
    },

    oiPileUp: {
      name: 'OI提前堆仓',
      icon: '🟡',
      color: '#d29922',
      evaluate(m) {
        const t = SIGNAL_THRESHOLDS.oiPileUp;
        return m.oiChange5m !== null &&
               Math.abs(m.oiChange5m) > t.oiChangeMin &&
               Math.abs(m.spot5mChange) < t.priceChangeMax;
      },
      explain(m) {
        return `OI 5m变化 ${(m.oiChange5m||0).toFixed(2)}% 但价格仅动 ${m.spot5mChange.toFixed(2)}%，` +
               `有资金在提前布局，可能酝酿大波动。`;
      },
      risk: 'OI 堆积不一定代表方向，需结合 funding 判断多空倾向。',
    },

    crowdedRisk: {
      name: '高拥挤风险',
      icon: '🔴',
      color: '#f85149',
      evaluate(m) {
        const t = SIGNAL_THRESHOLDS.crowdedRisk;
        return m.funding !== null &&
               Math.abs(m.funding) > t.fundingMin &&
               m.oiChange5m !== null &&
               m.oiChange5m > t.oiChangeMin;
      },
      explain(m) {
        const side = m.funding > 0 ? '多头' : '空头';
        return `Funding ${(m.funding*100).toFixed(4)}% 极端 + OI持续增长 ${(m.oiChange5m||0).toFixed(2)}%，` +
               `${side}拥挤，反向清算风险高。`;
      },
      risk: '极端拥挤状态下，反向波动可能非常剧烈，谨慎追单。',
    },

    shortSqueeze: {
      name: '空头回补',
      icon: '🟣',
      color: '#bc8cff',
      evaluate(m) {
        const t = SIGNAL_THRESHOLDS.shortSqueeze;
        return m.spot5mChange > t.priceRiseMin &&
               m.oiChange5m !== null &&
               m.oiChange5m < t.oiDropMax;
      },
      explain(m) {
        return `价格上涨 ${m.spot5mChange.toFixed(2)}% 同时 OI 下降 ${(m.oiChange5m||0).toFixed(2)}%，` +
               `空头正在平仓回补，可能继续逼空。`;
      },
      risk: '空头回补结束后上涨动能可能衰竭，注意回补完成的拐点。',
    },

    watching: {
      name: '观察中',
      icon: '👀',
      color: '#8b949e',
      evaluate(m) {
        const t = SIGNAL_THRESHOLDS.watching;
        return Math.abs(m.spot5mChange) > t.anyChangeMin ||
               (m.oiChange5m !== null && Math.abs(m.oiChange5m) > t.anyChangeMin) ||
               (m.volumeRatio > 1.5);
      },
      explain(m) {
        return `该币出现轻微异动（价格/OI/成交量），尚未触发明确信号，建议持续关注。`;
      },
      risk: '异动幅度不大，可能是正常波动，不建议仅凭此操作。',
    },
  },

  /**
   * 对一组 metrics 评估所有信号规则
   * 返回触发的信号数组（优先级从高到低）
   */
  evaluate(metrics) {
    const triggered = [];
    const priority = ['crowdedRisk', 'shortSqueeze', 'spotFirst', 'perpFollow', 'oiPileUp', 'watching'];

    for (const ruleKey of priority) {
      const rule = this.rules[ruleKey];
      if (rule.evaluate(metrics)) {
        triggered.push({
          key: ruleKey,
          name: rule.name,
          icon: rule.icon,
          color: rule.color,
          explanation: rule.explain(metrics),
          risk: rule.risk,
        });
      }
    }
    return triggered;
  },
};
