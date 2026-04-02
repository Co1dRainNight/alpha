/**
 * 主应用 v2 — 视图模式、修正信号统计、数据有效性守卫
 */

const App = {
  dataService: null,
  logger: null,
  state: {
    allMetrics: [],
    filteredRows: [],
    search: '',
    signalFilter: 'all',
    viewMode: 'all',
    sortBy: 'score',
    running: false,
    intervalId: null,
    previousSignals: {},
    fetching: false,
    lastFetchTime: null,
    nextFetchTime: null,
    countdownId: null,
    useMock: new URLSearchParams(window.location.search).has('mock'),
    logFilterSymbol: '',
    logFilterSignal: '',
  },

  async init() {
    this.dataService = this.state.useMock
      ? new MockDataService()
      : new BinanceDataService();
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
      const rawAll = this.state.useMock
        ? this.dataService.fetchAll()
        : await this.dataService.fetchAll();

      this.state.allMetrics = [];
      for (const raw of rawAll) {
        if (!raw) continue;
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

    switch (this.state.viewMode) {
      case 'active':
        rows = rows.filter(r => this._hasCoreSignal(r));
        break;
      case 'priority':
        rows = rows.filter(r => {
          const cfg = COIN_POOL.find(c => c.symbol === r.symbol);
          return cfg?.isPriority;
        });
        break;
      case 'top20':
        rows.sort((a, b) => b.score - a.score);
        rows = rows.slice(0, 20);
        break;
      case 'top50':
        rows.sort((a, b) => b.score - a.score);
        rows = rows.slice(0, 50);
        break;
      case 'dataWarn':
        rows = rows.filter(r => !r.validity || r.validity.completeness < 0.6);
        break;
    }

    if (this.state.search) {
      const q = this.state.search.toUpperCase();
      rows = rows.filter(r => r.symbol.includes(q));
    }

    if (this.state.signalFilter !== 'all') {
      rows = rows.filter(r =>
        r.signals && r.signals.some(s => s.key === this.state.signalFilter)
      );
    }

    rows.sort((a, b) => {
      switch (this.state.sortBy) {
        case 'score':    return b.score - a.score;
        case 'change5m': return Math.abs(b.spot5mChange||0) - Math.abs(a.spot5mChange||0);
        case 'change1h': return Math.abs(b.spot1hChange||0) - Math.abs(a.spot1hChange||0);
        case 'volume':   return (b.volumeRatio||0) - (a.volumeRatio||0);
        case 'oi':       return Math.abs(b.oiChange5m||0) - Math.abs(a.oiChange5m||0);
        case 'symbol':   return a.symbol.localeCompare(b.symbol);
        default:         return b.score - a.score;
      }
    });

    this.state.filteredRows = rows;
  },

  _hasCoreSignal(metrics) {
    return metrics.signals && metrics.signals.some(s => CORE_SIGNAL_KEYS.has(s.key));
  },

  _render() {
    const coreSignalCount = this.state.allMetrics
      .filter(m => this._hasCoreSignal(m)).length;
    const dataWarnCount = this.state.allMetrics
      .filter(m => !m.validity || m.validity.completeness < 0.6).length;
    const priorityCoins = COIN_POOL.filter(c => c.isPriority).length;
    const loadedCoins = this.state.allMetrics.length;

    UI.renderStats({
      totalCoins: loadedCoins + '/' + COIN_POOL.length,
      activeSignals: coreSignalCount,
      priorityCoins,
      dataWarnCount,
      lastUpdate: this.state.lastFetchTime
        ? new Date(this.state.lastFetchTime).toLocaleTimeString() : '—',
    });

    UI.renderTable(this.state.filteredRows);
    this._renderLogPanel();
    UI.setDataSource(this.state.useMock ? 'Mock' : 'Live');
  },

  _renderLogPanel() {
    const logs = this.logger.getFiltered({
      symbol:    this.state.logFilterSymbol || undefined,
      signalKey: this.state.logFilterSignal || undefined,
      limit: 100,
    });
    UI.renderLogPanel(logs);
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

    UI.els.sortSelect.addEventListener('change', (e) => {
      this.state.sortBy = e.target.value;
      this._applyFilters();
      UI.renderTable(this.state.filteredRows);
    });

    document.getElementById('view-mode-bar').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-view]');
      if (!btn) return;
      this.state.viewMode = btn.dataset.view;
      document.querySelectorAll('#view-mode-bar .vm-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
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

    const logSymInput = document.getElementById('log-filter-symbol');
    const logSigSelect = document.getElementById('log-filter-signal');
    if (logSymInput) logSymInput.addEventListener('input', (e) => {
      this.state.logFilterSymbol = e.target.value.toUpperCase();
      this._renderLogPanel();
    });
    if (logSigSelect) logSigSelect.addEventListener('change', (e) => {
      this.state.logFilterSignal = e.target.value === 'all' ? '' : e.target.value;
      this._renderLogPanel();
    });

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
