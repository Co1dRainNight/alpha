/**
 * 币安 Alpha + Perp 联动监控看板 — 全局配置 v3
 * 
 * COIN_POOL 现在由 BinanceDataService 动态生成
 */

const CONFIG = {
  updateInterval: 15 * 60 * 1000, // 轮询间隔 15 分钟
  historyWindow: 60,        // 历史数据保留分钟数
  maxLogEntries: 500,       // 最大日志保留条数
  maxCoins: 150,           // 最大监控币种数量
  scoreWeights: {
    priceChange5m: 0.20,
    priceChange1h: 0.15,
    volumeRatio:   0.20,
    oiChange:      0.15,
    fundingAbs:    0.10,
    relativeStr:   0.10,
    longShortRatio: 0.10,  // 新增：主动资金权重
  },
};

// 信号阈值配置
const SIGNAL_THRESHOLDS = {
  spotFirst: {
    spot5mMin:  2.0,   // 现货 5m 涨幅 > 2%
    perp5mMax:  0.8,   // 合约 5m 涨幅 < 0.8%
  },
  perpFollow: {
    perp5mMin:  1.5,   // 合约 5m 涨幅 > 1.5%
    spot5mMin:  2.0,   // 现货 5m 涨幅 > 2%（已先动）
    spot1hMin:  3.0,   // 现货 1h 涨幅 > 3%
  },
  oiPileUp: {
    oiChangeMin:    5.0,  // OI 变化 > 5%
    priceChangeMax: 1.0,  // 价格变化 < 1%（价格平稳但 OI 堆积）
  },
  crowdedRisk: {
    fundingMin:  0.05,   // funding rate > 0.05%
    oiChangeMin: 8.0,    // OI 变化 > 8%
  },
  shortSqueeze: {
    priceRiseMin:  2.0,  // 价格上涨 > 2%
    oiDropMax:    -3.0,  // OI 下降 > 3%（空头平仓）
  },
  watching: {
    anyChangeMin: 1.0,   // 任何维度出现 > 1% 变化即进入观察
  },
};

// 核心信号标记（计入活跃统计）
const CORE_SIGNAL_KEYS = new Set([
  'spotFirst', 'perpFollow', 'oiPileUp', 'crowdedRisk', 'shortSqueeze'
]);

/**
 * 注意：COIN_POOL 现在由 BinanceDataService 动态生成
 * 运行时调用 BinanceDataService.init() 会自动获取并筛选币种
 */

// 备用基础币种（当 API 不可用时使用）
const FALLBACK_COIN_POOL = [
  { symbol: 'BTC', isAlpha: false, hasPerp: true, alphaPair: 'BTCUSDT', perpContract: 'BTCUSDT', isPriority: true, tags: ['BTC'] },
  { symbol: 'ETH', isAlpha: false, hasPerp: true, alphaPair: 'ETHUSDT', perpContract: 'ETHUSDT', isPriority: true, tags: ['ETH'] },
  { symbol: 'BNB', isAlpha: false, hasPerp: true, alphaPair: 'BNBUSDT', perpContract: 'BNBUSDT', isPriority: true, tags: ['BNB'] },
  { symbol: 'SOL', isAlpha: false, hasPerp: true, alphaPair: 'SOLUSDT', perpContract: 'SOLUSDT', isPriority: true, tags: ['SOL'] },
];
