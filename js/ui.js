/**
 * UI 渲染模块 v2 — 精简主表、增强详情、研究型日志
 */

const UI = {
  els: {},

  init() {
    this.els = {
      statsBar:      document.getElementById('stats-bar'),
      searchInput:   document.getElementById('search-input'),
      signalFilter:  document.getElementById('signal-filter'),
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

  showLoading(show) {
    if (this.els.loadingBar) this.els.loadingBar.classList.toggle('active', show);
  },
  setFetchStatus(msg) {
    if (this.els.fetchStatus) {
      this.els.fetchStatus.textContent = msg || '';
      this.els.fetchStatus.style.display = msg ? 'inline' : 'none';
    }
  },
  setDataSource(mode) {
    if (this.els.dataSourceTag) {
      this.els.dataSourceTag.textContent = mode === 'Mock' ? 'MOCK' : 'LIVE';
      this.els.dataSourceTag.className = mode === 'Mock' ? 'source-tag source-mock' : 'source-tag source-live';
    }
  },

  // ========== 统计卡片 ==========
  renderStats(data) {
    this.els.statsBar.innerHTML = `
      <div class="stat-card">
        <div class="stat-value">${data.totalCoins}</div>
        <div class="stat-label">监控币数</div>
      </div>
      <div class="stat-card stat-highlight">
        <div class="stat-value">${data.activeSignals}</div>
        <div class="stat-label">核心信号</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${data.priorityCoins}</div>
        <div class="stat-label">重点关注</div>
      </div>
      <div class="stat-card ${data.dataWarnCount > 0 ? 'stat-warn' : ''}">
        <div class="stat-value">${data.dataWarnCount}</div>
        <div class="stat-label">数据异常</div>
      </div>
      <div class="stat-card">
        <div class="stat-value stat-time">${data.lastUpdate}</div>
        <div class="stat-label">最近更新</div>
      </div>
    `;
  },

  // ========== 精简主表 ==========
  renderTable(rows) {
    if (rows.length === 0) {
      this.els.tableBody.innerHTML = '<tr><td colspan="8" class="empty-row">暂无匹配数据</td></tr>';
      return;
    }

    this.els.tableBody.innerHTML = rows.map(r => {
      const coinCfg = COIN_POOL.find(c => c.symbol === r.symbol);
      const isPriority = coinCfg?.isPriority;
      const v = r.validity || {};
      const isDataWarn = !v.isUsable || v.completeness < 0.5;

      const topSignal = this._topSignal(r.signals);
      const signalHtml = topSignal
        ? `<span class="badge sig-badge" style="background:${topSignal.color}15;color:${topSignal.color};border:1px solid ${topSignal.color}30">${topSignal.icon} ${topSignal.name}</span>`
        : '<span class="na">—</span>';

      const rowCls = [
        'table-row',
        isPriority ? 'row-priority' : '',
        isDataWarn ? 'row-data-warn' : '',
      ].filter(Boolean).join(' ');

      return `
        <tr class="${rowCls}" data-symbol="${r.symbol}">
          <td class="col-symbol">
            <span class="symbol-name">${r.symbol}</span>
            ${isPriority ? '<span class="badge badge-priority">★</span>' : ''}
            ${isDataWarn ? '<span class="badge badge-warn">⚠</span>' : ''}
          </td>
          <td class="col-change ${this.changeClass(r.spot5mChange)}">${this.fmtPctSafe(r.spot5mChange)}</td>
          <td class="col-change ${this.changeClass(r.spot1hChange)}">${this.fmtPctSafe(r.spot1hChange)}</td>
          <td class="col-change ${this.changeClass(r.oiChange5m)}">${this.fmtPctSafe(r.oiChange5m)}</td>
          <td class="col-funding ${this.fundingClass(r.funding)}">${this.fmtFunding(r.funding)}</td>
          <td class="col-score"><div class="score-bar"><div class="score-fill" style="width:${r.score}%;background:${this.scoreColor(r.score)}"></div><span class="score-text">${r.score}</span></div></td>
          <td class="col-signals">${signalHtml}</td>
          <td class="col-action"><button class="btn-detail" data-symbol="${r.symbol}">详情</button></td>
        </tr>`;
    }).join('');
  },

  _topSignal(signals) {
    if (!signals || signals.length === 0) return null;
    const core = signals.find(s => s.priority === 'primary');
    if (core) return core;
    const secondary = signals.find(s => s.priority === 'secondary');
    if (secondary) return secondary;
    return null;
  },

  // ========== 增强详情侧边栏 ==========
  showDetail(symbol, metrics, signals, coinCfg, recentLogs) {
    const m = metrics;
    const v = m.validity || {};

    const conclusionTag = this._conclusionTag(m, v);
    const validityHtml = this._validityHtml(v);
    const scoreBreakdownHtml = this._scoreBreakdownHtml(m);

    const signalHtml = signals.length > 0
      ? signals.map(s => `
          <div class="detail-signal" style="border-left:3px solid ${s.color}">
            <div class="detail-signal-name">${s.icon} ${s.name} <span class="sig-priority sig-${s.priority}">${s.priority}</span></div>
            <div class="detail-signal-explain">${s.explanation}</div>
            <div class="detail-signal-risk">⚠ ${s.risk}</div>
          </div>`).join('')
      : '<div class="detail-empty">当前无活跃信号</div>';

    const logsHtml = recentLogs.length > 0
      ? recentLogs.slice(0, 5).map(l => {
          const p = l.spotPrice || l.perpPrice;
          return `
          <div class="log-entry-mini">
            <span class="log-time">${new Date(l.timestamp).toLocaleTimeString()}</span>
            <span class="log-signal" style="color:${SignalEngine.rules[l.signalKey]?.color || '#8b949e'}">${l.signalType}</span>
            <span class="log-price">${p ? '$' + Number(p).toFixed(6) : 'N/A'}</span>
          </div>`;
        }).join('')
      : '<div class="detail-empty">暂无信号记录</div>';

    this.els.detailContent.innerHTML = `
      <div class="detail-header">
        <div class="detail-header-row">
          <h2>${symbol} ${coinCfg.isPriority ? '★' : ''}</h2>
          ${conclusionTag}
        </div>
        <div class="detail-tags">${(coinCfg.tags||[]).map(t => `<span class="badge badge-tag">${t}</span>`).join('')}</div>
        <div class="detail-meta">
          ${coinCfg.isAlpha ? '<span class="badge badge-alpha">Alpha</span>' : ''}
          ${coinCfg.hasPerp ? '<span class="badge badge-perp">Perp</span>' : ''}
        </div>
      </div>

      <div class="detail-section">
        <h3>数据有效性</h3>
        ${validityHtml}
      </div>

      <div class="detail-section">
        <h3>实时数据</h3>
        <div class="detail-grid">
          ${this._detailCell('现货价格', this.fmtPrice(m.spotPrice))}
          ${this._detailCell('合约价格', this.fmtPrice(m.perpPrice))}
          ${this._detailCell('5m 变化',  this.fmtPctSafe(m.spot5mChange), this.changeClass(m.spot5mChange))}
          ${this._detailCell('1h 变化',  this.fmtPctSafe(m.spot1hChange), this.changeClass(m.spot1hChange))}
          ${this._detailCell('合约 5m',  this.fmtPctSafe(m.perp5mChange), this.changeClass(m.perp5mChange))}
          ${this._detailCell('Vol Ratio', m.volumeRatio !== null ? m.volumeRatio.toFixed(2) + 'x' : 'N/A', m.volumeRatio > 2 ? 'vol-high' : '')}
          ${this._detailCell('OI 5m',    this.fmtPctSafe(m.oiChange5m), this.changeClass(m.oiChange5m))}
          ${this._detailCell('OI 1h',    this.fmtPctSafe(m.oiChange1h), this.changeClass(m.oiChange1h))}
          ${this._detailCell('Funding',  this.fmtFunding(m.funding), this.fundingClass(m.funding))}
          ${this._detailCell('相对强弱',  m.relativeStrength !== null ? m.relativeStrength.toFixed(2) : 'N/A', this.changeClass(m.relativeStrength))}
        </div>
      </div>

      <div class="detail-section">
        <h3>机会评分：${m.score}/100</h3>
        <div class="score-bar-large"><div class="score-fill" style="width:${m.score}%;background:${this.scoreColor(m.score)}"></div></div>
        ${scoreBreakdownHtml}
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

  _detailCell(label, value, cls) {
    const isNA = value === 'N/A' || value === '<span class="na">—</span>';
    return `<div class="detail-item ${isNA ? 'item-na' : ''}">
      <span class="detail-label">${label}</span>
      <span class="detail-value ${cls || ''}">${value}</span>
    </div>`;
  },

  _validityHtml(v) {
    const items = [
      ['Spot',    v.spotValid],
      ['Perp',    v.perpValid],
      ['History', v.historyValid],
      ['OI',      v.oiValid],
      ['Funding', v.fundingValid],
    ];
    const badges = items.map(([label, val]) => {
      if (val === null) return `<span class="vbadge vbadge-na">${label}: N/A</span>`;
      return val
        ? `<span class="vbadge vbadge-ok">${label}: OK</span>`
        : `<span class="vbadge vbadge-miss">${label}: MISS</span>`;
    }).join('');
    const pct = Math.round((v.completeness || 0) * 100);
    return `<div class="validity-row">${badges}</div>
            <div class="validity-bar"><div class="validity-fill" style="width:${pct}%;background:${pct > 70 ? 'var(--green)' : pct > 40 ? 'var(--yellow)' : 'var(--red)'}"></div><span class="validity-pct">${pct}%</span></div>`;
  },

  _scoreBreakdownHtml(m) {
    const bd = m.scoreBreakdown || {};
    const items = [
      ['价格波动 5m', bd.priceChange5m],
      ['趋势 1h',    bd.priceChange1h],
      ['成交量',      bd.volumeRatio],
      ['OI 变化',    bd.oiChange],
      ['Funding',    bd.fundingAbs],
      ['相对强弱',    bd.relativeStr],
    ];
    return '<div class="score-reasons">' + items.map(([name, val]) => {
      if (val === null || val === undefined) return `<div class="reason reason-na">${name}: 数据缺失</div>`;
      return `<div class="reason"><span>${name}</span><span class="reason-val">+${val}</span></div>`;
    }).join('') + '</div>';
  },

  _conclusionTag(m, v) {
    let label, cls;
    if (!v.isUsable || v.completeness < 0.3) {
      label = '数据不足'; cls = 'conclusion-insufficient';
    } else if (m.signals?.some(s => s.key === 'crowdedRisk')) {
      label = '高风险'; cls = 'conclusion-risk';
    } else if (m.signals?.some(s => CORE_SIGNAL_KEYS.has(s.key))) {
      label = '可研究'; cls = 'conclusion-research';
    } else if (m.score >= 20) {
      label = '可观察'; cls = 'conclusion-watch';
    } else {
      label = '平静'; cls = 'conclusion-quiet';
    }
    return `<span class="conclusion-badge ${cls}">${label}</span>`;
  },

  hideDetail() {
    this.els.detailPanel.classList.remove('open');
    this.els.overlay.classList.remove('visible');
  },

  // ========== 日志面板 ==========
  renderLogPanel(logs) {
    if (logs.length === 0) {
      this.els.logBody.innerHTML = '<div class="detail-empty">暂无核心信号日志</div>';
      return;
    }
    this.els.logBody.innerHTML = logs.slice(0, 80).map(l => {
      const price = l.spotPrice || l.perpPrice;
      const color = SignalEngine.rules[l.signalKey]?.color || '#8b949e';
      return `
      <div class="log-row">
        <span class="log-time">${new Date(l.timestamp).toLocaleTimeString()}</span>
        <span class="log-symbol">${l.symbol}</span>
        <span class="log-signal" style="color:${color}">${l.signalType}</span>
        <span class="log-price">${price ? '$' + Number(price).toFixed(6) : 'N/A'}</span>
        <span class="log-score">${l.score}</span>
        <span class="log-detail" title="${l.explanation}">${l.explanation.slice(0, 50)}</span>
      </div>`;
    }).join('');
  },

  toggleLogPanel() { this.els.logPanel.classList.toggle('open'); },

  // ========== 格式化工具 ==========
  fmtPrice(p) {
    if (p === null || p === undefined || p === 0) return '<span class="na">N/A</span>';
    if (p < 0.001)  return '$' + p.toFixed(8);
    if (p < 0.01)   return '$' + p.toFixed(6);
    if (p < 1)      return '$' + p.toFixed(4);
    if (p < 1000)   return '$' + p.toFixed(2);
    return '$' + p.toLocaleString(undefined, { maximumFractionDigits: 2 });
  },

  fmtPctSafe(v) {
    if (v === null || v === undefined) return '<span class="na">N/A</span>';
    const sign = v >= 0 ? '+' : '';
    return sign + v.toFixed(2) + '%';
  },

  fmtFunding(f) {
    if (f === null || f === undefined) return '<span class="na">N/A</span>';
    return (f * 100).toFixed(4) + '%';
  },

  changeClass(v) {
    if (v === null || v === undefined) return 'val-na';
    if (v > 0.5) return 'change-up';
    if (v < -0.5) return 'change-down';
    return 'change-flat';
  },

  fundingClass(f) {
    if (f === null || f === undefined) return 'val-na';
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
