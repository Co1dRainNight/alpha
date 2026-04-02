/**
 * 主应用 — 状态管理、异步主循环、事件绑定
 */

const App = {
  dataService: null,
  logger: null,
  state: {
    allMetrics: [],
    filteredRows: [],
    search: '',
    signalFilter: 'all',
    priorityOnly: false,
    sortBy: 'score',
    running: false,
    intervalId: null,
    previousSignals: {},
    fetching: false,
    lastFetchTime: null,
    nextFetchTime: null,
    countdownId: null,
    useMock: new URLSearchParams(window.location.search).has('mock'),
  },

  async init() {
    if (this.state.useMock) {
      this.dataService = new MockDataService();
    } else {
      this.dataService = new BinanceDataService();
    }
    this.logger = new SignalLogger();
    UI.init();
    this._bindEvents();

    window.__setFetchStatus = (msg) => UI.setFetchStatus(msg);

    await this._tick();
    this.state.running = true;
    this.state.intervalId = setInterval(() => this._tick(), CONFIG.updateInterval);
    this._startCountdown();
  },

  async _tick() {
    if (this.state.fetching) return;
    this.state.fetching = true;
    UI.showLoading(true);

    try {
      let rawAll;
      if (this.state.useMock) {
        rawAll = this.dataService.fetchAll();
      } else {
        rawAll = await this.dataService.fetchAll();
      }

      this.state.allMetrics = [];
      for (const raw of rawAll) {
        if (!raw || (raw.spotPrice === null && raw.perpPrice === null)) continue;
        const coinCfg = COIN_POOL.find(c => c.symbol === raw.symbol);
        if (!coinCfg) continue;

        const metrics = Calculator.compute(raw, coinCfg);
        const signals = SignalEngine.evaluate(metrics);
        metrics.signals = signals;

        const prevKeys = this.state.previousSignals[raw.symbol] || new Set();
        const newKeys = new Set(signals.map(s => s.key));
        for (const sig of signals) {
          if (!prevKeys.has(sig.key)) {
            this.logger.add(metrics, sig);
          }
        }
        this.state.previousSignals[raw.symbol] = newKeys;
        this.state.allMetrics.push(metrics);
      }

      this.state.lastFetchTime = Date.now();
      this.state.nextFetchTime = Date.now() + CONFIG.updateInterval;
    } catch (err) {
      console.error('Tick error:', err);
    }

    this.state.fetching = false;
    UI.showLoading(false);
    this._applyFilters();
    this._render();
  },

  _applyFilters() {
    let rows = [...this.state.allMetrics];

    if (this.state.search) {
      const q = this.state.search.toUpperCase();
      rows = rows.filter(r => r.symbol.includes(q));
    }

    if (this.state.signalFilter !== 'all') {
      rows = rows.filter(r =>
        r.signals && r.signals.some(s => s.key === this.state.signalFilter)
      );
    }

    if (this.state.priorityOnly) {
      const ps = new Set(COIN_POOL.filter(c => c.isPriority).map(c => c.symbol));
      rows = rows.filter(r => ps.has(r.symbol));
    }

    rows.sort((a, b) => {
      switch (this.state.sortBy) {
        case 'score':    return b.score - a.score;
        case 'change5m': return Math.abs(b.spot5mChange) - Math.abs(a.spot5mChange);
        case 'change1h': return Math.abs(b.spot1hChange) - Math.abs(a.spot1hChange);
        case 'volume':   return b.volumeRatio - a.volumeRatio;
        case 'oi':       return Math.abs(b.oiChange5m||0) - Math.abs(a.oiChange5m||0);
        case 'symbol':   return a.symbol.localeCompare(b.symbol);
        default:         return b.score - a.score;
      }
    });

    this.state.filteredRows = rows;
  },

  _render() {
    const activeSignals = this.state.allMetrics
      .reduce((sum, m) => sum + (m.signals && m.signals.length > 0 ? 1 : 0), 0);
    const priorityCoins = COIN_POOL.filter(c => c.isPriority).length;
    const loadedCoins = this.state.allMetrics.length;
    const timeStr = this.state.lastFetchTime
      ? new Date(this.state.lastFetchTime).toLocaleTimeString()
      : '—';

    UI.renderStats({
      totalCoins: loadedCoins + '/' + COIN_POOL.length,
      activeSignals,
      priorityCoins,
      lastUpdate: timeStr,
    });

    UI.renderTable(this.state.filteredRows);
    UI.renderLogPanel(this.logger.getRecent(100));
    UI.setDataSource(this.state.useMock ? 'Mock' : 'Live');
  },

  _bindEvents() {
    UI.els.searchInput.addEventListener('input', (e) => {
      this.state.search = e.target.value;
      this._applyFilters();
      UI.renderTable(this.state.filteredRows);
    });

    UI.els.signalFilter.addEventListener('change', (e) => {
      this.state.signalFilter = e.target.value;
      this._applyFilters();
      UI.renderTable(this.state.filteredRows);
    });

    UI.els.priorityToggle.addEventListener('click', () => {
      this.state.priorityOnly = !this.state.priorityOnly;
      UI.els.priorityToggle.classList.toggle('active', this.state.priorityOnly);
      this._applyFilters();
      UI.renderTable(this.state.filteredRows);
    });

    UI.els.sortSelect.addEventListener('change', (e) => {
      this.state.sortBy = e.target.value;
      this._applyFilters();
      UI.renderTable(this.state.filteredRows);
    });

    UI.els.tableBody.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-detail');
      const row = e.target.closest('.table-row');
      const symbol = btn?.dataset.symbol || row?.dataset.symbol;
      if (symbol) this._openDetail(symbol);
    });

    UI.els.detailClose.addEventListener('click', () => UI.hideDetail());
    UI.els.overlay.addEventListener('click', () => UI.hideDetail());
    UI.els.logToggle.addEventListener('click', () => UI.toggleLogPanel());

    document.getElementById('btn-refresh').addEventListener('click', () => {
      if (!this.state.fetching) {
        clearInterval(this.state.intervalId);
        this._tick().then(() => {
          this.state.intervalId = setInterval(() => this._tick(), CONFIG.updateInterval);
          this._startCountdown();
        });
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') UI.hideDetail();
    });
  },

  _openDetail(symbol) {
    const metrics = this.state.allMetrics.find(m => m.symbol === symbol);
    const coinCfg = COIN_POOL.find(c => c.symbol === symbol);
    if (!metrics || !coinCfg) return;
    const recentLogs = this.logger.getBySymbol(symbol, 20);
    UI.showDetail(symbol, metrics, metrics.signals || [], coinCfg, recentLogs);
  },

  _startCountdown() {
    if (this.state.countdownId) clearInterval(this.state.countdownId);
    this.state.countdownId = setInterval(() => {
      if (!this.state.nextFetchTime) return;
      const remaining = Math.max(0, this.state.nextFetchTime - Date.now());
      const min = Math.floor(remaining / 60000);
      const sec = Math.floor((remaining % 60000) / 1000);
      const el = document.getElementById('countdown');
      if (el) el.textContent = `${min}:${String(sec).padStart(2, '0')}`;
    }, 1000);
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
