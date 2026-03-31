/**
 * 币安真实 API 数据服务
 * 仅使用公开市场数据接口，无需 API Key
 *
 * 接口说明：
 *   现货  https://api.binance.com/api/v3/*
 *   合约  https://fapi.binance.com/fapi/v1/*
 */

class BinanceDataService {
  constructor() {
    this.SPOT    = 'https://api.binance.com';
    this.FUTURES = 'https://fapi.binance.com';

    this._oiHistory  = {};  // symbol -> [{value, ts}]
    this._volHistory = {};  // symbol -> [quoteVolume]
    this._errors     = {};  // symbol -> last error message
    this._fetchCount = 0;
  }

  /* ====== 主入口：拉取全部币种数据 ====== */
  async fetchAll() {
    this._fetchCount++;
    const setStatus = window.__setFetchStatus || (() => {});
    setStatus('正在获取全局行情...');

    let spotMap = {}, futuresMap = {}, fundingMap = {};

    try {
      const [spotRes, futuresRes, fundingRes] = await Promise.allSettled([
        this._get(`${this.SPOT}/api/v3/ticker/24hr`),
        this._get(`${this.FUTURES}/fapi/v1/ticker/24hr`),
        this._get(`${this.FUTURES}/fapi/v1/premiumIndex`),
      ]);

      spotMap    = this._index(this._val(spotRes));
      futuresMap = this._index(this._val(futuresRes));
      fundingMap = this._index(this._val(fundingRes));
    } catch (e) {
      console.error('[Binance] Batch fetch failed:', e);
    }

    const results = [];
    const BATCH = 6;

    for (let i = 0; i < COIN_POOL.length; i += BATCH) {
      setStatus(`获取详情 ${Math.min(i + BATCH, COIN_POOL.length)}/${COIN_POOL.length} ...`);
      const slice = COIN_POOL.slice(i, i + BATCH);

      const batch = await Promise.allSettled(
        slice.map(c => this._coinData(c, spotMap, futuresMap, fundingMap))
      );

      batch.forEach(r => {
        if (r.status === 'fulfilled' && r.value) results.push(r.value);
      });

      if (i + BATCH < COIN_POOL.length) await this._sleep(250);
    }

    setStatus(null);
    return results;
  }

  /* ====== 单币详细数据 ====== */
  async _coinData(coin, spotMap, futuresMap, fundingMap) {
    const sym = coin.symbol;
    this._errors[sym] = null;

    try {
      const spotTk   = spotMap[coin.alphaPair]    || null;
      const futuresTk = coin.hasPerp ? (futuresMap[coin.perpContract] || null) : null;
      const fundingTk = coin.hasPerp ? (fundingMap[coin.perpContract] || null) : null;

      const spotPrice = spotTk   ? +spotTk.lastPrice   : null;
      const perpPrice = futuresTk ? +futuresTk.lastPrice : null;
      const volume    = spotTk   ? +spotTk.quoteVolume  : (futuresTk ? +futuresTk.quoteVolume : 0);

      // 5m K 线 → 获取 5m / 1h 变化
      let price5mAgo = null, price1hAgo = null;
      const klinesSymbol = spotTk ? coin.alphaPair : (futuresTk ? coin.perpContract : null);
      const klinesBase   = spotTk ? this.SPOT : this.FUTURES;
      const klinesPath   = spotTk ? '/api/v3/klines' : '/fapi/v1/klines';

      if (klinesSymbol) {
        try {
          const kl = await this._get(
            `${klinesBase}${klinesPath}?symbol=${klinesSymbol}&interval=5m&limit=13`
          );
          if (Array.isArray(kl) && kl.length >= 2) {
            price5mAgo = +kl[kl.length - 2][4];
          }
          if (Array.isArray(kl) && kl.length >= 12) {
            price1hAgo = +kl[0][4];
          }
        } catch (_) { /* klines 可选 */ }
      }

      // OI（持仓量，以 USDT 计）
      let oi = null;
      if (coin.hasPerp && perpPrice) {
        try {
          const oiRes = await this._get(
            `${this.FUTURES}/fapi/v1/openInterest?symbol=${coin.perpContract}`
          );
          if (oiRes && oiRes.openInterest) {
            oi = (+oiRes.openInterest) * perpPrice;
          }
        } catch (_) { /* OI 可选 */ }
      }

      // OI 历史追踪
      const { oi5mAgo, oi1hAgo } = this._trackOI(sym, oi);

      // 成交量历史追踪
      const volumeAvg = this._trackVolume(sym, volume);

      // Funding Rate
      const funding = fundingTk ? +fundingTk.lastFundingRate : null;

      const refPrice = spotPrice || perpPrice;
      return {
        symbol: sym,
        spotPrice,
        perpPrice,
        volume,
        oi,
        funding,
        price5mAgo:  price5mAgo  ?? refPrice,
        price1hAgo:  price1hAgo  ?? refPrice,
        oi5mAgo,
        oi1hAgo,
        volumeAvg:   volumeAvg || volume || 1,
        timestamp:   Date.now(),
      };
    } catch (e) {
      this._errors[sym] = e.message;
      console.warn(`[${sym}] fetch error:`, e.message);
      return null;
    }
  }

  /* ====== OI / Volume 历史管理 ====== */
  _trackOI(sym, oi) {
    let oi5mAgo = null, oi1hAgo = null;
    if (oi === null) return { oi5mAgo, oi1hAgo };

    if (!this._oiHistory[sym]) this._oiHistory[sym] = [];
    const h = this._oiHistory[sym];
    h.push({ value: oi, ts: Date.now() });
    if (h.length > 6) h.splice(0, h.length - 6);

    if (h.length >= 2) oi5mAgo = h[h.length - 2].value;
    if (h.length >= 4) oi1hAgo = h[0].value;
    return { oi5mAgo, oi1hAgo };
  }

  _trackVolume(sym, vol) {
    if (!this._volHistory[sym]) this._volHistory[sym] = [];
    const h = this._volHistory[sym];
    if (vol > 0) h.push(vol);
    if (h.length > 10) h.splice(0, h.length - 10);
    if (h.length === 0) return vol;
    return h.reduce((a, b) => a + b, 0) / h.length;
  }

  /* ====== 工具方法 ====== */
  async _get(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  }

  _index(arr) {
    const m = {};
    if (Array.isArray(arr)) arr.forEach(o => { if (o && o.symbol) m[o.symbol] = o; });
    return m;
  }

  _val(settled) {
    return settled.status === 'fulfilled' ? settled.value : [];
  }

  _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  getErrors() {
    return { ...this._errors };
  }
}
