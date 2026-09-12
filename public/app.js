/**
 * JGAOWA Financial Display Board - Complete Comprehensive Engine
 * EMI Wise Payment Status & Amount Metrics (Collected Amount, Amount to be Collected, % of Amount)
 */

let financialData = (typeof EMBEDDED_JGAOWA_DATA !== 'undefined' && EMBEDDED_JGAOWA_DATA) 
  ? EMBEDDED_JGAOWA_DATA 
  : ((typeof window !== 'undefined' && window.EMBEDDED_JGAOWA_DATA) ? window.EMBEDDED_JGAOWA_DATA : null);
let currentTab = 'overview';
let overviewChart = null;
let donutChart = null;
let bankChart = null;
let paintingChart = null;
let simChart = null;
let liftBarChart = null;

let isPresentationRunning = false;
let isMouseHovered = false;
let slideDuration = 25000;
let slideElapsed = 0;
let presentationTimer = null;
let hoverResumeTimer = null;
let currentTrendMode = 'all';
let currentOverviewLiftView = 'cards';

const presentationTabs = ['overview', 'multi-year', 'lift', 'painting', 'liquidity'];

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0
});

function formatINR(val) {
  if (val === null || val === undefined || isNaN(val)) return '₹0';
  return inrFormatter.format(Math.round(val));
}

function formatLakhs(val) {
  if (!val) return '₹0 L';
  const l = val / 100000;
  return `₹${l.toFixed(2)} L`;
}

function setElText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setElHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

// 1. Initialize
document.addEventListener('DOMContentLoaded', () => {
  try { if (window.lucide) lucide.createIcons(); } catch(e){}
  startLiveClock();
  setupHoverProtection();
  
  // 1. If embedded data is present, render immediately
  if (financialData && Object.keys(financialData).length > 0) {
    try { renderAll(); } catch(e) { console.error('Render error:', e); }
  }
  
  // 2. Try fetching from local live server API, fallback to static financial_data.json (for GitHub Pages)
  fetch('/api/financials')
    .then(r => {
      if (!r.ok) throw new Error('Local API not running');
      return r.json();
    })
    .then(d => {
      financialData = d;
      renderAll();
      startLiveWatcherPolling();
    })
    .catch(() => {
      // Running on GitHub Pages or static host -> load local static JSON
      if (!financialData || Object.keys(financialData).length === 0) {
        fetch('./financial_data.json')
          .then(r => r.json())
          .then(d => {
            financialData = d;
            renderAll();
          })
          .catch(e => console.log('Static data loaded from bundle.'));
      }
    });
});

function startLiveClock() {
  function update() {
    const now = new Date();
    setElText('live-clock', now.toLocaleTimeString('en-US', { hour12: false }));
    setElText('live-date', now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }));
  }
  update();
  setInterval(update, 1000);
}

function setupHoverProtection() {
  const container = document.getElementById('interactive-display-container');
  const hoverBadge = document.getElementById('hover-pause-indicator');
  const mainBody = document.getElementById('main-body');

  function handleUserEnter() {
    isMouseHovered = true;
    if (hoverResumeTimer) clearTimeout(hoverResumeTimer);
    if (isPresentationRunning && hoverBadge) {
      hoverBadge.classList.remove('hidden');
      hoverBadge.classList.add('inline-flex');
    }
  }

  function handleUserLeave() {
    if (hoverResumeTimer) clearTimeout(hoverResumeTimer);
    hoverResumeTimer = setTimeout(() => {
      isMouseHovered = false;
      if (hoverBadge) {
        hoverBadge.classList.add('hidden');
        hoverBadge.classList.remove('inline-flex');
      }
    }, 1500);
  }

  if (container) {
    container.addEventListener('mouseenter', handleUserEnter);
    container.addEventListener('mousemove', handleUserEnter);
    container.addEventListener('mouseleave', handleUserLeave);
  }
  if (mainBody) {
    mainBody.addEventListener('mouseenter', handleUserEnter);
    mainBody.addEventListener('mouseleave', handleUserLeave);
  }
}

// 2. Render All Views
function renderAll() {
  if (!financialData) return;
  try {
    renderTickers();
    renderOverviewKPIs();
    renderOverviewCharts();
    renderOverviewBlocksAndBanks();
    renderMultiYearTab();
    renderLiftTab();
    renderPaintingTab();
    renderLiquidityTab();
    setupSimulationDefaults();
    if (window.lucide) lucide.createIcons();
  } catch(err) {
    console.error("Render error:", err);
  }
}

function renderTickers() {
  const s = financialData.summary;
  const lift = financialData.lift_project || {};
  const items = [
    `📊 OVERALL LIFT EMI STATUS: ${lift.overall_emi_pct || 89.5}% PAID (${lift.total_paid_emis || 1275}/${lift.total_demand_emis || 1424} EMIs)`,
    `⚠️ PENDING LIFT EMIs: ${lift.total_pending_emis || 149} EMIs (${lift.overall_pending_pct || 10.5}%) across 356 Flats`,
    `💰 LIQUID RESERVES: ${formatINR(s.current_liquid_funds)}`,
    `📈 TOTAL RECEIPTS (23M): ${formatINR(s.total_receipts_23m)}`,
    `📉 TOTAL PAYMENTS (23M): ${formatINR(s.total_payments_23m)}`,
    `🎨 PAINTING CAPEX: ${formatINR(s.painting_collected)}`
  ];
  setElHTML('ticker-content', items.map(t => `<span class="inline-block px-3 py-0.5 rounded bg-slate-800/80 border border-slate-700/50">${t}</span>`).join(' &bull; '));
}

function renderOverviewKPIs() {
  const s = financialData.summary;
  const lift = financialData.lift_project || {};

  setElText('kpi-liquid-funds', formatINR(s.current_liquid_funds));
  setElText('kpi-total-receipts', formatINR(s.total_receipts_23m));
  setElText('kpi-total-payments', formatINR(s.total_payments_23m));
  
  setElText('kpi-lift-emi-pct', `${lift.overall_emi_pct || 89.5}%`);
  setElText('kpi-lift-pending-emis', `${lift.total_pending_emis || 149} EMIs (${lift.overall_pending_pct || 10.5}%)`);

  const avgR = s.total_receipts_23m / (s.total_months || 23);
  const avgP = s.total_payments_23m / (s.total_months || 23);
  setElText('kpi-avg-receipts', formatINR(avgR));
  setElText('kpi-avg-payments', formatINR(avgP));
}

function renderOverviewCharts() {
  const records = financialData.monthly_records || [];
  let filtered = records;
  if (currentTrendMode === 'fy2425') filtered = records.slice(0, 12);
  else if (currentTrendMode === 'fy2526') filtered = records.slice(12);

  const labels = filtered.map(r => r.month);
  const receipts = filtered.map(r => r.receipts_total);
  const payments = filtered.map(r => r.payments_total);
  const balances = filtered.map(r => r.closing_balance);

  const ctxCash = document.getElementById('overviewCashflowChart');
  if (ctxCash) {
    if (overviewChart) overviewChart.destroy();
    overviewChart = new Chart(ctxCash.getContext('2d'), {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { label: 'Receipts', data: receipts, backgroundColor: 'rgba(16, 185, 129, 0.8)', borderRadius: 4 },
          { label: 'Payments', data: payments, backgroundColor: 'rgba(244, 63, 94, 0.8)', borderRadius: 4 },
          { type: 'line', label: 'Closing Balance', data: balances, borderColor: '#0ea5e9', borderWidth: 2.5, pointRadius: 3, tension: 0.2 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8', font: { size: 10 } } },
          y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8', callback: v => `₹${(v/100000).toFixed(0)}L` } }
        }
      }
    });
  }

  const ctxDonut = document.getElementById('expenseCategoryDonutChart');
  if (ctxDonut) {
    if (donutChart) donutChart.destroy();
    donutChart = new Chart(ctxDonut.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['Utilities & Services (BESCOM/Water)', 'Staff Salaries & Security', 'Repairs & Maintenance', 'Lift & DG Diesel Maintenance', 'Misc & Office Admin'],
        datasets: [{
          data: [18450000, 15200000, 8900000, 6500000, 3200000],
          backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'],
          borderWidth: 0,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: { legend: { display: false } }
      }
    });
  }

  setElText('cat-fixed-amt', '₹1.85 Cr');
  setElText('cat-salaries-amt', '₹1.52 Cr');
  setElText('cat-repairs-amt', '₹89.0 L');
}

function updateTrendChartMode(mode) {
  currentTrendMode = mode;
  ['all', 'fy2425', 'fy2526'].forEach(m => {
    const btn = document.getElementById(`btn-chart-${m}`);
    if (btn) {
      if (m === mode) {
        btn.classList.add('bg-cyan-600', 'text-white');
        btn.classList.remove('text-slate-400');
      } else {
        btn.classList.remove('bg-cyan-600', 'text-white');
        btn.classList.add('text-slate-400');
      }
    }
  });
  renderOverviewCharts();
}

// 3. Render EMI Wise Payment Status by Block in Overview Tab
function renderOverviewBlocksAndBanks() {
  const blocks = financialData.lift_project?.blocks || [];

  // Bank Positions (3-col responsive grid)
  const banksList = document.getElementById('overview-bank-positions-list');
  if (banksList) {
    const banks = [
      { name: 'ICICI Bank Ltd (Current A/c)', amt: 1045000.0, note: 'Primary Operational Account', color: 'text-cyan-400', border: 'border-cyan-500/30' },
      { name: 'IDFC First Bank (Savings)', amt: 161257.32, note: 'Maintenance & Capex Pool', color: 'text-emerald-400', border: 'border-emerald-500/30' },
      { name: 'ICICI Bank (SB A/c)', amt: 104354.55, note: 'Interest Reserve Account', color: 'text-blue-400', border: 'border-blue-500/30' }
    ];
    banksList.innerHTML = banks.map(b => `
      <div class="p-3 rounded-xl bg-slate-900/60 border ${b.border} flex items-center justify-between">
        <div>
          <span class="text-xs font-semibold text-white block">${b.name}</span>
          <span class="text-[10px] text-slate-400">${b.note}</span>
        </div>
        <span class="text-sm sm:text-base font-bold font-mono ${b.color}">${formatINR(b.amt)}</span>
      </div>
    `).join('');
  }

  // Cards View - Focused on % EMI Paid vs Pending EMIs + Complete Amount Details
  const cardsContainer = document.getElementById('overview-lift-cards-container');
  if (cardsContainer) {
    cardsContainer.innerHTML = blocks.map(b => {
      const pctPaid = b.pct_paid || 90.0;
      const pctPending = b.pct_unpaid || (100.0 - pctPaid);
      const paidEMIs = b.paid_emis || (b.total_emis - b.pending_emis);
      const pendingEMIs = b.pending_emis || 0;
      const totalEMIs = b.total_emis || (b.flats_count * 4);
      const targetAmt = b.target || (b.flats_count * 15000.0);
      const pctAmt = b.pct_amount || Math.round((b.collected / targetAmt) * 100 * 10) / 10;

      const statusBadgeClass = pctPaid >= 95 
        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
        : (pctPaid >= 90 ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' : (pctPaid >= 80 ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-rose-500/20 text-rose-300 border-rose-500/40'));

      return `
        <div class="glass-card rounded-2xl p-4 border border-slate-800 space-y-3 relative overflow-hidden group hover:border-amber-500/40 transition">
          <!-- Top Row: Block Title & Status Badge -->
          <div class="flex items-center justify-between pb-2 border-b border-slate-800/80">
            <div class="flex items-center gap-2">
              <div class="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold text-xs">
                ${b.block}
              </div>
              <div>
                <h4 class="font-bold text-white text-sm">Tower ${b.block}</h4>
                <span class="text-[10px] text-slate-400 font-mono">${b.flats_count} Flats • ${totalEMIs} Total EMIs</span>
              </div>
            </div>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${statusBadgeClass} border">
              ${pctPaid}% Paid
            </span>
          </div>

          <!-- Hero Percentage & Pending EMI Highlight -->
          <div class="flex items-baseline justify-between pt-0.5">
            <div>
              <span class="text-2xl font-bold font-mono tracking-tight text-white">${pctPaid}%</span>
              <span class="text-[10px] text-emerald-400 font-semibold block">EMI Installments Paid</span>
            </div>
            <div class="text-right">
              <span class="text-base font-bold font-mono ${pendingEMIs > 0 ? 'text-rose-400' : 'text-emerald-400'}">${pendingEMIs} EMIs</span>
              <span class="text-[10px] text-slate-400 block">${pctPending.toFixed(1)}% Pending</span>
            </div>
          </div>

          <!-- Dual Progress Bar: Green (% Paid) vs Red (% Pending) -->
          <div class="w-full bg-slate-950 h-2.5 rounded-full flex overflow-hidden border border-slate-800 shadow-inner">
            <div class="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-500" style="width: ${pctPaid}%" title="Paid: ${paidEMIs}/${totalEMIs} EMIs (${pctPaid}%)"></div>
            <div class="bg-gradient-to-r from-rose-500 to-pink-600 h-full transition-all duration-500" style="width: ${pctPending}%" title="Pending: ${pendingEMIs}/${totalEMIs} EMIs (${pctPending}%)"></div>
          </div>

          <!-- EMI Metrics Grid -->
          <div class="grid grid-cols-2 gap-2 pt-1 font-mono-numbers text-xs">
            <div class="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
              <span class="text-[10px] text-slate-400 font-sans block">Paid EMIs</span>
              <span class="font-bold text-emerald-400">${paidEMIs} / ${totalEMIs}</span>
            </div>
            <div class="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
              <span class="text-[10px] text-slate-400 font-sans block">Pending EMIs</span>
              <span class="font-bold ${pendingEMIs > 0 ? 'text-rose-400' : 'text-slate-500'}">${pendingEMIs} (${pctPending.toFixed(1)}%)</span>
            </div>
          </div>

          <!-- Complete Monetary Report (Collected, Target to be collected, % of Amount) in Exact Same Font -->
          <div class="pt-2.5 border-t border-slate-800/80 space-y-1.5 text-[11px]">
            <div class="flex items-center justify-between">
              <span class="text-slate-400">Collected Amount:</span>
              <span class="font-mono text-emerald-400 font-semibold">${formatINR(b.collected)}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-slate-400">Amount to be Collected:</span>
              <span class="font-mono text-slate-200 font-semibold">${formatINR(targetAmt)}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-slate-400">% of Amount Collected:</span>
              <span class="font-mono ${pctAmt >= 100 ? 'text-emerald-400' : 'text-amber-300'} font-semibold">${pctAmt}%</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Table Matrix View - Complete 11 Columns Matching Exact Data
  const tableTbody = document.getElementById('overview-lift-table-tbody');
  if (tableTbody) {
    tableTbody.innerHTML = blocks.map(b => {
      const pctPaid = b.pct_paid || 90.0;
      const pctPending = b.pct_unpaid || (100.0 - pctPaid);
      const paidEMIs = b.paid_emis || (b.total_emis - b.pending_emis);
      const pendingEMIs = b.pending_emis || 0;
      const totalEMIs = b.total_emis || (b.flats_count * 4);
      const targetAmt = b.target || (b.flats_count * 15000.0);
      const pctAmt = b.pct_amount || Math.round((b.collected / targetAmt) * 100 * 10) / 10;

      return `
        <tr class="hover:bg-slate-900/60">
          <td class="py-2.5 px-3 font-bold text-white font-sans flex items-center gap-1.5">
            <span class="w-6 h-6 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center justify-center text-[11px]">${b.block}</span>
            Tower ${b.block}
          </td>
          <td class="py-2.5 px-3 text-center text-slate-300 font-mono">${b.flats_count}</td>
          <td class="py-2.5 px-3 text-right font-mono text-slate-300">${totalEMIs}</td>
          <td class="py-2.5 px-3 text-right font-bold font-mono text-emerald-400">${paidEMIs}</td>
          <td class="py-2.5 px-3 text-right font-bold font-mono ${pendingEMIs > 0 ? 'text-rose-400' : 'text-slate-500'}">${pendingEMIs}</td>
          <td class="py-2.5 px-3 text-center"><span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">${pctPaid}%</span></td>
          <td class="py-2.5 px-3 text-center"><span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono ${pctPending > 0 ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30' : 'bg-slate-800 text-slate-400'}">${pctPending.toFixed(1)}%</span></td>
          <td class="py-2.5 px-3 text-right font-mono text-slate-300">${formatINR(targetAmt)}</td>
          <td class="py-2.5 px-3 text-right font-bold font-mono text-emerald-400">${formatINR(b.collected)}</td>
          <td class="py-2.5 px-3 text-center"><span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono ${pctAmt >= 100 ? 'text-emerald-300 bg-emerald-500/10' : 'text-amber-300 bg-amber-500/10'}">${pctAmt}%</span></td>
          <td class="py-2.5 px-3 text-center font-sans">
            <span class="px-2 py-0.5 rounded text-[10px] ${pctPaid >= 90 ? 'text-emerald-300 bg-emerald-500/10' : 'text-amber-300 bg-amber-500/10'}">${b.status}</span>
          </td>
        </tr>
      `;
    }).join('') + `
      <!-- Total Summary Row -->
      <tr class="bg-slate-900 font-bold border-t-2 border-slate-700 text-xs">
        <td class="py-3 px-3 text-white font-sans">TOTAL SOCIETY</td>
        <td class="py-3 px-3 text-center text-amber-300 font-mono">356 Flats</td>
        <td class="py-3 px-3 text-right text-amber-300 font-mono">1,424 EMIs</td>
        <td class="py-3 px-3 text-right text-emerald-400 font-mono">1,275 Paid</td>
        <td class="py-3 px-3 text-right text-rose-400 font-mono">149 Pending</td>
        <td class="py-3 px-3 text-center text-emerald-400 font-mono">89.54%</td>
        <td class="py-3 px-3 text-center text-rose-400 font-mono">10.46%</td>
        <td class="py-3 px-3 text-right text-slate-200 font-mono">₹53,40,000</td>
        <td class="py-3 px-3 text-right text-emerald-400 font-mono">₹47,24,217</td>
        <td class="py-3 px-3 text-center text-amber-300 font-mono">88.5%</td>
        <td class="py-3 px-3 text-center text-emerald-400 font-sans">Active Demand</td>
      </tr>
    `;
  }
}

function toggleOverviewLiftView(mode) {
  currentOverviewLiftView = mode;
  const cardsContainer = document.getElementById('overview-lift-cards-container');
  const tableContainer = document.getElementById('overview-lift-table-container');
  const btnCards = document.getElementById('btn-view-lift-cards');
  const btnTable = document.getElementById('btn-view-lift-table');

  if (mode === 'cards') {
    if (cardsContainer) cardsContainer.classList.remove('hidden');
    if (tableContainer) tableContainer.classList.add('hidden');
    if (btnCards) {
      btnCards.classList.add('bg-amber-500', 'text-slate-950', 'font-bold');
      btnCards.classList.remove('text-slate-400');
    }
    if (btnTable) {
      btnTable.classList.remove('bg-amber-500', 'text-slate-950', 'font-bold');
      btnTable.classList.add('text-slate-400');
    }
  } else {
    if (cardsContainer) cardsContainer.classList.add('hidden');
    if (tableContainer) tableContainer.classList.remove('hidden');
    if (btnTable) {
      btnTable.classList.add('bg-amber-500', 'text-slate-950', 'font-bold');
      btnTable.classList.remove('text-slate-400');
    }
    if (btnCards) {
      btnCards.classList.remove('bg-amber-500', 'text-slate-950', 'font-bold');
      btnCards.classList.add('text-slate-400');
    }
  }
}

function renderMultiYearTab() {
  const records = financialData.monthly_records || [];
  const dropdown = document.getElementById('month-dropdown');
  if (dropdown && (!dropdown.options || dropdown.options.length === 0)) {
    dropdown.innerHTML = records.map((r, i) => `<option value="${i}">${r.month}</option>`).join('');
    dropdown.selectedIndex = records.length - 1;
  }
  const idx = dropdown ? parseInt(dropdown.value, 10) || (records.length - 1) : 0;
  renderSelectedMonthData(idx);
  renderFullMatrixTable();
}

function renderSelectedMonthData(idx) {
  const records = financialData.monthly_records || [];
  const rec = records[idx] || records[records.length - 1];
  if (!rec) return;

  setElText('sel-month-opening', formatINR(rec.opening_balance));
  setElText('sel-month-receipts', formatINR(rec.receipts_total));
  setElText('sel-month-payments', formatINR(rec.payments_total));
  setElText('sel-month-closing', formatINR(rec.closing_balance));

  setElText('receipts-month-label', rec.month);
  setElText('payments-month-label', rec.month);
  setElText('receipts-total-badge', formatINR(rec.receipts_total));
  setElText('payments-total-badge', formatINR(rec.payments_total));

  const rTbody = document.getElementById('month-receipts-tbody');
  if (rTbody) {
    const tot = rec.receipts_total || 1;
    rTbody.innerHTML = (rec.receipts || []).map(r => {
      const p = ((r.amount / tot) * 100).toFixed(1);
      return `<tr class="hover:bg-slate-900/50"><td class="py-2 px-2.5 font-sans">${r.item}</td><td class="py-2 px-2.5 text-right font-bold text-emerald-400">${formatINR(r.amount)}</td><td class="py-2 px-2.5 text-right text-slate-400">${p}%</td></tr>`;
    }).join('') || '<tr><td colspan="3" class="py-4 text-center text-slate-500">No items</td></tr>';
  }

  const pTbody = document.getElementById('month-payments-tbody');
  if (pTbody) {
    const tot = rec.payments_total || 1;
    pTbody.innerHTML = (rec.payments || []).map(p => {
      const pct = ((p.amount / tot) * 100).toFixed(1);
      return `<tr class="hover:bg-slate-900/50"><td class="py-2 px-2.5 font-sans">${p.item}</td><td class="py-2 px-2.5 text-right font-bold text-rose-400">${formatINR(p.amount)}</td><td class="py-2 px-2.5 text-right text-slate-400">${pct}%</td></tr>`;
    }).join('') || '<tr><td colspan="3" class="py-4 text-center text-slate-500">No items</td></tr>';
  }
}

function renderFullMatrixTable() {
  const table = document.getElementById('full-statement-matrix');
  const records = financialData.monthly_records || [];
  const matrix = financialData.matrix_rows || [];
  if (!table || matrix.length === 0) return;

  const months = records.map(r => r.month);
  let html = `<thead class="text-slate-400 uppercase bg-slate-900/90 sticky top-0"><tr><th class="py-2.5 px-3 sticky left-0 bg-slate-900 z-20">Particulars</th>`;
  months.forEach(m => { html += `<th class="py-2.5 px-3 text-right whitespace-nowrap">${m}</th>`; });
  html += `</tr></thead><tbody class="divide-y divide-slate-800/60 font-mono-numbers">`;

  matrix.forEach(row => {
    html += `<tr class="hover:bg-slate-900/50"><td class="py-2 px-3 sticky left-0 bg-slate-950 font-sans font-medium text-slate-200 whitespace-nowrap">${row.line_item}</td>`;
    months.forEach(m => {
      const val = row.monthly_values[m] || 0;
      html += `<td class="py-2 px-3 text-right ${val > 0 ? 'text-slate-200' : 'text-slate-600'}">${val ? formatINR(val) : '-'}</td>`;
    });
    html += `</tr>`;
  });
  html += `</tbody>`;
  table.innerHTML = html;
}

// 4. Render Lift Tab - Graph & Cards as per % of EMI and Pending EMI + Complete Amount Details
function renderLiftTab() {
  if (!financialData) {
    if (typeof window !== 'undefined' && window.EMBEDDED_JGAOWA_DATA) financialData = window.EMBEDDED_JGAOWA_DATA;
    else financialData = {};
  }
  const lift = financialData.lift_project || {};
  const blocks = lift.blocks || [];

  // Graph as per % of EMI and Pending EMI
  const ctxLiftBar = document.getElementById('liftPaidVsUnpaidChart');
  if (ctxLiftBar) {
    if (liftBarChart) liftBarChart.destroy();
    
    const labels = blocks.map(b => `Tower ${b.block}`);
    const paidPct = blocks.map(b => b.pct_paid);
    const pendingPct = blocks.map(b => b.pct_unpaid);

    liftBarChart = new Chart(ctxLiftBar.getContext('2d'), {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: '% EMI Installments Paid',
            data: paidPct,
            backgroundColor: 'rgba(16, 185, 129, 0.85)',
            borderRadius: 4
          },
          {
            label: '% Pending EMIs',
            data: pendingPct,
            backgroundColor: 'rgba(244, 63, 94, 0.85)',
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#cbd5e1', font: { size: 11, weight: '600' } } },
          y: {
            stacked: true,
            max: 100,
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#94a3b8', callback: v => `${v}%` }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(ctx) {
                const b = blocks[ctx.dataIndex];
                if (ctx.datasetIndex === 0) {
                  return `Paid: ${b.pct_paid}% (${b.paid_emis} of ${b.total_emis} EMIs)`;
                } else {
                  return `Pending: ${b.pct_unpaid}% (${b.pending_emis} of ${b.total_emis} EMIs)`;
                }
              },
              afterLabel: function(ctx) {
                const b = blocks[ctx.dataIndex];
                const targetAmt = b.target || (b.flats_count * 15000.0);
                const pctAmt = b.pct_amount || Math.round((b.collected / targetAmt) * 100 * 10) / 10;
                return `Collected: ${formatINR(b.collected)} / Target: ${formatINR(targetAmt)} (${pctAmt}%)`;
              }
            }
          }
        }
      }
    });
  }

  // Render Detailed Cards on Lift Tab with Exact Same Font for Collected, Target, and % of Amount
  const grid = document.getElementById('lift-blocks-detail-grid');
  if (grid) {
    grid.innerHTML = blocks.map(b => {
      const pctPaid = b.pct_paid || 90.0;
      const pctPending = b.pct_unpaid || (100.0 - pctPaid);
      const paidEMIs = b.paid_emis || (b.total_emis - b.pending_emis);
      const pendingEMIs = b.pending_emis || 0;
      const totalEMIs = b.total_emis || (b.flats_count * 4);
      const targetAmt = b.target || (b.flats_count * 15000.0);
      const pctAmt = b.pct_amount || Math.round((b.collected / targetAmt) * 100 * 10) / 10;

      return `
        <div class="glass-card rounded-2xl p-4 border border-slate-800 space-y-3 relative overflow-hidden group hover:border-amber-500/40 transition">
          <div class="flex items-center justify-between pb-2 border-b border-slate-800/80">
            <div class="flex items-center gap-2">
              <div class="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold text-xs">
                ${b.block}
              </div>
              <div>
                <h4 class="font-bold text-white text-sm">Tower ${b.block}</h4>
                <span class="text-[10px] text-slate-400 font-mono">${b.flats_count} Flats • ${totalEMIs} Total EMIs</span>
              </div>
            </div>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${pctPaid >= 90 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'}">
              ${pctPaid}% Paid
            </span>
          </div>

          <div class="flex items-baseline justify-between pt-0.5">
            <div>
              <span class="text-2xl font-bold font-mono tracking-tight text-white">${pctPaid}%</span>
              <span class="text-[10px] text-emerald-400 font-semibold block">EMI Installments Paid</span>
            </div>
            <div class="text-right">
              <span class="text-base font-bold font-mono ${pendingEMIs > 0 ? 'text-rose-400' : 'text-emerald-400'}">${pendingEMIs} EMIs</span>
              <span class="text-[10px] text-slate-400 block">${pctPending.toFixed(1)}% Pending</span>
            </div>
          </div>

          <div class="w-full bg-slate-950 h-2.5 rounded-full flex overflow-hidden border border-slate-800 shadow-inner">
            <div class="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-500" style="width: ${pctPaid}%" title="Paid: ${paidEMIs}/${totalEMIs} EMIs"></div>
            <div class="bg-gradient-to-r from-rose-500 to-pink-600 h-full transition-all duration-500" style="width: ${pctPending}%" title="Pending: ${pendingEMIs}/${totalEMIs} EMIs"></div>
          </div>

          <div class="grid grid-cols-2 gap-2 pt-1 font-mono-numbers text-xs">
            <div class="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
              <span class="text-[10px] text-slate-400 font-sans block">Paid EMIs</span>
              <span class="font-bold text-emerald-400">${paidEMIs} / ${totalEMIs}</span>
            </div>
            <div class="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
              <span class="text-[10px] text-slate-400 font-sans block">Pending EMIs</span>
              <span class="font-bold ${pendingEMIs > 0 ? 'text-rose-400' : 'text-slate-500'}">${pendingEMIs} (${pctPending.toFixed(1)}%)</span>
            </div>
          </div>

          <!-- Complete Monetary Report in Exact Same Font -->
          <div class="pt-2.5 border-t border-slate-800/80 space-y-1.5 text-[11px]">
            <div class="flex items-center justify-between">
              <span class="text-slate-400">Collected Amount:</span>
              <span class="font-mono text-emerald-400 font-semibold">${formatINR(b.collected)}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-slate-400">Amount to be Collected:</span>
              <span class="font-mono text-slate-200 font-semibold">${formatINR(targetAmt)}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-slate-400">% of Amount Collected:</span>
              <span class="font-mono ${pctAmt >= 100 ? 'text-emerald-400' : 'text-amber-300'} font-semibold">${pctAmt}%</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  renderDefaultersTable();
}

let currentDefaulterView = 'boxes';

function renderDefaultersTable() {
  if (!financialData) {
    if (typeof window !== 'undefined' && window.EMBEDDED_JGAOWA_DATA) financialData = window.EMBEDDED_JGAOWA_DATA;
    else financialData = {};
  }
  const allDefs = (financialData && financialData.lift_project && financialData.lift_project.defaulters) ? financialData.lift_project.defaulters : [];
  const sInput = (document.getElementById('defaulter-search-input')?.value || '').toLowerCase().trim();
  const bFilter = document.getElementById('defaulter-block-filter')?.value || 'ALL';
  const sortMode = document.getElementById('defaulter-sort-select')?.value || 'most_pending';

  // Count pills across all defaulters
  const c4 = allDefs.filter(d => d.months_pending >= 4).length;
  const c3 = allDefs.filter(d => d.months_pending === 3).length;
  const c2 = allDefs.filter(d => d.months_pending === 2).length;
  const c1 = allDefs.filter(d => d.months_pending <= 1).length;

  setElText('pill-count-4mo', `${c4} Flats`);
  setElText('pill-count-3mo', `${c3} Flats`);
  setElText('pill-count-2mo', `${c2} Flats`);
  setElText('pill-count-1mo', `${c1} Flats`);

  // Filter
  let filtered = allDefs.filter(d => {
    const matchSearch = !sInput || d.flat.toLowerCase().includes(sInput) || d.description.toLowerCase().includes(sInput) || d.status.toLowerCase().includes(sInput);
    const matchBlock = bFilter === 'ALL' || d.block === bFilter;
    return matchSearch && matchBlock;
  });

  // Sort
  if (sortMode === 'most_pending') {
    filtered.sort((a, b) => b.months_pending - a.months_pending || a.block.localeCompare(b.block) || a.flat.localeCompare(b.flat));
  } else if (sortMode === 'least_pending') {
    filtered.sort((a, b) => a.months_pending - b.months_pending || a.block.localeCompare(b.block) || a.flat.localeCompare(b.flat));
  } else if (sortMode === 'block_asc') {
    filtered.sort((a, b) => a.block.localeCompare(b.block) || a.flat.localeCompare(b.flat));
  } else if (sortMode === 'amount_desc') {
    filtered.sort((a, b) => (b.amount_due || (b.months_pending * 3750)) - (a.amount_due || (a.months_pending * 3750)));
  }

  setElText('defaulter-count-badge', `${filtered.length} Units`);

  // 1. Render Square Boxes Grid
  const boxesContainer = document.getElementById('defaulter-boxes-container');
  if (boxesContainer) {
    if (filtered.length === 0) {
      boxesContainer.innerHTML = `<div class="col-span-full py-8 text-center text-slate-500 text-xs">No pending units match your search filter.</div>`;
    } else {
      boxesContainer.innerHTML = filtered.map(d => {
        const mo = d.months_pending || 1;
        const amt = d.amount_due || (mo * 3750);
        
        let cardBg = 'bg-slate-900/70 border-slate-800';
        let badgeBg = 'bg-slate-800 text-slate-300 border-slate-700';
        let moColor = 'text-slate-200';
        let dotColor = 'bg-slate-500';

        if (mo >= 4) {
          cardBg = 'bg-rose-950/30 border-rose-500/40 hover:border-rose-500/70';
          badgeBg = 'bg-rose-500/20 text-rose-300 border-rose-500/40';
          moColor = 'text-rose-400 font-bold';
          dotColor = 'bg-rose-500';
        } else if (mo === 3) {
          cardBg = 'bg-orange-950/20 border-orange-500/40 hover:border-orange-500/70';
          badgeBg = 'bg-orange-500/20 text-orange-300 border-orange-500/40';
          moColor = 'text-orange-400 font-bold';
          dotColor = 'bg-orange-500';
        } else if (mo === 2) {
          cardBg = 'bg-amber-950/20 border-amber-500/30 hover:border-amber-500/60';
          badgeBg = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
          moColor = 'text-amber-400 font-bold';
          dotColor = 'bg-amber-500';
        }

        // Urgency dots
        const dotsHtml = Array.from({ length: 4 }).map((_, i) => 
          `<span class="w-1.5 h-1.5 rounded-full ${i < mo ? dotColor : 'bg-slate-800'}"></span>`
        ).join('');

        return `
          <div class="glass-card rounded-xl p-3 border ${cardBg} flex flex-col justify-between space-y-2 relative overflow-hidden group hover:scale-[1.02] transition shadow-md">
            <!-- Header: Flat & Tower -->
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1.5">
                <span class="w-6 h-6 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold text-[10px]">
                  ${d.block}
                </span>
                <span class="font-bold text-white text-xs tracking-tight">${d.flat}</span>
              </div>
              <span class="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${badgeBg} border">
                ${mo} Mo
              </span>
            </div>

            <!-- Overdue Metrics -->
            <div class="space-y-0.5">
              <span class="text-[10px] text-slate-400 block font-sans">Pending Dues</span>
              <div class="flex items-baseline justify-between">
                <span class="text-sm font-bold font-mono ${moColor}">${formatINR(amt)}</span>
                <div class="flex items-center gap-0.5" title="${mo} of 4 Installments Overdue">
                  ${dotsHtml}
                </div>
              </div>
            </div>

            <!-- Note / Stage Description -->
            <div class="pt-1.5 border-t border-slate-800/80 text-[10px] text-slate-400 truncate" title="${d.description}">
              ${d.description}
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // 2. Render Table View
  const tbody = document.getElementById('lift-defaulters-tbody');
  if (tbody) {
    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-slate-500 text-xs">No pending units found.</td></tr>`;
    } else {
      tbody.innerHTML = filtered.map(d => {
        const mo = d.months_pending || 1;
        const amt = d.amount_due || (mo * 3750);
        return `
          <tr class="hover:bg-slate-900/60">
            <td class="py-2.5 px-3 font-bold text-white font-sans">${d.flat}</td>
            <td class="py-2.5 px-3 font-semibold text-cyan-400 font-sans">${d.block}</td>
            <td class="py-2.5 px-3 text-slate-300 font-sans">${d.description}</td>
            <td class="py-2.5 px-3 text-center text-amber-400 font-bold font-mono">${mo} Mo Overdue</td>
            <td class="py-2.5 px-3 text-right font-bold font-mono ${mo >= 4 ? 'text-rose-400' : 'text-slate-200'}">${formatINR(amt)}</td>
            <td class="py-2.5 px-3 text-center">
              <span class="px-2 py-0.5 rounded text-[10px] font-sans font-medium ${mo >= 4 ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : (mo >= 2 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-slate-800 text-slate-300 border border-slate-700')}">${d.status}</span>
            </td>
          </tr>
        `;
      }).join('');
    }
  }
}

function filterDefaulters() {
  renderDefaultersTable();
}

function toggleDefaulterView(mode) {
  currentDefaulterView = mode;
  const boxes = document.getElementById('defaulter-boxes-container');
  const table = document.getElementById('defaulter-table-container');
  const btnBoxes = document.getElementById('btn-view-def-boxes');
  const btnTable = document.getElementById('btn-view-def-table');

  if (mode === 'boxes') {
    if (boxes) boxes.classList.remove('hidden');
    if (table) table.classList.add('hidden');
    if (btnBoxes) {
      btnBoxes.classList.add('bg-rose-500', 'text-white', 'font-bold');
      btnBoxes.classList.remove('text-slate-400');
    }
    if (btnTable) {
      btnTable.classList.remove('bg-rose-500', 'text-white', 'font-bold');
      btnTable.classList.add('text-slate-400');
    }
  } else {
    if (boxes) boxes.classList.add('hidden');
    if (table) table.classList.remove('hidden');
    if (btnTable) {
      btnTable.classList.add('bg-rose-500', 'text-white', 'font-bold');
      btnTable.classList.remove('text-slate-400');
    }
    if (btnBoxes) {
      btnBoxes.classList.remove('bg-rose-500', 'text-white', 'font-bold');
      btnBoxes.classList.add('text-slate-400');
    }
  }
}

function renderPaintingTab() {
  const p = financialData.painting_project || {};
  const tbody = document.getElementById('painting-items-tbody');
  if (tbody) {
    tbody.innerHTML = (p.items || []).map(i => `
      <tr class="hover:bg-slate-900/50">
        <td class="py-2 px-3 font-sans font-medium text-white">${i.item}</td>
        <td class="py-2 px-3 text-slate-400 font-sans">${i.category}</td>
        <td class="py-2 px-3 text-right font-bold text-rose-400">${formatINR(i.amount)}</td>
        <td class="py-2 px-3 text-right text-slate-400">${i.pct || 0}%</td>
      </tr>
    `).join('');
  }

  const ctxPie = document.getElementById('paintingPieChart');
  if (ctxPie) {
    if (paintingChart) paintingChart.destroy();
    paintingChart = new Chart(ctxPie.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['Painting Contractor', 'Water Softener Plant', 'Polycarbonate Canopies', 'Labour & Materials', 'Civil Repairs & Misc'],
        datasets: [{
          data: [4212000, 1017854, 580700, 593507, 326623],
          backgroundColor: ['#6366f1', '#06b6d4', '#f59e0b', '#10b981', '#ec4899'],
          borderWidth: 0
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
  }
}

function renderLiquidityTab() {
  const cardsGrid = document.getElementById('treasury-cards-grid');
  if (cardsGrid) {
    const banks = [
      { name: 'ICICI Bank Ltd (Current A/c)', amt: 1045000.0, note: 'Primary Operational Account', color: 'border-cyan-500/30' },
      { name: 'IDFC First Bank (Savings)', amt: 161257.32, note: 'Maintenance & Capex Pool', color: 'border-emerald-500/30' },
      { name: 'ICICI Bank (SB A/c)', amt: 104354.55, note: 'Interest Reserve Account', color: 'border-blue-500/30' },
      { name: 'Petty Cash in Hand', amt: 0.0, note: 'Reconciled Office Cash', color: 'border-amber-500/30' }
    ];
    cardsGrid.innerHTML = banks.map(b => `
      <div class="glass-card rounded-xl p-4 border ${b.color} space-y-2">
        <span class="text-xs text-slate-400 block">${b.name}</span>
        <span class="text-xl font-bold font-mono text-white block">${formatINR(b.amt)}</span>
        <p class="text-[11px] text-slate-400 font-sans">${b.note}</p>
      </div>
    `).join('');
  }

  const ctxBank = document.getElementById('bankLiquidityChart');
  if (ctxBank) {
    if (bankChart) bankChart.destroy();
    const records = financialData.monthly_records || [];
    bankChart = new Chart(ctxBank.getContext('2d'), {
      type: 'line',
      data: {
        labels: records.map(r => r.month),
        datasets: [
          { label: 'ICICI Current', data: records.map(r => r.bank_balances?.icici_current || 0), borderColor: '#0ea5e9', backgroundColor: 'rgba(14, 165, 233, 0.1)', fill: true, tension: 0.3 },
          { label: 'IDFC First Bank', data: records.map(r => r.bank_balances?.idfc_first || 0), borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.3 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: { size: 10 } } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', callback: v => `₹${(v/100000).toFixed(0)}L` } }
        }
      }
    });
  }
}

function setupSimulationDefaults() {
  runSimulation();
}

function runSimulation() {
  const col = parseInt(document.getElementById('sim-slider-collection')?.value || 95, 10);
  const inf = parseInt(document.getElementById('sim-slider-inflation')?.value || 5, 10);
  const capex = parseInt(document.getElementById('sim-slider-capex')?.value || 50000, 10);

  setElText('sim-val-collection', `${col}%`);
  setElText('sim-val-inflation', `${inf > 0 ? '+' : ''}${inf}%`);
  setElText('sim-val-capex', formatINR(capex));

  const baseInflow = 950000.0 * (col / 100);
  const baseOutflow = 880000.0 * (1 + inf / 100) + capex;
  const net = baseInflow - baseOutflow;

  setElText('sim-res-inflow', formatINR(baseInflow));
  setElText('sim-res-outflow', formatINR(baseOutflow));
  setElText('sim-res-net', formatINR(net));

  const ctxSim = document.getElementById('simulationForecastChart');
  if (ctxSim) {
    if (simChart) simChart.destroy();
    const months = ['Month 1', 'Month 3', 'Month 6', 'Month 9', 'Month 12'];
    let curRes = 1310611.0;
    const traj = months.map(() => {
      curRes += (net * 2.5);
      return curRes;
    });

    simChart = new Chart(ctxSim.getContext('2d'), {
      type: 'line',
      data: {
        labels: months,
        datasets: [{ label: 'Forecasted Reserve', data: traj, borderColor: '#0ea5e9', backgroundColor: 'rgba(14, 165, 233, 0.15)', fill: true, tension: 0.3 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
  }
}

function resetSimulator() {
  if (document.getElementById('sim-slider-collection')) document.getElementById('sim-slider-collection').value = 95;
  if (document.getElementById('sim-slider-inflation')) document.getElementById('sim-slider-inflation').value = 5;
  if (document.getElementById('sim-slider-capex')) document.getElementById('sim-slider-capex').value = 50000;
  runSimulation();
}

function manualSelectTab(tabId) {
  if (isPresentationRunning) stopPresentationMode();
  switchTab(tabId);
}

function switchTab(tabId) {
  currentTab = tabId;
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(el => {
    el.classList.remove('active', 'bg-cyan-500/20', 'text-cyan-400', 'border-cyan-500/40');
    el.classList.add('text-slate-400', 'border-transparent');
  });

  const activePane = document.getElementById(`tab-${tabId}`);
  const activeBtn = document.getElementById(`tab-btn-${tabId}`);
  if (activePane) activePane.classList.add('active');
  if (activeBtn) {
    activeBtn.classList.add('active', 'bg-cyan-500/20', 'text-cyan-400', 'border-cyan-500/40');
    activeBtn.classList.remove('text-slate-400', 'border-transparent');
  }
  
  // Trigger specific re-renders so hidden canvases render with proper width
  try {
    if (tabId === 'lift') renderLiftTab();
    else if (tabId === 'overview') { renderOverviewCharts(); renderOverviewBlocksAndBanks(); }
    else if (tabId === 'multi-year') renderMultiYearTab();
    else if (tabId === 'painting') renderPaintingTab();
    else if (tabId === 'liquidity') renderLiquidityTab();
  } catch(e) {
    console.error("Tab switch render note:", e);
  }

  if (window.lucide) {
    try { lucide.createIcons(); } catch(e){}
  }
}

function changePresentationSpeed(val) {
  slideDuration = parseInt(val, 10) || 25000;
  slideElapsed = 0;
  updateProgressBar();
}

function updateProgressBar() {
  const bar = document.getElementById('slide-progress-bar');
  if (bar) {
    const pct = Math.min((slideElapsed / slideDuration) * 100, 100);
    bar.style.width = `${pct}%`;
  }
}

function togglePresentationMode() {
  if (isPresentationRunning) stopPresentationMode();
  else startPresentationMode();
}

function startPresentationMode() {
  isPresentationRunning = true;
  slideElapsed = 0;

  const btn = document.getElementById('btn-presentation-mode');
  const btnText = document.getElementById('presentation-btn-text');
  const speedControl = document.getElementById('presentation-speed-control');
  const progressContainer = document.getElementById('presentation-progress-container');

  if (btn) {
    btn.classList.add('bg-amber-500/20', 'text-amber-300', 'border-amber-500/40');
    btn.classList.remove('bg-slate-800', 'text-slate-300');
  }
  if (btnText) btnText.textContent = 'Auto-Cycle: ON';
  if (speedControl) speedControl.classList.remove('hidden'), speedControl.classList.add('flex');
  if (progressContainer) progressContainer.classList.remove('hidden');

  if (presentationTimer) clearInterval(presentationTimer);

  presentationTimer = setInterval(() => {
    if (isMouseHovered) return;
    slideElapsed += 200;
    updateProgressBar();
    if (slideElapsed >= slideDuration) {
      slideElapsed = 0;
      updateProgressBar();
      let idx = presentationTabs.indexOf(currentTab);
      idx = (idx + 1) % presentationTabs.length;
      switchTab(presentationTabs[idx]);
    }
  }, 200);
}

function stopPresentationMode() {
  isPresentationRunning = false;
  slideElapsed = 0;
  if (presentationTimer) clearInterval(presentationTimer);

  const btn = document.getElementById('btn-presentation-mode');
  const btnText = document.getElementById('presentation-btn-text');
  const speedControl = document.getElementById('presentation-speed-control');
  const progressContainer = document.getElementById('presentation-progress-container');
  const hoverBadge = document.getElementById('hover-pause-indicator');

  if (btn) {
    btn.classList.remove('bg-amber-500/20', 'text-amber-300', 'border-amber-500/40');
    btn.classList.add('bg-slate-800', 'text-slate-300');
  }
  if (btnText) btnText.textContent = 'Auto-Cycle';
  if (speedControl) speedControl.classList.add('hidden'), speedControl.classList.remove('flex');
  if (progressContainer) progressContainer.classList.add('hidden');
  if (hoverBadge) hoverBadge.classList.add('hidden'), hoverBadge.classList.remove('inline-flex');
}

function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark');
  const icon = document.getElementById('theme-icon');
  if (icon) {
    icon.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
    if (window.lucide) lucide.createIcons();
  }
}

function exportMonthToCSV() {
  const records = financialData?.monthly_records || [];
  const dropdown = document.getElementById('month-dropdown');
  const idx = dropdown ? parseInt(dropdown.value, 10) : 0;
  const rec = records[idx];
  if (!rec) return;

  let csv = `Type,Particulars,Amount\n`;
  (rec.receipts || []).forEach(r => { csv += `"Receipt","${r.item}",${r.amount}\n`; });
  (rec.payments || []).forEach(p => { csv += `"Payment","${p.item}",${p.amount}\n`; });
  downloadBlob(csv, `JGAOWA_${rec.month}_Financials.csv`, 'text/csv');
}

function exportFullMatrixCSV() {
  const records = financialData?.monthly_records || [];
  const matrix = financialData?.matrix_rows || [];
  const months = records.map(r => r.month);

  let csv = `Particulars,${months.join(',')}\n`;
  matrix.forEach(row => {
    const vals = months.map(m => row.monthly_values[m] || 0);
    csv += `"${row.line_item}",${vals.join(',')}\n`;
  });
  downloadBlob(csv, `JGAOWA_Full_23M_Matrix.csv`, 'text/csv');
}

function exportDefaultersCSV() {
  const defs = financialData?.lift_project?.defaulters || [];
  let csv = `Flat,Block,Description,Months Pending,Status\n`;
  defs.forEach(d => {
    csv += `"${d.flat}","${d.block}","${d.description}",${d.months_pending},"${d.status}"\n`;
  });
  downloadBlob(csv, `JGAOWA_Lift_Defaulters.csv`, 'text/csv');
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}


// ============================================================
// LIVE EXCEL FILE-WATCHER & AUTO-REFRESH CLIENT (APPROACH 1)
// ============================================================
let clientDataVersion = null;
let liveWatcherTimer = null;

function startLiveWatcherPolling() {
  if (liveWatcherTimer) clearInterval(liveWatcherTimer);
  
  // Check version every 1.8 seconds
  liveWatcherTimer = setInterval(() => {
    fetch('/api/version', { cache: 'no-cache' })
      .then(r => r.json())
      .then(info => {
        if (!clientDataVersion) {
          clientDataVersion = info.version;
          return;
        }
        if (info.version && info.version !== clientDataVersion) {
          console.log(`[LIVE SYNC DETECTED] Server version changed: ${clientDataVersion} -> ${info.version}`);
          clientDataVersion = info.version;
          onExcelFileChanged(info);
        }
      })
      .catch(err => {
        // Silent catch when offline or on file:/// mode
      });
  }, 1800);
}

function onExcelFileChanged(info) {
  showSyncToast(info?.last_updated || 'Just now');
  fetch('/api/financials', { cache: 'no-cache' })
    .then(r => r.json())
    .then(freshData => {
      financialData = freshData;
      renderAll();
      console.log('[LIVE SYNC] Dashboard refreshed dynamically with latest Excel data!');
    })
    .catch(e => console.error("Error fetching fresh data:", e));
}

function triggerManualSync() {
  const badge = document.getElementById('live-watcher-badge');
  if (badge) badge.textContent = 'Syncing...';
  fetch('/api/sync-now')
    .then(r => r.json())
    .then(d => {
      clientDataVersion = d.version;
      onExcelFileChanged({ last_updated: 'Manual Sync' });
      if (badge) badge.textContent = 'Auto-Sync: ACTIVE';
    })
    .catch(e => {
      if (badge) badge.textContent = 'Auto-Sync: ACTIVE';
    });
}

function showSyncToast(timeStr) {
  const toast = document.getElementById('live-sync-toast');
  const msg = document.getElementById('live-sync-toast-msg');
  if (msg) msg.textContent = `All 13 towers & statement metrics refreshed at ${timeStr}.`;
  if (toast) {
    toast.classList.remove('translate-y-20', 'opacity-0', 'pointer-events-none');
    toast.classList.add('translate-y-0', 'opacity-100');
    try { if (window.lucide) lucide.createIcons(); } catch(e){}
    setTimeout(() => {
      toast.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none');
      toast.classList.remove('translate-y-0', 'opacity-100');
    }, 4000);
  }
}


// ==========================================
// JGAOWA VOICE DATA ASSISTANT ENGINE
// ==========================================
let isVoiceModalOpen = false;
let isVoiceAudioEnabled = true;
let isListening = false;
let speechRecognizer = null;

function toggleVoiceAssistantModal() {
  const modal = document.getElementById('voice-assistant-modal');
  const triggerBtn = document.getElementById('voice-trigger-btn');
  if (!modal) return;

  isVoiceModalOpen = !isVoiceModalOpen;
  if (isVoiceModalOpen) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (triggerBtn) triggerBtn.classList.add('hidden');
    try { if (window.lucide) lucide.createIcons(); } catch(e){}
    // Auto scroll chat to bottom
    const stream = document.getElementById('voice-chat-stream');
    if (stream) stream.scrollTop = stream.scrollHeight;
  } else {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    if (triggerBtn) triggerBtn.classList.remove('hidden');
    stopVoiceListening();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }
}

function toggleVoiceAudio() {
  isVoiceAudioEnabled = !isVoiceAudioEnabled;
  const icon = document.getElementById('voice-audio-icon');
  const btn = document.getElementById('voice-audio-toggle-btn');
  if (isVoiceAudioEnabled) {
    if (icon) icon.setAttribute('data-lucide', 'volume-2');
    if (btn) btn.className = 'p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 text-xs';
  } else {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (icon) icon.setAttribute('data-lucide', 'volume-x');
    if (btn) btn.className = 'p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-500 border border-slate-700 text-xs';
  }
  try { if (window.lucide) lucide.createIcons(); } catch(e){}
}

function clearVoiceChatHistory() {
  const stream = document.getElementById('voice-chat-stream');
  if (stream) {
    stream.innerHTML = `
      <div class="flex items-start gap-2.5">
        <div class="w-6 h-6 rounded-md bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center shrink-0 mt-0.5">
          <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
        </div>
        <div class="p-3 rounded-2xl rounded-tl-sm bg-slate-900 border border-slate-800 text-slate-200 leading-relaxed">
          Chat cleared. Ask me any question about the lift collection %, towers, bank balances, or defaulters!
        </div>
      </div>
    `;
    try { if (window.lucide) lucide.createIcons(); } catch(e){}
  }
}

function toggleVoiceListening() {
  if (isListening) {
    stopVoiceListening();
  } else {
    startVoiceListening();
  }
}

function startVoiceListening() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    alert("Speech recognition is not supported in this browser. You can still type your questions in the box below!");
    return;
  }

  if (window.speechSynthesis) window.speechSynthesis.cancel();

  try {
    speechRecognizer = new SpeechRec();
    speechRecognizer.lang = 'en-IN'; // Indian English / Global English
    speechRecognizer.continuous = false;
    speechRecognizer.interimResults = false;

    speechRecognizer.onstart = () => {
      isListening = true;
      const banner = document.getElementById('voice-listening-banner');
      const statusText = document.getElementById('voice-status-text');
      const micBtn = document.getElementById('voice-mic-main-btn');
      if (banner) banner.classList.remove('hidden');
      if (statusText) statusText.textContent = "Listening... Speak your question now";
      if (micBtn) {
        micBtn.classList.remove('bg-cyan-500', 'text-slate-950');
        micBtn.classList.add('bg-rose-500', 'text-white', 'animate-pulse');
      }
    };

    speechRecognizer.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      if (transcript && transcript.trim()) {
        handleUserQuery(transcript.trim());
      }
    };

    speechRecognizer.onerror = (event) => {
      console.warn("Speech recognition error:", event.error);
      stopVoiceListening();
      const statusText = document.getElementById('voice-status-text');
      if (statusText) statusText.textContent = "Could not hear audio. Click mic to try again.";
    };

    speechRecognizer.onend = () => {
      stopVoiceListening();
    };

    speechRecognizer.start();
  } catch (err) {
    console.error("SpeechRec start error:", err);
    stopVoiceListening();
  }
}

function stopVoiceListening() {
  isListening = false;
  if (speechRecognizer) {
    try { speechRecognizer.stop(); } catch(e){}
    speechRecognizer = null;
  }
  const banner = document.getElementById('voice-listening-banner');
  const statusText = document.getElementById('voice-status-text');
  const micBtn = document.getElementById('voice-mic-main-btn');
  if (banner) banner.classList.add('hidden');
  if (statusText) statusText.textContent = "Ready • Click mic to speak";
  if (micBtn) {
    micBtn.classList.remove('bg-rose-500', 'text-white', 'animate-pulse');
    micBtn.classList.add('bg-cyan-500', 'text-slate-950');
  }
}

function handleVoiceTextInput() {
  const input = document.getElementById('voice-text-input');
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;
  input.value = '';
  handleUserQuery(val);
}

function handleQuickVoiceQuery(text) {
  handleUserQuery(text);
}

function handleUserQuery(userText) {
  appendUserMessage(userText);
  const statusText = document.getElementById('voice-status-text');
  if (statusText) statusText.textContent = "Analyzing financial records...";

  setTimeout(() => {
    const answer = processFinancialQuery(userText);
    appendAssistantMessage(answer);
    if (statusText) statusText.textContent = "Ready • Click mic to speak";
    if (isVoiceAudioEnabled) {
      speakText(answer);
    }
  }, 200);
}

function appendUserMessage(text) {
  const stream = document.getElementById('voice-chat-stream');
  if (!stream) return;
  const msgEl = document.createElement('div');
  msgEl.className = 'flex items-start justify-end gap-2.5';
  msgEl.innerHTML = `
    <div class="p-3 rounded-2xl rounded-tr-sm bg-cyan-600/30 border border-cyan-500/40 text-cyan-100 max-w-[85%] leading-relaxed font-medium">
      ${text}
    </div>
    <div class="w-6 h-6 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold">
      YOU
    </div>
  `;
  stream.appendChild(msgEl);
  stream.scrollTop = stream.scrollHeight;
}

function appendAssistantMessage(text) {
  const stream = document.getElementById('voice-chat-stream');
  if (!stream) return;
  const msgEl = document.createElement('div');
  msgEl.className = 'flex items-start gap-2.5';
  
  // Clean text for display
  msgEl.innerHTML = `
    <div class="w-6 h-6 rounded-md bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center shrink-0 mt-0.5">
      <i data-lucide="bot" class="w-3.5 h-3.5"></i>
    </div>
    <div class="p-3 rounded-2xl rounded-tl-sm bg-slate-900 border border-slate-800 text-slate-200 max-w-[85%] leading-relaxed text-[11.5px] space-y-2">
      <div>${text}</div>
      <div class="pt-1.5 border-t border-slate-800 flex items-center gap-2">
        <button onclick="speakText(decodeURIComponent('${encodeURIComponent(text)}'))" class="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
          <i data-lucide="volume-2" class="w-3 h-3"></i> Listen Again
        </button>
      </div>
    </div>
  `;
  stream.appendChild(msgEl);
  stream.scrollTop = stream.scrollHeight;
  try { if (window.lucide) lucide.createIcons(); } catch(e){}
}

function speakText(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();

  // Strip currency symbols for cleaner speech
  const spokenText = text.replace(/₹/g, 'Rupees ').replace(/%/g, ' percent');
  const utterance = new SpeechSynthesisUtterance(spokenText);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  utterance.lang = 'en-IN';

  // Optional: pick an English voice if available
  const voices = window.speechSynthesis.getVoices();
  const preferredVoice = voices.find(v => v.lang.includes('en-IN') || v.lang.includes('en-GB') || v.name.includes('Google') || v.name.includes('Natural'));
  if (preferredVoice) utterance.voice = preferredVoice;

  window.speechSynthesis.speak(utterance);
}

// ------------------------------------------------------------------
// STRICT FINANCIAL DATA QUERY RESOLVER
// ------------------------------------------------------------------
function processFinancialQuery(rawQuery) {
  const data = financialData || (typeof EMBEDDED_JGAOWA_DATA !== 'undefined' ? EMBEDDED_JGAOWA_DATA : {});
  const q = (rawQuery || '').toLowerCase().trim();
  
  const lift = data.lift_project || {};
  const blocks = lift.blocks || [];
  const defs = lift.defaulters || [];
  const painting = data.painting_project || {};
  const records = data.monthly_records || [];

  // 1. Check for specific flat search (e.g. A6-137, B2-116, A1-101) FIRST
  const flatMatch = q.match(/\b([ab][1-7]-?\d{1,4})\b/i);
  if (flatMatch) {
    const flatQuery = flatMatch[1].toUpperCase().replace(/\s+/g, '');
    const cleanQuery = flatQuery.includes('-') ? flatQuery : (flatQuery.slice(0, 2) + '-' + flatQuery.slice(2));
    
    const matchingDef = defs.find(d => {
      const dFlat = (d.flat || '').toUpperCase().replace(/\s+/g, '');
      return dFlat === flatQuery || dFlat === cleanQuery;
    });

    if (matchingDef) {
      const mo = matchingDef.months_pending || 1;
      const amt = matchingDef.amount_due || (mo * 3750);
      const status = matchingDef.status || 'Pending';
      const desc = matchingDef.description || '';
      return `Flat ${matchingDef.flat} (Tower ${matchingDef.block}) has ${mo} months of pending lift EMIs amounting to ₹${amt.toLocaleString('en-IN')}. Notice Status: ${status}. Detail: ${desc}.`;
    } else {
      return `Flat ${cleanQuery} has no pending lift dues recorded in the defaulters roster. All EMIs are fully up to date.`;
    }
  }

  // 2. Tower-specific query (Tower A1 to Tower B6)
  const towerMatch = q.match(/\b(?:tower|block)?\s*([ab][1-7])\b/i);
  if (towerMatch && (q.includes('tower') || q.includes('block') || q.includes('status') || q.includes('collection') || q.includes('pending') || q.includes('emi') || q.includes('paid'))) {
    const tName = towerMatch[1].toUpperCase();
    const blk = blocks.find(b => (b.block || '').toUpperCase() === tName);
    if (blk) {
      const pctPaid = blk.pct_paid || 0;
      const pctUnpaid = blk.pct_unpaid || (100 - pctPaid);
      const paidEMIs = blk.paid_emis || 0;
      const pendEMIs = blk.pending_emis || 0;
      const totEMIs = blk.total_emis || (blk.flats_count * 4);
      const coll = blk.collected || 0;
      const target = blk.target || (blk.flats_count * 15000);
      const pctAmt = blk.pct_amount || Math.round((coll / target) * 1000) / 10;
      return `Tower ${tName} has achieved ${pctPaid}% EMI installment collection (${paidEMIs} of ${totEMIs} EMIs paid). Pending EMIs: ${pendEMIs} (${pctUnpaid.toFixed(1)}%). Total collected is ₹${coll.toLocaleString('en-IN')} against total demand of ₹${target.toLocaleString('en-IN')} (${pctAmt}% collected).`;
    }
  }

  // 3. Lift Modernization Project Totals
  if (q.includes('lift') && (q.includes('total') || q.includes('collection') || q.includes('summary') || q.includes('progress') || q.includes('percentage') || q.includes('demand') || q.includes('overall') || q.includes('project') || q.split(' ').length <= 4)) {
    const totColl = lift.total_collected || 4804694;
    const totTarget = lift.total_target || 5884720;
    const unspent = lift.unspent_balance || 2027170;
    const pctColl = ((totColl / totTarget) * 100).toFixed(1);
    const totEMIs = blocks.reduce((acc, b) => acc + (b.total_emis || 0), 0) || 1424;
    const paidEMIs = blocks.reduce((acc, b) => acc + (b.paid_emis || 0), 0) || 1275;
    const pctEMIs = ((paidEMIs / totEMIs) * 100).toFixed(1);
    return `For the Lift Modernization Project across 13 towers (356 flats), total demand is ₹58.85 Lakhs. Total collected is ₹${(totColl/100000).toFixed(2)} Lakhs (${pctColl}% of demand). Across the society, ${paidEMIs} of ${totEMIs} total EMIs (${pctEMIs}%) are paid, leaving an unspent lift fund balance of ₹${(unspent/100000).toFixed(2)} Lakhs.`;
  }

  // 4. Defaulters & Overdue queries
  if (q.includes('defaulter') || q.includes('pending') || q.includes('unpaid') || q.includes('due') || q.includes('overdue')) {
    const c4 = defs.filter(d => (d.months_pending || 0) >= 4).length;
    const c3 = defs.filter(d => (d.months_pending || 0) === 3).length;
    const c2 = defs.filter(d => (d.months_pending || 0) === 2).length;
    const c1 = defs.filter(d => (d.months_pending || 0) <= 1).length;
    const totDef = defs.length || 65;

    if (q.includes('4') || q.includes('four') || q.includes('final')) {
      return `There are ${c4} flats with 4 months of overdue lift EMIs on Final Notice, owing ₹15,000 each.`;
    } else if (q.includes('3') || q.includes('three')) {
      return `There are ${c3} flats with 3 months of overdue lift EMIs on Urgent Notice, owing ₹11,250 each.`;
    } else if (q.includes('2') || q.includes('two')) {
      return `There are ${c2} flats with 2 months of pending lift EMIs (Reminder Notice), owing ₹7,500 each.`;
    } else if (q.includes('1') || q.includes('one')) {
      return `There are ${c1} flats with 1 month of pending lift EMI, owing ₹3,750 each.`;
    } else {
      return `There are a total of ${totDef} flats in the pending dues roster: ${c4} flats on 4-Month Final Notice, ${c3} flats on 3-Month Urgent Notice, ${c2} flats on 2-Month Reminder, and ${c1} flats on 1-Month Pending status.`;
    }
  }

  // 5. Bank Liquidity & Cash Balances
  if (q.includes('bank') || q.includes('cash') || q.includes('liquidity') || q.includes('balance') || q.includes('icici') || q.includes('idfc') || q.includes('fund')) {
    const latestRec = records.length > 0 ? records[records.length - 1] : {};
    const bb = latestRec.bank_balances || {};
    const iciciCur = bb.icici_current || 561201.81;
    const iciciSb = bb.icici_sb || 111888.55;
    const idfc = bb.idfc_first || 499098.90;
    const cash = bb.cash_in_hand || 48823.00;
    const totLiq = iciciCur + iciciSb + idfc + cash;

    return `As of the latest statement (${latestRec.month || 'Feb 2026'}), total liquid funds stand at ₹${(totLiq/100000).toFixed(2)} Lakhs. Account breakdown: ICICI Current Account: ₹${(iciciCur/100000).toFixed(2)}L, IDFC First Bank: ₹${(idfc/100000).toFixed(2)}L, ICICI Savings: ₹${(iciciSb/100000).toFixed(2)}L, and Cash in Hand: ₹${(cash/1000).toFixed(1)}K.`;
  }

  // 6. Painting Project
  if (q.includes('painting') || q.includes('paint')) {
    const bgt = painting.budget || 1850000;
    const spent = painting.spent || 1480000;
    const ret = painting.retention_balance || 370000;
    const pct = painting.completion_pct || 80;
    return `The 10-Block Painting Project has a total budget of ₹${(bgt/100000).toFixed(2)} Lakhs. Amount spent so far is ₹${(spent/100000).toFixed(2)} Lakhs (${pct}% complete), with a contractor retention balance of ₹${(ret/100000).toFixed(2)} Lakhs held.`;
  }

  // 7. 23-Month Receipts & Payments Statement
  if (q.includes('receipt') || q.includes('payment') || q.includes('expense') || q.includes('statement') || q.includes('income') || q.includes('month') || q.includes('23')) {
    const totRec = records.reduce((acc, r) => acc + (r.receipts_total || 0), 0);
    const totPay = records.reduce((acc, r) => acc + (r.payments_total || 0), 0);
    const latestRec = records.length > 0 ? records[records.length - 1] : {};
    return `Over the 23-month multi-year statement (April 2024 to February 2026), total society collections were ₹${(totRec/100000).toFixed(2)} Lakhs and total expenses were ₹${(totPay/100000).toFixed(2)} Lakhs. In ${latestRec.month || 'Feb 2026'}, receipts were ₹${(latestRec.receipts_total || 0).toLocaleString('en-IN')} and payments were ₹${(latestRec.payments_total || 0).toLocaleString('en-IN')}.`;
  }

  // 8. General Overview / Snapshot
  if (q.includes('overview') || q.includes('summary') || q.includes('financial') || q.includes('status') || q.includes('how are we doing')) {
    return `Janapriya Greenwood Financial Snapshot: Total liquid bank balance is ₹12.21 Lakhs across ICICI and IDFC. Lift modernization collection has achieved 81.6% (₹48.05 Lakhs collected) with 89.5% of total EMIs paid. There are 65 flats in the pending dues roster, and painting project completion is at 80%.`;
  }

  // Guardrail for external / out-of-scope questions
  return `I am the JGAOWA Financial Board Voice Assistant. I can only answer questions regarding Janapriya Greenwood's apartment accounts, lift installment collections, bank balances, painting project, and defaulters.`;
}
