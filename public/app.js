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
  if (!financialData) return;
  const s = financialData.summary || {};
  const lift = financialData.lift_project || {};
  const records = financialData.monthly_records || [];

  const activeRecs = records.filter(r => (r.receipts_total > 0 || r.payments_total > 0 || r.opening_balance > 0));
  const latestRec = activeRecs.length > 0 ? activeRecs[activeRecs.length - 1] : (records[records.length - 1] || {});

  const totLiquid = (s.current_liquid_funds !== undefined) ? s.current_liquid_funds : (s.closing_cash_bank || latestRec.closing_balance || 1191465);
  const totReceipts = s.total_receipts_23m || s.total_receipts_fy || activeRecs.reduce((a,r)=>a+(r.receipts_total||0), 0);
  const totPayments = s.total_payments_23m || s.total_payments_fy || activeRecs.reduce((a,r)=>a+(r.payments_total||0), 0);
  const numMonths = s.total_months || activeRecs.length || 26;
  const avgR = s.avg_monthly_receipts || (totReceipts / numMonths);
  const avgP = s.avg_monthly_payments || (totPayments / numMonths);

  setElText('kpi-liquid-funds', formatINR(totLiquid));
  setElText('kpi-total-receipts', formatINR(totReceipts));
  setElText('kpi-total-payments', formatINR(totPayments));
  setElText('kpi-avg-receipts', `Monthly Avg: ${formatINR(avgR)} Inflows`);
  setElText('kpi-avg-payments', `Monthly Avg: ${formatINR(avgP)} Outflows`);

  setElText('kpi-lift-emi-pct', `${lift.overall_emi_pct || 91.6}%`);
  setElText('kpi-lift-pending-emis', `${lift.total_pending_emis || 149} EMIs (${lift.overall_pending_pct || 8.4}%)`);
  const totColLift = lift.total_collected || 5456109;
  const pctAmtLift = lift.overall_amount_pct || 74.2;
  setElText('kpi-lift-pool', `${formatLakhs(totColLift)} Pool (${pctAmtLift}%)`);
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
  if (!financialData) return;
  const records = financialData.monthly_records || [];
  const dropdown = document.getElementById('month-dropdown');
  
  // Find latest active month index
  let defaultIdx = records.length - 1;
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].receipts_total > 0 || records[i].payments_total > 0) {
      defaultIdx = i;
      break;
    }
  }

  if (dropdown && (!dropdown.options || dropdown.options.length === 0)) {
    dropdown.innerHTML = records.map((r, i) => `<option value="${i}">${r.month}</option>`).join('');
    dropdown.selectedIndex = defaultIdx;
  }
  const idx = dropdown ? (parseInt(dropdown.value, 10) >= 0 ? parseInt(dropdown.value, 10) : defaultIdx) : defaultIdx;
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

  // Dynamic Lift Top KPI Badges
  const totDemand = lift.total_target_amount || lift.total_target || 7355900;
  const totCollected = lift.total_collected || 5456109;
  const unspentBal = lift.unspent_balance || (totCollected - (lift.vendor_expenses || 2697000));

  setElText('lift-kpi-demand', formatLakhs(totDemand));
  setElText('lift-kpi-collected', formatLakhs(totCollected));
  setElText('lift-kpi-unspent', formatLakhs(unspentBal));

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

  // Count pills across all defaulters (5Mo down to 1Mo)
  const c5 = allDefs.filter(d => (d.months_pending || 0) >= 5).length;
  const c4 = allDefs.filter(d => (d.months_pending || 0) === 4).length;
  const c3 = allDefs.filter(d => (d.months_pending || 0) === 3).length;
  const c2 = allDefs.filter(d => (d.months_pending || 0) === 2).length;
  const c1 = allDefs.filter(d => (d.months_pending || 0) <= 1).length;

  setElText('pill-count-5mo', `${c5} Flats`);
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

        if (mo >= 5) {
          cardBg = 'bg-red-950/40 border-red-500/60 hover:border-red-500';
          badgeBg = 'bg-red-500/20 text-red-300 border-red-500/50';
          moColor = 'text-red-400 font-bold';
          dotColor = 'bg-red-500';
        } else if (mo === 4) {
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
    const result = processFinancialQuery(userText);
    const htmlText = (typeof result === 'object' && result.html) ? result.html : result;
    const speechText = (typeof result === 'object' && result.speech) ? result.speech : htmlText;

    appendAssistantMessage(htmlText, speechText);
    if (statusText) statusText.textContent = "Ready • Click mic to speak";
    if (isVoiceAudioEnabled) {
      speakText(speechText);
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

function appendAssistantMessage(htmlContent, speechContent) {
  const stream = document.getElementById('voice-chat-stream');
  if (!stream) return;
  const msgEl = document.createElement('div');
  msgEl.className = 'flex items-start gap-2.5';
  
  const speechToPlay = speechContent || htmlContent.replace(/<[^>]*>?/gm, ' ');
  const safeSpeechAttr = encodeURIComponent(speechToPlay);

  msgEl.innerHTML = `
    <div class="w-6 h-6 rounded-md bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center shrink-0 mt-0.5">
      <i data-lucide="bot" class="w-3.5 h-3.5"></i>
    </div>
    <div class="p-3 rounded-2xl rounded-tl-sm bg-slate-900 border border-slate-800 text-slate-200 max-w-[90%] leading-relaxed text-[11.5px] space-y-2">
      <div class="space-y-2 overflow-x-auto">${htmlContent}</div>
      <div class="pt-1.5 border-t border-slate-800 flex items-center gap-2">
        <button onclick="speakText(decodeURIComponent('${safeSpeechAttr}'))" class="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
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

  // Strip HTML tags and format currency / percentages for natural speech
  let clean = text.replace(/<[^>]*>?/gm, ' ')
                  .replace(/₹\s*([\d,.]+)\s*L(?:akhs?)?/gi, '$1 Lakh Rupees')
                  .replace(/₹\s*([\d,.]+)\s*Cr(?:ores?)?/gi, '$1 Crore Rupees')
                  .replace(/₹/g, 'Rupees ')
                  .replace(/%/g, ' percent')
                  .replace(/\s+/g, ' ')
                  .trim();
                  
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  utterance.lang = 'en-IN';

  const voices = window.speechSynthesis.getVoices();
  const preferredVoice = voices.find(v => v.lang.includes('en-IN') || v.lang.includes('en-GB') || v.name.includes('Google') || v.name.includes('Natural'));
  if (preferredVoice) utterance.voice = preferredVoice;

  window.speechSynthesis.speak(utterance);
}

// ------------------------------------------------------------------
// COMPREHENSIVE FINANCIAL DATA AI & VOICE RESOLVER
// ------------------------------------------------------------------
function processFinancialQuery(rawQuery) {
  const data = financialData || (typeof EMBEDDED_JGAOWA_DATA !== 'undefined' ? EMBEDDED_JGAOWA_DATA : {});
  const q = (rawQuery || '').toLowerCase().trim();
  
  const s = data.summary || {};
  const lift = data.lift_project || {};
  const blocks = lift.blocks || [];
  const defs = lift.defaulters || [];
  const painting = data.painting_project || {};
  const records = data.monthly_records || [];

  const fmtRs = val => '₹' + Math.round(val || 0).toLocaleString('en-IN');
  const fmtLakh = val => '₹' + ((val || 0) / 100000).toFixed(2) + ' Lakhs';

  const renderFlatChips = (flatList, maxShow = 66) => {
    if (!flatList || flatList.length === 0) return '<div class="text-xs text-slate-400">None</div>';
    const chips = flatList.slice(0, maxShow).map(d => {
      const moText = d.months_pending ? `${d.months_pending}Mo` : '';
      const amtText = d.amount_due ? `₹${(d.amount_due).toLocaleString('en-IN')}` : '';
      return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] font-mono text-cyan-200 shadow-sm">
        <strong class="text-white">${d.flat}</strong>
        ${moText ? `<span class="text-[9.5px] px-1 py-0.2 rounded bg-rose-500/20 text-rose-300 font-sans font-medium">${moText}</span>` : ''}
        ${amtText ? `<span class="text-slate-400 text-[10px]">${amtText}</span>` : ''}
      </span>`;
    }).join(' ');
    
    const moreText = flatList.length > maxShow ? `<div class="text-[10px] text-slate-400 mt-1 italic">+ ${flatList.length - maxShow} more flats...</div>` : '';
    return `<div class="flex flex-wrap gap-1 mt-1.5 max-h-48 overflow-y-auto pr-1 custom-scroll">${chips}</div>${moreText}`;
  };

  // 1. SPECIFIC FLAT LOOKUP (e.g. A6-137, B2-116, A1-303, B5-334)
  const flatMatch = q.match(/\b([ab][1-7])[- ]?(\d{1,4})\b/i);
  if (flatMatch) {
    const flatPrefix = flatMatch[1].toUpperCase();
    const flatNum = flatMatch[2];
    const flatQueryClean = `${flatPrefix}-${flatNum}`;
    const flatQueryCompact = `${flatPrefix}${flatNum}`;
    
    const matchingDef = defs.find(d => {
      const dNorm = (d.flat || '').toUpperCase().replace(/[\s-]/g, '');
      return dNorm === flatQueryCompact;
    });

    if (matchingDef) {
      const mo = matchingDef.months_pending || 1;
      const amt = matchingDef.amount_due || (mo * (['A1','A2','A3','B1','B2'].includes(matchingDef.block) ? 3850 : 4385));
      const status = matchingDef.status || 'Pending';
      const desc = matchingDef.description || 'Pending EMI';
      const blk = matchingDef.block || flatPrefix;
      const rate = ['A1','A2','A3','B1','B2'].includes(blk) ? 3850 : 4385;

      return {
        html: `
          <div class="p-2.5 rounded-xl bg-rose-950/30 border border-rose-500/40 space-y-1.5">
            <div class="flex items-center justify-between">
              <span class="font-bold text-sm text-white flex items-center gap-1.5 font-mono">
                <i data-lucide="alert-triangle" class="w-4 h-4 text-rose-400 inline"></i> Flat ${matchingDef.flat}
              </span>
              <span class="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-semibold">${status}</span>
            </div>
            <div class="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-rose-900/50">
              <div><span class="text-slate-400">Tower / Block:</span> <strong class="text-white">${blk}</strong></div>
              <div><span class="text-slate-400">Monthly EMI:</span> <strong class="text-white">${fmtRs(rate)}</strong></div>
              <div><span class="text-slate-400">Months Overdue:</span> <strong class="text-rose-400">${mo} Months</strong></div>
              <div><span class="text-slate-400">Total Due:</span> <strong class="text-rose-300 font-mono text-xs">${fmtRs(amt)}</strong></div>
            </div>
            <div class="text-[10px] text-slate-300 bg-slate-900/80 p-1.5 rounded border border-slate-800">
              <span class="text-slate-400 font-medium">Excel Roster Remark:</span> ${desc}
            </div>
          </div>
        `,
        speech: `Flat ${matchingDef.flat} in Tower ${blk} has ${mo} months of pending lift EMIs with total unpaid dues of ${fmtRs(amt)}. Notice status is ${status}.`
      };
    } else {
      const rate = ['A1','A2','A3','B1','B2'].includes(flatPrefix) ? 3850 : 4385;
      return {
        html: `
          <div class="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/40 space-y-1">
            <div class="flex items-center justify-between">
              <span class="font-bold text-sm text-white flex items-center gap-1.5 font-mono">
                <i data-lucide="check-circle" class="w-4 h-4 text-emerald-400 inline"></i> Flat ${flatQueryClean}
              </span>
              <span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold">Fully Paid (0 Dues)</span>
            </div>
            <p class="text-slate-300 text-[11px] pt-1">
              Flat <strong>${flatQueryClean}</strong> (Tower ${flatPrefix}) has no pending lift dues recorded in the defaulters roster. All 5 monthly EMIs (${fmtRs(rate)}/month) are fully up to date.
            </p>
          </div>
        `,
        speech: `Flat ${flatQueryClean} in Tower ${flatPrefix} has no pending lift dues. All 5 installments are fully paid up to date.`
      };
    }
  }

  // 2. FLATS THAT HAVE NOT PAID ANY EMI (0 EMIS PAID / ALL 5 MONTHS PENDING)
  const isZeroEmiQuery = (
    q.includes('not paid any') || q.includes('never paid') || q.includes('zero emi') ||
    q.includes('0 emi') || q.includes('no emi') || q.includes('not paid emi') ||
    q.includes('all 5 month') || q.includes('5 month') || q.includes('5 mo') ||
    q.includes('final notice') || (q.includes('not paid') && (q.includes('any') || q.includes('flat') || q.includes('list')))
  );

  if (isZeroEmiQuery) {
    const fiveMoDefs = defs.filter(d => (d.months_pending || 0) >= 5);
    const sumFiveMo = fiveMoDefs.reduce((acc, d) => acc + (d.amount_due || 0), 0);
    const countFiveMo = fiveMoDefs.length;
    const flatNames = fiveMoDefs.map(d => d.flat).join(', ');

    return {
      html: `
        <div class="space-y-2">
          <div class="p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/50">
            <div class="flex items-center justify-between">
              <h5 class="font-bold text-white text-xs flex items-center gap-1.5">
                <i data-lucide="alert-octagon" class="w-4 h-4 text-rose-400"></i>
                Flats with 0 EMIs Paid (All 5 Months Pending)
              </h5>
              <span class="px-2 py-0.5 rounded bg-rose-500/30 text-rose-200 text-[10px] font-bold font-mono">${countFiveMo} Flats</span>
            </div>
            <div class="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-rose-900/60 text-[11px]">
              <div><span class="text-slate-400">Total Unpaid Dues Sum:</span> <strong class="text-rose-300 font-mono text-xs block">${fmtRs(sumFiveMo)} (${fmtLakh(sumFiveMo)})</strong></div>
              <div><span class="text-slate-400">Total Pending EMIs:</span> <strong class="text-white block font-mono">${countFiveMo * 5} EMIs</strong></div>
            </div>
          </div>
          <div>
            <div class="text-[10.5px] font-semibold text-slate-300 flex items-center justify-between">
              <span>List of Flat Numbers & Amounts Due (${countFiveMo} Flats):</span>
            </div>
            ${renderFlatChips(fiveMoDefs)}
          </div>
        </div>
      `,
      speech: `There are ${countFiveMo} flats that have not paid any EMI across all 5 months, with total unpaid dues of ${fmtLakh(sumFiveMo)}. The flats are: ${flatNames}.`
    };
  }

  // 3. SPECIFIC MONTH OVERDUE TIERS (4 Mo, 3 Mo, 2 Mo, 1 Mo)
  const monthTierMatch = q.match(/\b([1-4])\s*(?:month|mo|installment)s?\b/i);
  if (monthTierMatch && (q.includes('defaulter') || q.includes('pending') || q.includes('list') || q.includes('flat') || q.includes('who') || q.includes('how many') || q.includes('due'))) {
    const targetMo = parseInt(monthTierMatch[1]);
    const tierDefs = defs.filter(d => (d.months_pending || 0) === targetMo);
    const sumTier = tierDefs.reduce((acc, d) => acc + (d.amount_due || 0), 0);
    const countTier = tierDefs.length;
    const flatNames = tierDefs.map(d => d.flat).join(', ');

    return {
      html: `
        <div class="space-y-2">
          <div class="p-2.5 rounded-xl bg-amber-950/30 border border-amber-500/40">
            <div class="flex items-center justify-between">
              <h5 class="font-bold text-white text-xs flex items-center gap-1.5">
                <i data-lucide="clock" class="w-4 h-4 text-amber-400"></i>
                ${targetMo}-Month Overdue Defaulters List
              </h5>
              <span class="px-2 py-0.5 rounded bg-amber-500/30 text-amber-200 text-[10px] font-bold font-mono">${countTier} Flats</span>
            </div>
            <div class="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-amber-900/60 text-[11px]">
              <div><span class="text-slate-400">Total Unpaid Sum:</span> <strong class="text-amber-300 font-mono text-xs block">${fmtRs(sumTier)} (${fmtLakh(sumTier)})</strong></div>
              <div><span class="text-slate-400">Pending EMIs:</span> <strong class="text-white block font-mono">${countTier * targetMo} EMIs</strong></div>
            </div>
          </div>
          <div>
            <div class="text-[10.5px] font-semibold text-slate-300">
              List of Flat Numbers (${countTier} Flats):
            </div>
            ${renderFlatChips(tierDefs)}
          </div>
        </div>
      `,
      speech: `There are ${countTier} flats with exactly ${targetMo} months of overdue lift EMIs, totaling ${fmtLakh(sumTier)} in unpaid dues. Flats: ${flatNames}.`
    };
  }

  // 4. TOTAL SUM OF ALL UNPAID DUES / DEFAULTERS SUMMARY
  const isSumOrDefaultersQuery = (
    (q.includes('sum') || q.includes('total') || q.includes('calculate') || q.includes('how much')) && 
    (q.includes('unpaid') || q.includes('pending') || q.includes('defaulter') || q.includes('due') || q.includes('arrear') || q.includes('emi'))
  ) || (q.includes('all defaulter') || q.includes('defaulter list') || q.includes('defaulter roster') || q.includes('how many defaulter'));

  if (isSumOrDefaultersQuery) {
    const totDefs = defs.length;
    const totDuesSum = defs.reduce((acc, d) => acc + (d.amount_due || 0), 0);
    const totPendingEmis = lift.total_pending_emis || defs.reduce((acc, d) => acc + (d.months_pending || 0), 0);

    const c5 = defs.filter(d => (d.months_pending || 0) >= 5);
    const c4 = defs.filter(d => (d.months_pending || 0) === 4);
    const c3 = defs.filter(d => (d.months_pending || 0) === 3);
    const c2 = defs.filter(d => (d.months_pending || 0) === 2);
    const c1 = defs.filter(d => (d.months_pending || 0) === 1);

    const s5 = c5.reduce((a, b) => a + (b.amount_due || 0), 0);
    const s4 = c4.reduce((a, b) => a + (b.amount_due || 0), 0);
    const s3 = c3.reduce((a, b) => a + (b.amount_due || 0), 0);
    const s2 = c2.reduce((a, b) => a + (b.amount_due || 0), 0);
    const s1 = c1.reduce((a, b) => a + (b.amount_due || 0), 0);

    return {
      html: `
        <div class="space-y-2">
          <div class="p-2.5 rounded-xl bg-slate-900 border border-rose-500/40">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-white flex items-center gap-1.5">
                <i data-lucide="calculator" class="w-4 h-4 text-rose-400"></i> Total Defaulters & Unpaid Dues Sum
              </span>
              <span class="text-xs font-mono font-bold text-rose-300">${fmtRs(totDuesSum)}</span>
            </div>
            <div class="text-[10px] text-slate-400 mt-0.5">
              ${totDefs} Unique Flats &bull; ${totPendingEmis} Pending EMIs &bull; ${fmtLakh(totDuesSum)} Total Unpaid
            </div>
            <div class="mt-2 pt-2 border-t border-slate-800 space-y-1 text-[10.5px]">
              <div class="flex justify-between items-center text-rose-300">
                <span>🔴 5 Months (Final Notice):</span>
                <strong class="font-mono">${c5.length} Flats &bull; ${fmtRs(s5)}</strong>
              </div>
              <div class="flex justify-between items-center text-rose-400">
                <span>🟠 4 Months (Final Notice):</span>
                <strong class="font-mono">${c4.length} Flat &bull; ${fmtRs(s4)}</strong>
              </div>
              <div class="flex justify-between items-center text-amber-300">
                <span>🟡 3 Months (Urgent Notice):</span>
                <strong class="font-mono">${c3.length} Flats &bull; ${fmtRs(s3)}</strong>
              </div>
              <div class="flex justify-between items-center text-yellow-300">
                <span>🔵 2 Months (Reminder):</span>
                <strong class="font-mono">${c2.length} Flats &bull; ${fmtRs(s2)}</strong>
              </div>
              <div class="flex justify-between items-center text-slate-300">
                <span>⚪ 1 Month (Pending):</span>
                <strong class="font-mono">${c1.length} Flats &bull; ${fmtRs(s1)}</strong>
              </div>
            </div>
          </div>
          <div class="text-[10px] text-slate-400">
            💡 <em>Tip: Ask "List 5 month defaulters" or "Status of Tower A2" to see specific flat lists!</em>
          </div>
        </div>
      `,
      speech: `The total sum of all unpaid lift dues across all ${totDefs} defaulter flats is ${fmtLakh(totDuesSum)} representing ${totPendingEmis} pending EMIs. This includes ${c5.length} flats on 5-month final notice owing ${fmtLakh(s5)}.`
    };
  }

  // 5. COMBINED / MULTI-TOWER QUERIES OR SINGLE TOWER QUERIES
  let matchedTowers = Array.from(new Set((q.match(/\b([ab][1-7])\b/gi) || []).map(t => t.toUpperCase())));
  if (q.includes('all a') || q.includes('a towers') || q.includes('a blocks') || q.includes('all a blocks')) {
    matchedTowers = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'];
  } else if (q.includes('all b') || q.includes('b towers') || q.includes('b blocks') || q.includes('all b blocks')) {
    matchedTowers = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'];
  }

  if (matchedTowers.length > 1) {
    const combBlocks = blocks.filter(b => matchedTowers.includes(b.block));
    const combFlats = combBlocks.reduce((a, b) => a + (b.flats_count || 0), 0);
    const combTarget = combBlocks.reduce((a, b) => a + (b.target || 0), 0);
    const combCollected = combBlocks.reduce((a, b) => a + (b.collected || 0), 0);
    const combPctAmount = combTarget > 0 ? ((combCollected / combTarget) * 100).toFixed(1) : 0;
    const combTotalEmis = combBlocks.reduce((a, b) => a + (b.total_emis || 0), 0);
    const combPaidEmis = combBlocks.reduce((a, b) => a + (b.paid_emis || 0), 0);
    const combPendingEmis = combBlocks.reduce((a, b) => a + (b.pending_emis || 0), 0);
    const combPctEmiPaid = combTotalEmis > 0 ? ((combPaidEmis / combTotalEmis) * 100).toFixed(1) : 0;

    const combDefs = defs.filter(d => matchedTowers.includes(d.block));
    const combDuesSum = combDefs.reduce((a, b) => a + (b.amount_due || 0), 0);

    return {
      html: `
        <div class="space-y-2">
          <div class="p-2.5 rounded-xl bg-slate-900 border border-cyan-500/40">
            <div class="flex items-center justify-between">
              <h5 class="font-bold text-white text-xs flex items-center gap-1.5">
                <i data-lucide="layers" class="w-4 h-4 text-cyan-400"></i>
                Combined Summary: Towers ${matchedTowers.join(', ')}
              </h5>
              <span class="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-mono font-bold">${combFlats} Flats</span>
            </div>
            <div class="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-800 text-[11px]">
              <div><span class="text-slate-400">Total Collected:</span> <strong class="text-emerald-400 font-mono block">${fmtRs(combCollected)} (${combPctAmount}%)</strong></div>
              <div><span class="text-slate-400">Total Demand (5M):</span> <strong class="text-white font-mono block">${fmtRs(combTarget)}</strong></div>
              <div><span class="text-slate-400">EMIs Paid:</span> <strong class="text-cyan-300 font-mono block">${combPaidEmis} / ${combTotalEmis} (${combPctEmiPaid}%)</strong></div>
              <div><span class="text-slate-400">Combined Pending Dues:</span> <strong class="text-rose-400 font-mono block">${fmtRs(combDuesSum)} (${combDefs.length} Flats)</strong></div>
            </div>
          </div>
          ${combDefs.length > 0 ? `
            <div>
              <div class="text-[10.5px] font-semibold text-slate-300">
                Pending Defaulter Flats in these Towers (${combDefs.length} Flats):
              </div>
              ${renderFlatChips(combDefs)}
            </div>
          ` : '<div class="text-[10.5px] text-emerald-400">No pending dues in these towers!</div>'}
        </div>
      `,
      speech: `Combined for Towers ${matchedTowers.join(' and ')}: ${combFlats} flats with total collected of ${fmtLakh(combCollected)} (${combPctAmount}% of demand). ${combPaidEmis} of ${combTotalEmis} EMIs are paid (${combPctEmiPaid}%). There are ${combDefs.length} pending flats with total unpaid dues of ${fmtRs(combDuesSum)}.`
    };
  }

  // 6. SINGLE TOWER STATUS (e.g. Tower A1, Tower B2, Block A6)
  if (matchedTowers.length === 1) {
    const tName = matchedTowers[0];
    const blk = blocks.find(b => b.block === tName);
    if (blk) {
      const pctPaid = blk.pct_paid || 0;
      const pctUnpaid = blk.pct_unpaid || (100 - pctPaid);
      const paidEMIs = blk.paid_emis || 0;
      const pendEMIs = blk.pending_emis || 0;
      const totEMIs = blk.total_emis || (blk.flats_count * 5);
      const coll = blk.collected || 0;
      const target = blk.target || (blk.flats_count * (['A1','A2','A3','B1','B2'].includes(tName) ? 19250 : 21925));
      const pctAmt = blk.pct_amount || Math.round((coll / target) * 1000) / 10;
      const rate = ['A1','A2','A3','B1','B2'].includes(tName) ? 3850 : 4385;

      const towerDefs = defs.filter(d => d.block === tName);
      const towerDuesSum = towerDefs.reduce((a, b) => a + (b.amount_due || 0), 0);

      return {
        html: `
          <div class="space-y-2">
            <div class="p-2.5 rounded-xl bg-slate-900 border border-cyan-500/40">
              <div class="flex items-center justify-between">
                <h5 class="font-bold text-white text-xs flex items-center gap-1.5">
                  <i data-lucide="building-2" class="w-4 h-4 text-cyan-400"></i>
                  Tower ${tName} Performance & Status
                </h5>
                <span class="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-mono font-bold">${blk.flats_count} Flats</span>
              </div>
              <div class="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-800 text-[11px]">
                <div><span class="text-slate-400">Monthly EMI Rate:</span> <strong class="text-white font-mono block">${fmtRs(rate)} / flat</strong></div>
                <div><span class="text-slate-400">Monthly Target:</span> <strong class="text-white font-mono block">${fmtRs(blk.monthly_target)}</strong></div>
                <div><span class="text-slate-400">Total Collected:</span> <strong class="text-emerald-400 font-mono block">${fmtRs(coll)} (${pctAmt}%)</strong></div>
                <div><span class="text-slate-400">Total 5M Demand:</span> <strong class="text-white font-mono block">${fmtRs(target)}</strong></div>
                <div><span class="text-slate-400">EMIs Paid:</span> <strong class="text-cyan-300 font-mono block">${paidEMIs} / ${totEMIs} (${pctPaid}%)</strong></div>
                <div><span class="text-slate-400">Unpaid Dues Sum:</span> <strong class="text-rose-400 font-mono block">${fmtRs(towerDuesSum)} (${pendEMIs} EMIs)</strong></div>
              </div>
            </div>
            ${towerDefs.length > 0 ? `
              <div>
                <div class="text-[10.5px] font-semibold text-slate-300">
                  Pending Flats in Tower ${tName} (${towerDefs.length} Flats):
                </div>
                ${renderFlatChips(towerDefs)}
              </div>
            ` : '<div class="text-[10.5px] text-emerald-400">All flats in this tower have paid all EMIs!</div>'}
          </div>
        `,
        speech: `Tower ${tName} has ${blk.flats_count} flats with monthly EMI of ${fmtRs(rate)}. Total collected is ${fmtLakh(coll)} (${pctAmt}% of demand). ${paidEMIs} of ${totEMIs} EMIs are paid (${pctPaid}%). There are ${towerDefs.length} pending flats with total dues of ${fmtRs(towerDuesSum)}.`
      };
    }
  }

  // 7. LIFT MODERNIZATION PROJECT TOTALS
  if (q.includes('lift') || q.includes('modernization') || q.includes('elevator')) {
    const totColl = lift.total_collected || 5799116;
    const totTarget = lift.total_target_amount || 7355900;
    const unspent = lift.unspent_balance || 2852116;
    const vendorExp = lift.vendor_expenses || 2947000;
    const pctColl = ((totColl / totTarget) * 100).toFixed(1);
    const totEMIs = lift.total_demand_emis || 1780;
    const paidEMIs = lift.total_paid_emis || 1611;
    const pendingEMIs = lift.total_pending_emis || 169;
    const pctEMIs = lift.overall_emi_pct || ((paidEMIs / totEMIs) * 100).toFixed(1);

    return {
      html: `
        <div class="p-2.5 rounded-xl bg-slate-900 border border-cyan-500/40 space-y-2">
          <div class="flex items-center justify-between">
            <h5 class="font-bold text-white text-xs flex items-center gap-1.5">
              <i data-lucide="arrow-up-circle" class="w-4 h-4 text-cyan-400"></i>
              Lift Modernization Project Status
            </h5>
            <span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold">${pctEMIs}% EMIs Paid</span>
          </div>
          <div class="grid grid-cols-2 gap-2 text-[11px] pt-2 border-t border-slate-800">
            <div><span class="text-slate-400">Total Demand (Col Q):</span> <strong class="text-white font-mono block">${fmtRs(totTarget)} (${fmtLakh(totTarget)})</strong></div>
            <div><span class="text-slate-400">Total Collected:</span> <strong class="text-emerald-400 font-mono block">${fmtRs(totColl)} (${fmtLakh(totColl)})</strong></div>
            <div><span class="text-slate-400">Vendor Expenses Paid:</span> <strong class="text-amber-400 font-mono block">${fmtRs(vendorExp)} (${fmtLakh(vendorExp)})</strong></div>
            <div><span class="text-slate-400">Unspent Lift Balance:</span> <strong class="text-cyan-300 font-mono block">${fmtRs(unspent)} (${fmtLakh(unspent)})</strong></div>
            <div><span class="text-slate-400">Paid EMIs:</span> <strong class="text-white font-mono block">${paidEMIs} / ${totEMIs} EMIs</strong></div>
            <div><span class="text-slate-400">Pending EMIs:</span> <strong class="text-rose-400 font-mono block">${pendingEMIs} EMIs (${defs.length} Flats)</strong></div>
          </div>
        </div>
      `,
      speech: `For the Lift Modernization Project across 13 towers (356 flats), total demand is ${fmtLakh(totTarget)}. Total collected is ${fmtLakh(totColl)} (${pctColl}% of demand). Vendor expenses paid are ${fmtLakh(vendorExp)}, leaving an unspent fund balance of ${fmtLakh(unspent)}. Across the society, ${paidEMIs} of ${totEMIs} total EMIs (${pctEMIs}%) are paid.`
    };
  }

  // 8. BANK LIQUIDITY & BALANCES
  if (q.includes('bank') || q.includes('cash') || q.includes('liquidity') || q.includes('balance') || q.includes('icici') || q.includes('idfc') || q.includes('reserve')) {
    const totLiq = s.current_liquid_funds || 3108041.47;
    const banks = [
      { name: 'ICICI Bank Ltd (Current A/c)', amt: 1045000.0, note: 'Primary Operational Account' },
      { name: 'IDFC First Bank (Savings)', amt: 161257.32, note: 'Maintenance & Capex Pool' },
      { name: 'ICICI Bank (SB A/c)', amt: 104354.55, note: 'Interest Reserve Account' },
      { name: 'Cash in Hand & Transits', amt: 1797429.60, note: 'Operational Cash & Float' }
    ];

    return {
      html: `
        <div class="p-2.5 rounded-xl bg-slate-900 border border-emerald-500/40 space-y-2">
          <div class="flex items-center justify-between">
            <h5 class="font-bold text-white text-xs flex items-center gap-1.5">
              <i data-lucide="landmark" class="w-4 h-4 text-emerald-400"></i>
              Total Liquid Reserve & Bank Breakdown
            </h5>
            <span class="text-xs font-mono font-bold text-emerald-300">${fmtRs(totLiq)}</span>
          </div>
          <div class="text-[10px] text-slate-400">
            Reconciled across 3 Bank Accounts + Cash Float (${fmtLakh(totLiq)})
          </div>
          <div class="pt-2 border-t border-slate-800 space-y-1 text-[10.5px]">
            ${banks.map(b => `
              <div class="flex justify-between items-center text-slate-300">
                <span>${b.name}:</span>
                <strong class="font-mono text-cyan-300">${fmtRs(b.amt)}</strong>
              </div>
            `).join('')}
          </div>
        </div>
      `,
      speech: `Total liquid reserves stand at ${fmtLakh(totLiq)} reconciled across ICICI Bank Current Account, IDFC First Bank, ICICI Savings, and Cash in Hand.`
    };
  }

  // 9. PAINTING PROJECT
  if (q.includes('painting') || q.includes('paint')) {
    const bgt = painting.budget || 1850000;
    const spent = painting.spent || 1480000;
    const ret = painting.retention_balance || 370000;
    const pct = painting.completion_pct || 80;
    const coll = painting.total_collected || 6507000;

    return {
      html: `
        <div class="p-2.5 rounded-xl bg-slate-900 border border-amber-500/40 space-y-2">
          <div class="flex items-center justify-between">
            <h5 class="font-bold text-white text-xs flex items-center gap-1.5">
              <i data-lucide="paint-brush" class="w-4 h-4 text-amber-400"></i>
              10-Block Painting Capex Project
            </h5>
            <span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-mono font-bold">${pct}% Completed</span>
          </div>
          <div class="grid grid-cols-2 gap-2 text-[11px] pt-2 border-t border-slate-800">
            <div><span class="text-slate-400">Total Capex Budget:</span> <strong class="text-white font-mono block">${fmtRs(bgt)} (${fmtLakh(bgt)})</strong></div>
            <div><span class="text-slate-400">Amount Spent:</span> <strong class="text-emerald-400 font-mono block">${fmtRs(spent)} (${fmtLakh(spent)})</strong></div>
            <div><span class="text-slate-400">Contractor Retention:</span> <strong class="text-cyan-300 font-mono block">${fmtRs(ret)} (${fmtLakh(ret)})</strong></div>
            <div><span class="text-slate-400">Painting Reserve Pool:</span> <strong class="text-amber-300 font-mono block">${fmtRs(coll)} (${fmtLakh(coll)})</strong></div>
          </div>
        </div>
      `,
      speech: `The 10-Block Painting Project has a total budget of ${fmtLakh(bgt)}. Amount spent so far is ${fmtLakh(spent)} (${pct}% complete), with contractor retention balance of ${fmtLakh(ret)} held.`
    };
  }

  // 10. MONTHLY RECEIPTS & PAYMENTS / SPECIFIC MONTH QUERY
  const monthNames = ['april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'january', 'february', 'march'];
  const matchedMonth = monthNames.find(m => q.includes(m));
  if (matchedMonth && records.length > 0) {
    const rec = records.find(r => (r.month || '').toLowerCase().includes(matchedMonth));
    if (rec) {
      const net = (rec.receipts_total || 0) - (rec.payments_total || 0);
      return {
        html: `
          <div class="p-2.5 rounded-xl bg-slate-900 border border-cyan-500/40 space-y-2">
            <div class="flex items-center justify-between">
              <h5 class="font-bold text-white text-xs flex items-center gap-1.5">
                <i data-lucide="calendar" class="w-4 h-4 text-cyan-400"></i> Financial Statement for ${rec.month}
              </h5>
              <span class="px-2 py-0.5 rounded ${net >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'} text-[10px] font-mono font-bold">
                Net: ${net >= 0 ? '+' : ''}${fmtRs(net)}
              </span>
            </div>
            <div class="grid grid-cols-2 gap-2 text-[11px] pt-2 border-t border-slate-800">
              <div><span class="text-slate-400">Opening Balance:</span> <strong class="text-white font-mono block">${fmtRs(rec.opening_balance)}</strong></div>
              <div><span class="text-slate-400">Closing Balance:</span> <strong class="text-cyan-300 font-mono block">${fmtRs(rec.closing_balance)}</strong></div>
              <div><span class="text-slate-400">Total Receipts:</span> <strong class="text-emerald-400 font-mono block">${fmtRs(rec.receipts_total)}</strong></div>
              <div><span class="text-slate-400">Total Payments:</span> <strong class="text-rose-400 font-mono block">${fmtRs(rec.payments_total)}</strong></div>
            </div>
          </div>
        `,
        speech: `In ${rec.month}, society receipts were ${fmtRs(rec.receipts_total)} and payments were ${fmtRs(rec.payments_total)}, giving a closing balance of ${fmtRs(rec.closing_balance)}.`
      };
    }
  }

  // 11. GENERAL FINANCIAL SNAPSHOT / 27-MONTH OVERVIEW
  if (q.includes('overview') || q.includes('summary') || q.includes('receipt') || q.includes('payment') || q.includes('expense') || q.includes('income') || q.includes('how are we doing')) {
    const totRec = s.total_receipts_23m || 65789523.82;
    const totPay = s.total_payments_23m || 65377031.00;
    const totLiq = s.current_liquid_funds || 3108041.47;
    const liftColl = lift.total_collected || 5799116;

    return {
      html: `
        <div class="p-2.5 rounded-xl bg-slate-900 border border-cyan-500/40 space-y-2">
          <div class="flex items-center justify-between">
            <h5 class="font-bold text-white text-xs flex items-center gap-1.5">
              <i data-lucide="sparkles" class="w-4 h-4 text-cyan-400"></i> JGAOWA Comprehensive Financial Snapshot
            </h5>
            <span class="text-[10px] text-slate-400">${s.total_months || 27} Active Months</span>
          </div>
          <div class="grid grid-cols-2 gap-2 text-[11px] pt-2 border-t border-slate-800">
            <div><span class="text-slate-400">Liquid Reserves:</span> <strong class="text-cyan-300 font-mono block">${fmtLakh(totLiq)}</strong></div>
            <div><span class="text-slate-400">Lift Collected:</span> <strong class="text-emerald-400 font-mono block">${fmtLakh(liftColl)} (${lift.overall_emi_pct || 90.5}%)</strong></div>
            <div><span class="text-slate-400">Total Receipts:</span> <strong class="text-white font-mono block">${fmtLakh(totRec)}</strong></div>
            <div><span class="text-slate-400">Total Payments:</span> <strong class="text-white font-mono block">${fmtLakh(totPay)}</strong></div>
          </div>
        </div>
      `,
      speech: `Janapriya Greenwood Financial Snapshot: Total liquid reserve is ${fmtLakh(totLiq)}. Lift modernization collection has achieved ${lift.overall_emi_pct || 90.5}% EMI compliance (${fmtLakh(liftColl)} collected). Multi-year receipts stand at ${fmtLakh(totRec)} and expenses at ${fmtLakh(totPay)}.`
    };
  }

  // Guardrail fallback with interactive suggestion buttons
  return {
    html: `
      <div class="p-2 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-300 space-y-1.5">
        <p>I can answer questions about:</p>
        <div class="flex flex-wrap gap-1 mt-1 text-[10px]">
          <button onclick="handleQuickVoiceQuery('How many flats are not paid any emi?')" class="px-2 py-0.5 rounded bg-slate-800 hover:bg-cyan-900 text-cyan-300 border border-slate-700">Flats not paid any EMI</button>
          <button onclick="handleQuickVoiceQuery('Sum of all unpaid dues')" class="px-2 py-0.5 rounded bg-slate-800 hover:bg-cyan-900 text-cyan-300 border border-slate-700">Sum of all unpaid dues</button>
          <button onclick="handleQuickVoiceQuery('Tower A1 and A2 combined')" class="px-2 py-0.5 rounded bg-slate-800 hover:bg-cyan-900 text-cyan-300 border border-slate-700">Tower A1 & A2 Combined</button>
          <button onclick="handleQuickVoiceQuery('Status of flat A1-303')" class="px-2 py-0.5 rounded bg-slate-800 hover:bg-cyan-900 text-cyan-300 border border-slate-700">Status of Flat A1-303</button>
          <button onclick="handleQuickVoiceQuery('Total bank liquidity')" class="px-2 py-0.5 rounded bg-slate-800 hover:bg-cyan-900 text-cyan-300 border border-slate-700">Bank Liquidity</button>
        </div>
      </div>
    `,
    speech: `I am the JGAOWA Financial Board Voice Assistant. Ask me about flats that have not paid any EMI, total sum of unpaid dues, tower combinations, bank balances, or flat numbers.`
  };
}
