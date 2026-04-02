/**
 * UI 渲染模块 — 负责所有 DOM 操作和交互
 */

const UI = {
  els: {},

  init() {
    this.els = {
      statsBar:      document.getElementById('stats-bar'),
      searchInput:   document.getElementById('search-input'),
      signalFilter:  document.getElementById('signal-filter'),
      priorityToggle:document.getElementById('priority-toggle'),
      sortSelect:    document.getElementById('sort-select'),
      tableBody:     document.getElementById('table-body'),
      detailPanel:   document.getElementById('detail-panel'),
      detailContent: document.getElementById('detail-content'),
      detailClose:   document.getElementById('detail-close'),
      logBody:       document.getElementById('log-body'),
      logPanel:      document.getElementById('log-panel'),
      logToggle:     document.getElementById('log-toggle'),
      overlay:       document.getElementById('overlay'),
      loadingBar:    document.getElementById('loading-bar'),
      fetchStatus:   document.getElementById('fetch-status'),
      dataSourceTag: document.getElementById('data-source'),
    };
  },

  // ========== 加载状态 ==========
  showLoading(show) {
    if (this.els.loadingBar) {
      this.els.loadingBar.classList.toggle('active', show);
    }
  },

  setFetchStatus(msg) {
    if (this.els.fetchStatus) {
      this.els.fetchStatus.textContent = msg || '';
      this.els.fetchStatus.style.display = msg ? 'block' : 'none';
    }
  },

  setDataSource(mode) {
    if (this.els.dataSourceTag) {
      this.els.dataSourceTag.textContent = mode === 'Mock' ? 'MOCK' : 'LIVE';
      this.els.dataSourceTag.className = mode === 'Mock' ? 'source-tag source-mock' : 'source-tag source-live';
    }
  },

  // ========== 顶部统计 ==========
  renderStats(data) {
    const { totalCoins, activeSignals, priorityCoins, lastUpdate } = data;
    this.els.statsBar.innerHTML = `
      <div class="stat-card">
        <div class="stat-value">${totalCoins}</div>
        <div class="stat-label">监控币数</div>
      </div>
      <div class="stat-card stat-highlight">
        <div class="stat-value">${activeSignals}</div>
        <div class="stat-label">活跃信号</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${priorityCoins}</div>
        <div class="stat-label">重点关注</div>
      </div>
      <div class="stat-card">
        <div class="stat-value stat-time">${lastUpdate}</div>
        <div class="stat-label">最近更新</div>
      </div>
    `;
  },

  // ========== 主表格 ==========
  renderTable(rows) {
    if (rows.length === 0) {
      this.els.tableBody.innerHTML = `
        <tr><td colspan="11" class="empty-row">暂无匹配数据</td></tr>`;
      return;
    }

    this.els.tableBody.innerHTML = rows.map(r => {
      const coinCfg = COIN_POOL.find(c => c.symbol === r.symbol);
      const priorityBadge = coinCfg?.isPriority
        ? '<span class="badge badge-priority">★</span>' : '';
      const tagBadges = (coinCfg?.tags || [])
        .map(t => `<span class="badge badge-tag">${t}</span>`).join('');
      const signalBadges = (r.signals || [])
        .map(s => `<span class="badge" style="background:${s.color}20;color:${s.color};border:1px solid ${s.color}40">${s.icon} ${s.name}</span>`).join('');

      return `
        <tr class="table-row ${coinCfg?.isPriority ? 'row-priority' : ''}" data-symbol="${r.symbol}">
          <td class="col-symbol">
            <span class="symbol-name">${r.symbol}</span>
            ${priorityBadge}
            <div class="symbol-tags">${tagBadges}</div>
          </td>
          <td class="col-price">${this.fmtPrice(r.spotPrice)}</td>
          <td class="col-price">${r.perpPrice !== null ? this.fmtPrice(r.perpPrice) : '<span class="na">—</span>'}</td>
          <td class="col-change ${this.changeClass(r.spot5mChange)}">${this.fmtPct(r.spot5mChange)}</td>
          <td class="col-change ${this.changeClass(r.spot1hChange)}">${this.fmtPct(r.spot1hChange)}</td>
          <td class="col-vol ${r.volumeRatio > 2 ? 'vol-high' : ''}">${r.volumeRatio.toFixed(2)}x</td>
          <td class="col-change ${this.changeClass(r.oiChange5m)}">${r.oiChange5m !== null ? this.fmtPct(r.oiChange5m) : '<span class="na">—</span>'}</td>
          <td class="col-funding ${this.fundingClass(r.funding)}">${r.funding !== null ? (r.funding * 100).toFixed(4) + '%' : '<span class="na">—</span>'}</td>
          <td class="col-score"><div class="score-bar"><div class="score-fill" style="width:${r.score}%;background:${this.scoreColor(r.score)}"></div><span class="score-text">${r.score}</span></div></td>
          <td class="col-signals"><div class="signal-badges">${signalBadges || '<span class="na">—</span>'}</div></td>
          <td class="col-action"><button class="btn-detail" data-symbol="${r.symbol}">详情</button></td>
        </tr>`;
    }).join('');
  },

  // ========== 单币详情侧边栏 ==========
  showDetail(symbol, metrics, signals, coinCfg, recentLogs) {
    const m = metrics;
    const signalHtml = signals.length > 0
      ? signals.map(s => `
          <div class="detail-signal" style="border-left:3px solid ${s.color}">
            <div class="detail-signal-name">${s.icon} ${s.name}</div>
            <div class="detail-signal-explain">${s.explanation}</div>
            <div class="detail-signal-risk">⚠ ${s.risk}</div>
          </div>`).join('')
      : '<div class="detail-empty">当前无活跃信号</div>';

    const scoreReasons = this._buildScoreReasons(m);

    const logsHtml = recentLogs.length > 0
      ? recentLogs.slice(0, 10).map(l => `
          <div class="log-entry-mini">
            <span class="log-time">${new Date(l.timestamp).toLocaleTimeString()}</span>
            <span class="log-signal" style="color:${SignalEngine.rules[l.signalKey]?.color || '#8b949e'}">${l.signalType}</span>
            <span class="log-price">$${Number(l.spotPrice).toFixed(6)}</span>
          </div>`).join('')
      : '<div class="detail-empty">暂无历史信号记录</div>';

    this.els.detailContent.innerHTML = `
      <div class="detail-header">
        <h2>${symbol} ${coinCfg.isPriority ? '★' : ''}</h2>
        <div class="detail-tags">${(coinCfg.tags||[]).map(t => `<span class="badge badge-tag">${t}</span>`).join('')}</div>
        <div class="detail-meta">
          ${coinCfg.isAlpha ? '<span class="badge badge-alpha">Alpha</span>' : ''}
          ${coinCfg.hasPerp ? '<span class="badge badge-perp">Perp</span>' : ''}
        </div>
      </div>

      <div class="detail-section">
        <h3>实时数据</h3>
        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-label">现货价格</span>
            <span class="detail-value">${this.fmtPrice(m.spotPrice)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">合约价格</span>
            <span class="detail-value">${m.perpPrice !== null ? this.fmtPrice(m.perpPrice) : '—'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">5m 变化</span>
            <span class="detail-value ${this.changeClass(m.spot5mChange)}">${this.fmtPct(m.spot5mChange)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">1h 变化</span>
            <span class="detail-value ${this.changeClass(m.spot1hChange)}">${this.fmtPct(m.spot1hChange)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">合约 5m</span>
            <span class="detail-value ${this.changeClass(m.perp5mChange)}">${m.perp5mChange !== null ? this.fmtPct(m.perp5mChange) : '—'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Volume Ratio</span>
            <span class="detail-value ${m.volumeRatio > 2 ? 'vol-high' : ''}">${m.volumeRatio.toFixed(2)}x</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">OI 5m 变化</span>
            <span class="detail-value ${this.changeClass(m.oiChange5m)}">${m.oiChange5m !== null ? this.fmtPct(m.oiChange5m) : '—'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">OI 1h 变化</span>
            <span class="detail-value ${this.changeClass(m.oiChange1h)}">${m.oiChange1h !== null ? this.fmtPct(m.oiChange1h) : '—'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Funding Rate</span>
            <span class="detail-value ${this.fundingClass(m.funding)}">${m.funding !== null ? (m.funding * 100).toFixed(4) + '%' : '—'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">相对强弱</span>
            <span class="detail-value ${this.changeClass(m.relativeStrength)}">${m.relativeStrength !== null ? m.relativeStrength.toFixed(2) : '—'}</span>
          </div>
        </div>
      </div>

      <div class="detail-section">
        <h3>机会评分：${m.score}/100</h3>
        <div class="score-bar-large"><div class="score-fill" style="width:${m.score}%;background:${this.scoreColor(m.score)}"></div></div>
        <div class="score-reasons">${scoreReasons}</div>
      </div>

      <div class="detail-section">
        <h3>当前信号</h3>
        ${signalHtml}
      </div>

      <div class="detail-section">
        <h3>最近信号记录</h3>
        <div class="detail-logs">${logsHtml}</div>
      </div>
    `;

    this.els.detailPanel.classList.add('open');
    this.els.overlay.classList.add('visible');
  },

  hideDetail() {
    this.els.detailPanel.classList.remove('open');
    this.els.overlay.classList.remove('visible');
  },

  // ========== 信号日志面板 ==========
  renderLogPanel(logs) {
    if (logs.length === 0) {
      this.els.logBody.innerHTML = '<div class="detail-empty">暂无信号日志</div>';
      return;
    }
    this.els.logBody.innerHTML = logs.slice(0, 100).map(l => `
      <div class="log-row">
        <span class="log-time">${new Date(l.timestamp).toLocaleString()}</span>
        <span class="log-symbol">${l.symbol}</span>
        <span class="log-signal" style="color:${SignalEngine.rules[l.signalKey]?.color || '#8b949e'}">${l.signalType}</span>
        <span class="log-price">$${Number(l.spotPrice).toFixed(6)}</span>
        <span class="log-score">${l.score}</span>
        <span class="log-detail">${l.explanation.slice(0, 60)}...</span>
      </div>
    `).join('');
  },

  toggleLogPanel() {
    this.els.logPanel.classList.toggle('open');
  },

  // ========== 工具方法 ==========
  _buildScoreReasons(m) {
    const reasons = [];
    if (Math.abs(m.spot5mChange) > 1)
      reasons.push(`<div class="reason">5m价格变化 ${this.fmtPct(m.spot5mChange)} 贡献波动分</div>`);
    if (Math.abs(m.spot1hChange) > 2)
      reasons.push(`<div class="reason">1h趋势 ${this.fmtPct(m.spot1hChange)} 贡献趋势分</div>`);
    if (m.volumeRatio > 1.5)
      reasons.push(`<div class="reason">成交量 ${m.volumeRatio.toFixed(2)}x 高于均值</div>`);
    if (m.oiChange5m !== null && Math.abs(m.oiChange5m) > 2)
      reasons.push(`<div class="reason">OI变化 ${this.fmtPct(m.oiChange5m)} 有资金流动</div>`);
    if (m.funding !== null && Math.abs(m.funding) > 0.02)
      reasons.push(`<div class="reason">Funding ${(m.funding*100).toFixed(4)}% 偏离中性</div>`);
    if (m.relativeStrength !== null && Math.abs(m.relativeStrength) > 1)
      reasons.push(`<div class="reason">现货/合约相对强弱差 ${m.relativeStrength.toFixed(2)}</div>`);

    return reasons.length > 0 ? reasons.join('') : '<div class="reason">各维度暂无突出表现</div>';
  },

  fmtPrice(p) {
    if (p === null || p === undefined) return '<span class="na">—</span>';
    if (p < 0.001)  return '$' + p.toFixed(8);
    if (p < 0.01)   return '$' + p.toFixed(6);
    if (p < 1)      return '$' + p.toFixed(4);
    if (p < 1000)   return '$' + p.toFixed(2);
    return '$' + p.toLocaleString(undefined, { maximumFractionDigits: 2 });
  },

  fmtPct(v) {
    if (v === null || v === undefined) return '—';
    const sign = v >= 0 ? '+' : '';
    return sign + v.toFixed(2) + '%';
  },

  changeClass(v) {
    if (v === null || v === undefined) return '';
    if (v > 0.5) return 'change-up';
    if (v < -0.5) return 'change-down';
    return 'change-flat';
  },

  fundingClass(f) {
    if (f === null) return '';
    if (f > 0.03) return 'funding-high';
    if (f < -0.03) return 'funding-low';
    return 'funding-neutral';
  },

  scoreColor(s) {
    if (s >= 70) return '#f85149';
    if (s >= 40) return '#d29922';
    return '#3fb950';
  },
};
