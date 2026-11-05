'use strict';

(() => {
  const STORAGE_KEY = 'mesa.data-path.v1';
  const AGENTS = ['scanner', 'auditor', 'analyst', 'executor', 'risk'];
  const ICONS = { scanner: 'S', auditor: 'A', analyst: '∑', executor: 'E', risk: 'R' };
  const LABELS = { scanner: 'Scanner', auditor: 'Auditor', analyst: 'Analyst', executor: 'Executor', risk: 'Risk' };
  const $ = id => document.getElementById(id);
  const node = (tag, cls, text) => {
    const element = document.createElement(tag);
    if (cls) element.className = cls;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  };
  const valid = value => typeof value === 'number' && Number.isFinite(value);
  const money = (value, digits = 2) => valid(value) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value) : '—';
  const number = (value, digits = 2) => valid(value) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value) : '—';
  const price = value => {
    if (!valid(value)) return '—';
    const digits = Math.abs(value) < 0.001 ? 10 : Math.abs(value) < 1 ? 6 : 4;
    return '$' + value.toLocaleString('en-US', { maximumSignificantDigits: 6, maximumFractionDigits: digits });
  };
  const clock = value => {
    const ms = typeof value === 'number' ? value * 1000 : Date.parse(value);
    return Number.isFinite(ms) ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms)) + ' BRT' : '—';
  };
  const day = value => {
    const ms = typeof value === 'number' ? value * 1000 : Date.parse(value);
    return Number.isFinite(ms) ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms)) + ' BRT' : '—';
  };
  const dex = mint => 'https://dexscreener.com/solana/' + encodeURIComponent(mint);
  const jup = mint => 'https://jup.ag/swap/SOL-' + encodeURIComponent(mint);
  const pct = value => valid(value) ? number(value) + '%' : '—';
  const app = { path: '', state: null, chart: null, activity: [], coins: new Map(), view: 'home', previousView: 'home', mint: null, range: 'ALL', coinRange: 'ALL', filter: 'all', polling: false, failures: 0 };

  function setConnection(text, type = '') {
    $('connection').className = 'connection' + (type ? ' ' + type : '');
    $('connection-text').textContent = text;
  }
  function extractKey(value) {
    const match = String(value || '').match(/(?:^|[#&])d=([A-Za-z0-9_-]{32,128})(?:&|$)/);
    return match ? match[1] : '';
  }
  function savePath(key) {
    try { localStorage.setItem(STORAGE_KEY, key); return true; }
    catch (_) { return false; }
  }
  function storedPath() {
    try { const value = localStorage.getItem(STORAGE_KEY) || ''; return /^[A-Za-z0-9_-]{32,128}$/.test(value) ? value : ''; }
    catch (_) { return ''; }
  }
  function initializePath() {
    const fragmentKey = extractKey(location.hash);
    if (fragmentKey) {
      app.path = fragmentKey;
      if (!savePath(fragmentKey)) $('private-link-error').textContent = 'This browser blocked local storage. The link will only work for this session.';
      try { history.replaceState(null, '', location.pathname + location.search); } catch (_) { /* Some file previews do not expose History. */ }
    } else app.path = storedPath();
    if (location.hash.startsWith('#d=')) {
      try { history.replaceState(null, '', location.pathname + location.search); } catch (_) { /* no-op */ }
    }
    if (!app.path) { setConnection('Private link required'); $('private-link-dialog').showModal(); }
  }

  async function getJSON(file, timeout = 10000) {
    if (!app.path) throw new Error('Private link required');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch('./d/' + app.path + '/' + file + '?v=' + Date.now(), { cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Data unavailable (' + response.status + ')');
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  function validateSnapshot(state, chart, activity) {
    if (!state || state.mode !== 'PAPER' || !valid(state.balance) || !Array.isArray(state.agents) || !Array.isArray(state.positions)) throw new Error('Invalid state snapshot');
    if (!chart || !Array.isArray(chart.series) || !Array.isArray(chart.marks)) throw new Error('Invalid chart snapshot');
    if (!Array.isArray(activity)) throw new Error('Invalid activity snapshot');
  }
  async function poll() {
    if (app.polling || !app.path) return;
    app.polling = true;
    try {
      const [state, chart, activity] = await Promise.all([getJSON('state.json'), getJSON('chart.json'), getJSON('activity.json')]);
      validateSnapshot(state, chart, activity);
      app.state = state; app.chart = chart; app.activity = activity; app.failures = 0;
      renderAll();
      setConnection('Live snapshot · ' + clock(state.updated_at), 'online');
      if (app.mint) loadCoin(app.mint, false);
    } catch (_) {
      app.failures += 1;
      setConnection(app.state ? 'Connection issue · keeping last good numbers' : 'Unable to load desk · retrying every 15s', 'error');
    } finally {
      app.polling = false;
      setTimeout(poll, 15000);
    }
  }

  function renderAll() {
    const state = app.state;
    $('balance').textContent = money(state.balance);
    $('balance-mode').textContent = 'PAPER · read only';
    const pct = valid(state.today_pct) ? state.today_pct : null;
    $('today-change').className = 'change ' + (pct > 0 ? 'positive' : pct < 0 ? 'negative' : 'neutral');
    $('today-change').textContent = pct === null ? '— today' : (pct > 0 ? '+' : '') + pct.toFixed(2) + '% today';
    $('last-updated').textContent = 'Updated ' + clock(state.updated_at);
    $('multiplier').textContent = valid(state.multiplier) ? state.multiplier.toFixed(2) + '×' : '—×';
    $('account-stack').textContent = money(state.settings && state.settings.paper_stack);
    renderAgents(); renderActivity(); renderSettings(); drawBalance();
  }
  function status(agent) { return agent.paused ? 'paused' : agent.status || 'waiting'; }
  function agentMetric(agent) {
    const counts = agent.counts || {};
    if (agent.name === 'scanner') return [number(counts.tonight, 0), 'coins scanned tonight'];
    if (agent.name === 'auditor') return [number(counts.passed, 0) + ' / ' + number(counts.tonight, 0), 'audit layers passed tonight'];
    if (agent.name === 'analyst') return [valid(counts.latest_score) ? String(counts.latest_score) : '—', counts.tonight + ' verdicts · latest score'];
    if (agent.name === 'executor') return [number(counts.fills, 0), 'paper fills · ' + number(counts.skipped, 0) + ' skipped'];
    return [number(counts.open_positions, 0), 'open positions · ' + number(counts.closed_positions, 0) + ' closed'];
  }
  function agentTop(agent) {
    const row = node('div', 'agent-top');
    row.append(node('span', 'agent-icon', ICONS[agent.name] || '·'), node('span', 'agent-name', LABELS[agent.name] || agent.name), node('span', 'agent-status', status(agent)));
    return row;
  }
  function renderAgents() {
    const carousel = $('agent-carousel'); carousel.replaceChildren();
    const list = $('agents-list'); list.replaceChildren();
    for (const agent of app.state.agents) {
      if (!AGENTS.includes(agent.name)) continue;
      const metric = agentMetric(agent);
      const card = node('article', 'agent-card ' + agent.name); card.append(agentTop(agent));
      card.append(node('div', 'agent-metric', metric[0]), node('div', 'agent-caption', metric[1]));
      card.append(node('div', 'agent-decision', agent.last_decision ? agent.last_decision.title : 'No decisions recorded yet'));
      carousel.append(card);
      const full = node('article', 'full-agent ' + agent.name); full.append(agentTop(agent));
      full.append(node('p', 'agent-caption', agent.last_decision ? agent.last_decision.title : 'Waiting for its first decision.'));
      const stats = node('div', 'agent-stats');
      const values = Object.entries(agent.counts || {}).filter(([key]) => !key.startsWith('latest_')).slice(0, 3);
      if (!values.length) values.push(['recorded', 0]);
      for (const [key, value] of values) { const box = node('div', 'agent-stat'); box.append(node('strong', '', number(value, 2)), node('span', '', key.replaceAll('_', ' '))); stats.append(box); }
      full.append(stats, node('div', 'decision-heading', 'RECENT DECISIONS'));
      const decisions = node('ul', 'decision-list');
      const recent = Array.isArray(agent.recent_decisions) ? agent.recent_decisions : [];
      if (!recent.length) decisions.append(node('li', 'decision-item', 'No decisions recorded yet.'));
      for (const decision of recent.slice(0, 20)) {
        const item = node('li', 'decision-item'); item.append(node('div', 'decision-title', decision.title || 'Decision'));
        if (decision.subtitle) item.append(node('div', 'decision-sub', decision.subtitle));
        item.append(node('div', 'decision-time', day(decision.time || decision.ts))); decisions.append(item);
      }
      full.append(decisions); list.append(full);
    }
    if (!carousel.children.length) carousel.append(node('div', 'empty-card', 'No agent status is available yet.'));
  }
  function activitySymbol(row) {
    const kind = String(row.kind || '').toLowerCase();
    if (kind.includes('buy')) return ['↑', 'buy'];
    if (kind.includes('sell')) return ['↓', 'sell'];
    if (kind.includes('analyst')) return ['∑', 'analyst'];
    if (kind.includes('audit')) return ['✓', 'audit'];
    if (kind.includes('skip') || kind.includes('reject')) return ['×', 'skip'];
    return ['⌁', 'scan'];
  }
  function activityRow(row) {
    const [symbol, cls] = activitySymbol(row);
    const button = node('button', 'activity-row'); button.type = 'button';
    button.setAttribute('aria-label', (row.title || 'Desk activity') + '. Open coin details');
    button.append(node('span', 'activity-symbol ' + cls, symbol));
    const body = node('span', 'activity-body'); body.append(node('span', 'activity-title', row.title || 'Desk activity'), node('span', 'activity-subtitle', row.subtitle || row.agent || 'PAPER desk'));
    const meta = node('span', 'activity-meta'); meta.append(node('div', 'activity-value', row.value || ''), node('div', 'activity-time', clock(row.time || row.ts)));
    button.append(body, meta);
    if (row.mint) button.addEventListener('click', () => openCoin(row.mint)); else button.disabled = true;
    return button;
  }
  function renderActivity() {
    const home = $('home-activity'); home.replaceChildren();
    const rows = app.activity.slice(0, 4);
    if (!rows.length) home.append(node('div', 'empty-card', 'No activity yet. The desk is still listening.'));
    else for (const row of rows) home.append(activityRow(row));
    const list = $('activity-list'); list.replaceChildren();
    const filtered = app.activity.filter(row => app.filter === 'all' || app.filter === 'trade' ? (app.filter === 'all' || ['buy', 'sell', 'skip'].includes(row.kind)) : ['scan', 'audit', 'analyst'].includes(row.kind));
    if (!filtered.length) list.append(node('div', 'empty-card', app.activity.length ? 'No activity matches this filter.' : 'No activity yet. The desk is still listening.'));
    for (const row of filtered) list.append(activityRow(row));
  }
  function renderSettings() {
    const settings = app.state.settings || {};
    const rows = [
      ['Trading mode', 'PAPER · simulated'], ['Ticket size', money(settings.ticket_usd)],
      ['Max open positions', valid(settings.max_open_positions) ? String(settings.max_open_positions) : '—'],
      ['Max daily loss', valid(settings.max_daily_loss_usd) ? money(settings.max_daily_loss_usd) + ' · auto-pause' : '—'],
      ['Quote asset', settings.quote_asset || '—'],
      ['Max price impact', valid(settings.max_price_impact_pct) ? number(settings.max_price_impact_pct) + '% per side' : '—'],
      ['Max slippage', valid(settings.max_slippage_bps) ? number(settings.max_slippage_bps / 100) + '%' : '—'],
      ['Max round-trip cost', valid(settings.max_round_trip_cost_pct) ? number(settings.max_round_trip_cost_pct) + '% of ticket' : '—'],
      ['Initial stop', valid(settings.stop_pct) ? '−' + number(settings.stop_pct) + '%' : '—'],
      ['Trailing stop', valid(settings.trail_pct) ? number(settings.trail_pct) + '% after ' + number(settings.trail_activation_pct) + '%' : '—'],
      ['Position timeout', valid(settings.timeout_hours) ? number(settings.timeout_hours) + ' hours' : '—'],
      ['Analyst', settings.analyst_mode === 'rules' ? 'Deterministic rules' : settings.analyst_mode || '—'],
      ['Timezone', settings.timezone || 'America/Sao_Paulo']
    ];
    const dl = $('settings-list'); dl.replaceChildren();
    for (const [label, value] of rows) { const row = node('div'); row.append(node('span', '', label), node('dd', '', value)); dl.append(row); }
    renderExecution();
  }
  function renderExecution() {
    const ex = app.state.execution || {}, q = ex.quotes || {}, rc = ex.route_checks || {};
    const rows = [
      ['Venue', ex.venue ? ex.venue + ' · ' + (ex.mode || 'quotes only') : '—'],
      ['LIVE', ex.live ? 'ON' : 'OFF (no signing code)'],
      ['Entries', ex.daily_loss_paused ? 'PAUSED · daily loss limit' : 'Active'],
      ['Quotes tonight', valid(q.total) ? q.total + ' · ' + (q.ok || 0) + ' ok' : '—'],
      ['No route', valid(q.no_route) ? String(q.no_route) : '—'],
      ['Rate limited', valid(q.rate_limited) ? String(q.rate_limited) : '—'],
      ['Route checks', valid(rc.total) ? (rc.passed || 0) + ' / ' + rc.total + ' passed' : '—'],
      ['Avg est. round trip', pct(rc.avg_round_trip_cost_pct)]
    ];
    const dl = $('execution-list'); dl.replaceChildren();
    for (const [label, value] of rows) { const row = node('div'); row.append(node('span', '', label), node('dd', '', value)); dl.append(row); }
    const list = $('execution-rejects'); list.replaceChildren();
    const rejects = Array.isArray(ex.recent_rejections) ? ex.recent_rejections.slice(0, 5) : [];
    if (rejects.length) list.append(node('div', 'decision-heading', 'RECENT ROUTE REJECTIONS'));
    for (const r of rejects) { const row = node('div', 'route-reject'); row.append(node('strong', '', (r.name || r.mint.slice(0, 6) + '…') + ' · '), document.createTextNode(r.reason + ' · ' + clock(r.time))); list.append(row); }
  }
  function navigate(view) {
    if (!['home', 'agents', 'activity', 'account'].includes(view)) return;
    app.view = view; app.mint = null;
    for (const section of document.querySelectorAll('.view')) { const active = section.id === 'view-' + view; section.hidden = !active; section.classList.toggle('active', active); }
    for (const button of document.querySelectorAll('.nav-button')) { const active = button.dataset.nav === view; button.classList.toggle('selected', active); if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); }
    window.scrollTo({ top: 0, behavior: 'auto' }); drawBalance();
  }
  document.querySelectorAll('[data-nav]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.nav)));
  document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => {
    app.filter = button.dataset.filter;
    document.querySelectorAll('.filter').forEach(b => b.classList.toggle('selected', b === button)); renderActivity();
  }));
  $('private-link-form').addEventListener('submit', event => {
    event.preventDefault();
    const input = $('private-link-input').value.trim();
    const key = extractKey(input.includes('#') ? input.slice(input.indexOf('#')) : input);
    if (!key) { $('private-link-error').textContent = 'Use a full link ending in #d= followed by the private key.'; return; }
    app.path = key;
    if (!savePath(key)) { $('private-link-error').textContent = 'Enable local storage in this browser to connect.'; return; }
    $('private-link-dialog').close(); setConnection('Loading private desk…'); poll();
  });

  function canvasContext(canvas) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(rect.width * ratio), height = Math.round(rect.height * ratio);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const ctx = canvas.getContext('2d'); ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, rect.width, rect.height);
    return { ctx, width: rect.width, height: rect.height };
  }
  function text(ctx, value, x, y, color = '#8e8e93', align = 'left') { ctx.fillStyle = color; ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif'; ctx.textAlign = align; ctx.fillText(value, x, y); }
  function filteredSeries() {
    const series = (app.chart && app.chart.series ? app.chart.series : []).filter(p => valid(p.value) && (valid(p.ts) || Number.isFinite(Date.parse(p.time)))).slice().sort((a, b) => (a.ts || Date.parse(a.time) / 1000) - (b.ts || Date.parse(b.time) / 1000));
    if (!series.length) return [];
    const latest = series[series.length - 1].ts || Date.parse(series[series.length - 1].time) / 1000;
    if (app.range === 'ALL') return series;
    return series.filter(p => (p.ts || Date.parse(p.time) / 1000) >= latest - (app.range === '1H' ? 3600 : 86400));
  }
  function drawBalance() {
    if (app.view !== 'home' || !app.chart) return;
    const result = canvasContext($('balance-chart')); if (!result) return;
    const { ctx, width, height } = result, points = filteredSeries();
    $('chart-range-label').textContent = app.range === 'ALL' ? 'Entire session' : 'Latest ' + app.range.toLowerCase();
    if (!points.length) { $('balance-chart-empty').textContent = 'No balance history in this range'; return; }
    $('balance-chart-empty').textContent = '';
    const left = 8, right = 45, top = 15, bottom = 26, w = width - left - right, h = height - top - bottom;
    const values = points.map(p => p.value); let min = Math.min(...values), max = Math.max(...values);
    const pad = Math.max((max - min) * .18, Math.max(Math.abs(max) * .002, .05)); min -= pad; max += pad;
    const first = points[0].ts || Date.parse(points[0].time) / 1000, last = points[points.length - 1].ts || Date.parse(points[points.length - 1].time) / 1000;
    const x = p => left + (points.length === 1 ? w / 2 : ((p.ts || Date.parse(p.time) / 1000) - first) / Math.max(1, last - first) * w);
    const y = value => top + (max - value) / Math.max(.000001, max - min) * h;
    ctx.lineWidth = 1; ctx.strokeStyle = '#ffffff09';
    for (let i = 0; i < 4; i++) { const py = top + i / 3 * h; ctx.beginPath(); ctx.moveTo(left, py); ctx.lineTo(left + w, py); ctx.stroke(); text(ctx, money(max - i / 3 * (max - min), 2), width - 2, py + 3, '#636366', 'right'); }
    if (points.length === 1) {
      ctx.strokeStyle = '#00d35a55'; ctx.setLineDash([4, 5]); ctx.beginPath(); ctx.moveTo(left, y(points[0].value)); ctx.lineTo(left + w, y(points[0].value)); ctx.stroke(); ctx.setLineDash([]);
    } else {
      const gradient = ctx.createLinearGradient(0, top, 0, top + h); gradient.addColorStop(0, '#00d35a25'); gradient.addColorStop(1, '#00d35a00');
      ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(x(p), y(p.value)) : ctx.moveTo(x(p), y(p.value)));
      ctx.lineTo(x(points[points.length - 1]), top + h); ctx.lineTo(x(points[0]), top + h); ctx.closePath(); ctx.fillStyle = gradient; ctx.fill();
      ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(x(p), y(p.value)) : ctx.moveTo(x(p), y(p.value))); ctx.strokeStyle = '#00d35a'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
    }
    const lastPoint = points[points.length - 1]; ctx.beginPath(); ctx.arc(x(lastPoint), y(lastPoint.value), 3, 0, Math.PI * 2); ctx.fillStyle = '#00d35a'; ctx.fill();
    for (const mark of (app.chart.marks || [])) {
      if (!valid(mark.balance) || !valid(mark.ts)) continue;
      if (app.range !== 'ALL' && mark.ts < first) continue;
      const mx = left + (points.length === 1 ? w / 2 : Math.max(0, Math.min(1, (mark.ts - first) / Math.max(1, last - first))) * w);
      const my = y(mark.balance); ctx.beginPath(); ctx.arc(mx, my, 3, 0, Math.PI * 2); ctx.fillStyle = mark.side === 'sell' ? '#ff453a' : '#00d35a'; ctx.fill();
    }
    text(ctx, points.length === 1 ? '1 stored balance sample' : day(first), left, height - 5);
    if (points.length > 1) text(ctx, day(last), left + w, height - 5, '#8e8e93', 'right');
  }
  document.querySelectorAll('.range-button').forEach(button => button.addEventListener('click', () => {
    app.range = button.dataset.range; document.querySelectorAll('.range-button').forEach(b => b.classList.toggle('selected', b === button)); drawBalance();
  }));

  function openCoin(mint) { app.previousView = app.view === 'coin' ? 'activity' : app.view; app.mint = mint; app.view = 'coin';
    for (const section of document.querySelectorAll('.view')) section.hidden = section.id !== 'view-coin';
    for (const button of document.querySelectorAll('.nav-button')) button.classList.remove('selected');
    $('coin-name').textContent = 'Loading coin…'; $('coin-mint').textContent = ''; $('coin-price').textContent = '—'; $('coin-dex').href = dex(mint); $('coin-jup').href = jup(mint); $('coin-route').replaceChildren();
    $('coin-chart-empty').textContent = 'Loading stored prices…'; $('coin-audits').replaceChildren(); $('coin-scores').replaceChildren(); $('coin-position').replaceChildren(); $('coin-stats').replaceChildren();
    window.scrollTo({ top: 0, behavior: 'auto' }); loadCoin(mint, true);
  }
  async function loadCoin(mint, announce) {
    try {
      const coin = await getJSON('coin/' + encodeURIComponent(mint) + '.json');
      if (app.mint !== mint) return;
      if (!coin || coin.mint !== mint) throw new Error('Coin mismatch');
      app.coins.set(mint, coin); renderCoin(coin);
      if (announce && app.state) setConnection('Live snapshot · ' + clock(app.state.updated_at), 'online');
    } catch (_) {
      if (app.mint !== mint) return;
      if (app.coins.has(mint)) renderCoin(app.coins.get(mint));
      else { $('coin-name').textContent = 'Coin data unavailable'; $('coin-chart-empty').textContent = 'Could not load coin data. Last good numbers are preserved when available.'; setConnection('Coin data unavailable · retrying', 'error'); }
    }
  }
  $('coin-back').addEventListener('click', () => navigate(app.previousView === 'home' ? 'home' : 'activity'));
  function renderRoute(coin) {
    const box = $('coin-route'); box.replaceChildren();
    const heading = node('div', 'card-heading'); heading.append(node('h2', '', 'Jupiter route'));
    const r = coin.route; heading.append(node('span', 'lock-label', r ? (r.pass ? 'PASS' : 'REJECTED') : 'NOT QUOTED')); box.append(heading);
    if (!r) { box.append(node('p', 'position-none', 'No Jupiter quote has been taken for this coin.')); }
    else {
      const grid = node('div', 'position-grid');
      const b = r.buy_quote || {}, s = r.sell_quote || {};
      const rows = [['Route', r.route_labels || b.route_labels || '—'], ['Router', b.router || '—'], ['Ticket', money(r.ticket_usd) + ' in ' + (r.quote_asset || 'SOL')],
        ['Impact buy / sell', (valid(r.buy_impact_pct) ? number(Math.abs(r.buy_impact_pct)) + '%' : '—') + ' / ' + (valid(r.sell_impact_pct) ? number(Math.abs(r.sell_impact_pct)) + '%' : '—')],
        ['Swap loss', money(r.swap_loss_usd)], ['Network est.', money(r.network_est_usd)], ['Rent est.', money(r.rent_est_usd)],
        ['Round trip est.', valid(r.round_trip_cost_usd) ? money(r.round_trip_cost_usd) + ' · ' + pct(r.round_trip_cost_pct) : '—'],
        ['Platform fee', valid(b.platform_fee_bps) ? b.platform_fee_bps + ' bps' : '—'], ['Quoted', clock(r.ts) + ' · ' + (r.purpose || '')]];
      for (const [label, value] of rows) { const cell = node('div'); cell.append(node('span', '', label), node('strong', '', value)); grid.append(cell); }
      box.append(grid, node('p', 'route-reason' + (r.pass ? '' : ' fail'), r.reason || ''));
    }
    const fails = Array.isArray(coin.quote_failures) ? coin.quote_failures : [];
    for (const f of fails.slice(0, 3)) box.append(node('div', 'route-reject', (f.status || '') + ' · ' + (f.side || '') + ' · ' + (f.purpose || '') + ' · ' + clock(f.ts)));
  }
  function renderCoin(coin) {
    $('coin-name').textContent = coin.name || coin.symbol || coin.mint;
    $('coin-symbol').textContent = (coin.symbol || 'COIN') + ' · PAPER';
    $('coin-mint').textContent = coin.mint; $('coin-mint').title = coin.mint;
    $('coin-price').textContent = price(coin.price); $('coin-dex').href = dex(coin.mint); $('coin-jup').href = jup(coin.mint);
    const stats = $('coin-stats'); stats.replaceChildren();
    const statValues = Object.entries(coin.stats || {}).filter(([, value]) => valid(value)).slice(0, 6);
    if (!statValues.length) stats.append(node('div', 'empty-card', 'No market stats are stored for this coin.'));
    for (const [key, value] of statValues) { const card = node('div', 'stat-card'); const formatted = key.includes('pct') ? number(value) + '%' : key.includes('usd') ? money(value, 0) : number(value); card.append(node('span', '', key.replaceAll('_', ' ')), node('strong', '', formatted)); stats.append(card); }
    const position = $('coin-position'); position.replaceChildren();
    position.append(node('div', 'card-heading'), node('h2', '', 'Paper position'));
    position.firstChild.append(position.lastChild); position.lastChild.append(node('span', 'lock-label', coin.position ? coin.position.status.toUpperCase() : 'NO POSITION'));
    if (!coin.position) position.append(node('p', 'position-none', 'No open or recorded paper position for this coin.'));
    else {
      const p = coin.position, grid = node('div', 'position-grid');
      const rows = [['Size', money(p.size_usd)], ['Entry', price(p.entry_price)], ['Stop', price(p.stop_price)], ['Peak', price(p.peak_price)], ['Opened', day(p.opened_at)], ['Realized P&L', valid(p.pnl_usd) ? money(p.pnl_usd) : 'Open']];
      if (p.route_label) rows.push(['Route', p.route_label]);
      if (valid(p.entry_costs_usd)) rows.push(['Est. entry costs', money(p.entry_costs_usd)]);
      if (valid(p.exit_value_usd)) rows.push(['Exit quote value', money(p.exit_value_usd)]);
      if (p.exit_reason) rows.push(['Exit rule', p.exit_reason]);
      for (const [label, value] of rows) { const box = node('div'); box.append(node('span', '', label), node('strong', '', value)); grid.append(box); } position.append(grid);
    }
    renderRoute(coin);
    const audits = $('coin-audits'); audits.replaceChildren(); const layers = Array.isArray(coin.audit_layers) ? coin.audit_layers : [];
    $('audit-summary').textContent = layers.length ? layers.filter(a => a.pass && a.value !== 'not checked').length + ' / ' + layers.length + ' passed' : 'No audit stored';
    for (const layer of layers) {
      const row = node('div', 'audit-row'), line = node('div', 'audit-line');
      const notChecked = layer.value === 'not checked'; line.append(node('span', 'audit-status' + (layer.pass && !notChecked ? '' : ' fail'), notChecked ? '–' : layer.pass ? '✓' : '×'), node('span', 'audit-layer', 'L' + layer.layer), node('strong', '', layer.name)); row.append(line, node('div', 'audit-value', layer.value || 'No value recorded'));
      if (layer.source) row.append(node('div', 'audit-source', layer.source)); audits.append(row);
    }
    if (!layers.length) audits.append(node('p', 'position-none', 'This coin has not reached the auditor yet.'));
    const scores = $('coin-scores'); scores.replaceChildren(); const analyst = coin.analyst;
    if (!analyst) scores.append(node('p', 'position-none', 'No analyst verdict is stored for this coin.'));
    else {
      const grid = node('div', 'score-grid');
      for (const [key, label, max] of [['alive_6h', 'Alive', 1], ['organic', 'Organic', 1], ['flush', 'Flush', 1], ['chase', 'Chase', 1], ['score', 'Overall', 100]]) {
        if (!valid(analyst[key])) continue; const box = node('div', 'score-item'), line = node('div'); line.append(node('span', '', label), node('strong', '', key === 'score' ? analyst[key] : analyst[key].toFixed(2))); const track = node('div', 'score-track'), bar = node('i'); bar.style.width = Math.min(100, Math.max(0, analyst[key] / max * 100)) + '%'; track.append(bar); box.append(line, track); grid.append(box);
      }
      scores.append(grid, node('p', 'score-reason', analyst.pass ? 'Passed the configured rules.' : analyst.reason || 'Rejected by the configured rules.'));
    }
    drawCoin(coin);
  }
  document.querySelectorAll('.coin-range').forEach(button => button.addEventListener('click', () => {
    app.coinRange = button.dataset.range; document.querySelectorAll('.coin-range').forEach(b => b.classList.toggle('selected', b === button)); if (app.mint && app.coins.has(app.mint)) drawCoin(app.coins.get(app.mint));
  }));
  function drawCoin(coin) {
    const result = canvasContext($('coin-chart')); if (!result) return;
    const { ctx, width, height } = result;
    let candles = (Array.isArray(coin.candles) ? coin.candles : []).filter(c => valid(c.time) && valid(c.open) && valid(c.high) && valid(c.low) && valid(c.close)).sort((a, b) => a.time - b.time);
    if (candles.length && app.coinRange !== 'ALL') { const cutoff = candles[candles.length - 1].time - (app.coinRange === '1H' ? 3600 : 86400); candles = candles.filter(c => c.time >= cutoff); }
    $('candle-count').textContent = candles.length + ' candles';
    if (!candles.length) { $('coin-chart-empty').textContent = 'No stored prices in this range'; return; }
    $('coin-chart-empty').textContent = '';
    const left = 8, right = 47, top = 15, bottom = 25, w = width - left - right, h = height - top - bottom;
    const lines = Object.entries(coin.exit_lines || {}).filter(([, v]) => valid(v) && v > 0).map(([, v]) => v);
    let min = Math.min(...candles.map(c => c.low), ...lines), max = Math.max(...candles.map(c => c.high), ...lines); const pad = Math.max((max - min) * .07, max * .0001); min -= pad; max += pad;
    const y = value => top + (max - value) / Math.max(1e-20, max - min) * h;
    for (let i = 0; i < 4; i++) { const py = top + i / 3 * h; ctx.strokeStyle = '#ffffff09'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(left, py); ctx.lineTo(left + w, py); ctx.stroke(); text(ctx, price(max - i / 3 * (max - min)), width - 2, py + 3, '#636366', 'right'); }
    const step = w / Math.max(1, candles.length), bodyWidth = Math.max(1, Math.min(6, step * .62));
    candles.forEach((c, index) => {
      const x = left + (index + .5) * step, color = c.close >= c.open ? '#00d35a' : '#ff453a'; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y(c.high)); ctx.lineTo(x, y(c.low)); ctx.stroke();
      const topBody = y(Math.max(c.open, c.close)); ctx.fillRect(x - bodyWidth / 2, topBody, bodyWidth, Math.max(1, y(Math.min(c.open, c.close)) - topBody));
    });
    for (const [key, value] of Object.entries(coin.exit_lines || {})) {
      if (!valid(value) || value <= 0 || !['entry', 'stop', 'exit'].includes(key)) continue;
      ctx.strokeStyle = key === 'entry' ? '#32ade6' : key === 'stop' ? '#ff453a' : '#ff9f0a'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(left, y(value)); ctx.lineTo(left + w, y(value)); ctx.stroke(); ctx.setLineDash([]); text(ctx, key, left + 2, y(value) - 4, ctx.strokeStyle);
    }
    text(ctx, day(candles[0].time), left, height - 4); if (candles.length > 1) text(ctx, day(candles[candles.length - 1].time), left + w, height - 4, '#8e8e93', 'right');
  }
  let resizeFrame = 0;
  window.addEventListener('resize', () => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(() => { drawBalance(); if (app.mint && app.coins.has(app.mint)) drawCoin(app.coins.get(app.mint)); }); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && app.path) poll(); });
  initializePath(); if (app.path) { setConnection('Loading private desk…'); poll(); }
})();
