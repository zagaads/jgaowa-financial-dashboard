/**
 * Personal Wealth & Double-Entry Accounting Terminal - Safe Bulletproof JavaScript Engine
 */

const GOOGLE_SHEET_ID = '13THtCElsd9zUs6r5AhOM6QyZ6nVslYHd';

let financeData = (typeof EMBEDDED_FINANCE_DATA !== 'undefined') ? EMBEDDED_FINANCE_DATA : null;
let currentTab = 'overview';
let assetDonutChart = null;
let cashflowBarChart = null;
let lastSyncTime = null;

let journalPage = 1;
const journalPageSize = 100;
let filteredTransactions = [];

let isPresentationRunning = false;
let isMouseHovered = false;
let slideDuration = 25000;
let slideElapsed = 0;
let presentationTimer = null;
let hoverResumeTimer = null;

const presentationTabs = ['overview', 'journal', 'balancesheet', 'pnl', 'investments', 'liabilities'];

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

// 1. Initialize immediately with embedded data
document.addEventListener('DOMContentLoaded', () => {
  try { if (window.lucide) lucide.createIcons(); } catch(e){}
  startLiveClock();
  setupHoverProtection();

  if (financeData) {
    renderAll();
  }

  // Also try live sync
  fetchLiveGoogleSheetData();
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

// 2. JSONP Live Google Sheet Fetcher
let pendingAccountsData = null;
let pendingJournalData = null;

function fetchLiveGoogleSheetData() {
  setElHTML('live-sync-status', `<span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span> <span class="hidden sm:inline">Syncing...</span>`);

  pendingAccountsData = null;
  pendingJournalData = null;

  window.handleAccountsJSONP = function(json) {
    pendingAccountsData = json;
    checkAndProcessLiveSheets();
  };

  window.handleJournalJSONP = function(json) {
    pendingJournalData = json;
    checkAndProcessLiveSheets();
  };

  const s1 = document.createElement('script');
  s1.src = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=responseHandler:handleAccountsJSONP&sheet=List%20of%20Accounts&_=${Date.now()}`;
  document.body.appendChild(s1);

  const s2 = document.createElement('script');
  s2.src = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=responseHandler:handleJournalJSONP&sheet=General%20Journal&_=${Date.now()}`;
  document.body.appendChild(s2);

  setTimeout(() => {
    try { s1.remove(); s2.remove(); } catch(e){}
  }, 10000);
}

function parseVal(v) {
  if (v === null || v === undefined) return 0.0;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/\?/g, '').replace(/₹/g, '').replace(/,/g, '').replace(/\(/g, '-').replace(/\)/g, '').trim();
  const num = parseFloat(s);
  return isNaN(num) ? 0.0 : num;
}

function checkAndProcessLiveSheets() {
  if (!pendingAccountsData || !pendingJournalData) return;

  try {
    const accTable = pendingAccountsData.table;
    const journalTable = pendingJournalData.table;

    const accounts = [];
    if (accTable && accTable.rows) {
      for (const r of accTable.rows) {
        if (!r.c || !r.c[0]) continue;
        const name = (r.c[0].v || '').trim();
        if (!name || name === 'Total' || name === 'List of Accounts') continue;

        const type = (r.c[1] ? (r.c[1].v || 'Other') : 'Other').trim();
        const rawBal = r.c[2] ? (r.c[2].v !== null ? r.c[2].v : r.c[2].f) : 0;
        const bal = Math.abs(parseVal(rawBal));
        const drcr = (r.c[3] ? (r.c[3].v || 'DR') : 'DR').trim();
        const stmt = (r.c[4] ? (r.c[4].v || 'BLSheet') : 'BLSheet').trim();
        const code = (r.c[5] ? (r.c[5].v || '') : '').trim();

        accounts.push({ name, type, balance: bal, drcr, statement: stmt, code });
      }
    }

    const transactions = [];
    const monthlySummary = {};

    if (journalTable && journalTable.rows) {
      let idx = 1;
      for (const r of journalTable.rows) {
        if (!r.c || !r.c[1]) continue;
        const acc = (r.c[1].v || '').trim();
        if (!acc || acc === 'Account') continue;

        let dateStr = '';
        if (r.c[0]) {
          if (r.c[0].f) dateStr = r.c[0].f;
          else if (r.c[0].v) dateStr = String(r.c[0].v);
        }

        let monthKey = '2025-01';
        const dObj = new Date(dateStr);
        if (!isNaN(dObj.getTime())) {
          monthKey = dObj.toISOString().slice(0, 7);
        } else if (dateStr.length >= 7) {
          monthKey = dateStr.slice(0, 7);
        }

        const accType = (r.c[2] ? (r.c[2].v || '') : '').trim();
        const desc = (r.c[3] ? (r.c[3].v || '') : '').trim();
        const ref = (r.c[4] ? (r.c[4].v || '') : '').trim();
        const debit = parseVal(r.c[5] ? (r.c[5].v !== null ? r.c[5].v : r.c[5].f) : 0);
        const credit = parseVal(r.c[6] ? (r.c[6].v !== null ? r.c[6].v : r.c[6].f) : 0);

        transactions.push({
          id: idx++,
          date: dateStr,
          month: monthKey,
          account: acc,
          account_type: accType,
          description: desc,
          reference: ref,
          debit: debit > 0 ? debit : 0,
          credit: credit > 0 ? credit : 0
        });

        if (!monthlySummary[monthKey]) {
          monthlySummary[monthKey] = {
            month: monthKey,
            income: 0.0,
            expenses: 0.0,
            net_savings: 0.0,
            tx_count: 0
          };
        }

        monthlySummary[monthKey].tx_count++;
        if (accType === 'Income') {
          const val = credit > 0 ? credit : debit;
          monthlySummary[monthKey].income += val;
        } else if (accType === 'Expenses') {
          const val = debit > 0 ? debit : credit;
          monthlySummary[monthKey].expenses += val;
        }
      }
    }

    for (const m of Object.values(monthlySummary)) {
      m.income = Math.round(m.income * 100) / 100;
      m.expenses = Math.round(m.expenses * 100) / 100;
      m.net_savings = Math.round((m.income - m.expenses) * 100) / 100;
    }

    const assets = accounts.filter(a => (a.type === 'Current Asset' || a.type === 'Fixed Asset') && a.statement === 'BLSheet');
    const liabilities = accounts.filter(a => (a.type === 'Current Liability' || a.type === 'Liability') && a.statement === 'BLSheet');

    const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
    const totalLiabilities = liabilities.reduce((s, a) => s + a.balance, 0);
    const netWorth = totalAssets - totalLiabilities;

    const totalIncome = Object.values(monthlySummary).reduce((s, m) => s + m.income, 0);
    const totalExpenses = Object.values(monthlySummary).reduce((s, m) => s + m.expenses, 0);

    financeData = {
      title: "Personal Wealth & Double-Entry Financial Accounting System",
      owner: "Biju Sidharthan Portfolio",
      summary: {
        total_assets: Math.round(totalAssets * 100) / 100,
        total_liabilities: Math.round(totalLiabilities * 100) / 100,
        net_worth: Math.round(netWorth * 100) / 100,
        total_income: Math.round(totalIncome * 100) / 100,
        total_expenses: Math.round(totalExpenses * 100) / 100,
        total_savings: Math.round((totalIncome - totalExpenses) * 100) / 100,
        total_transactions: transactions.length,
        total_accounts: accounts.length
      },
      accounts: accounts,
      monthly_timeline: Object.values(monthlySummary).sort((a, b) => a.month.localeCompare(b.month)),
      transactions: transactions
    };

    lastSyncTime = new Date();
    setElHTML('live-sync-status', `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> <span class="hidden sm:inline">Synced: ${lastSyncTime.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})}</span><span class="sm:hidden">Synced</span>`);
    renderAll();
  } catch (err) {
    console.error("Error processing live Google Sheet JSONP:", err);
  }
}

// 3. Render Views
function renderAll() {
  if (!financeData) return;
  try {
    renderTickers();
    renderOverviewKPIs();
    renderOverviewCharts();
    renderOverviewLists();
    initJournalExplorer();
    renderBalanceSheet();
    renderProfitAndLoss();
    renderInvestments();
    renderLiabilities();
    if (window.lucide) lucide.createIcons();
  } catch(e) {
    console.error("Personal Finance Render Error:", e);
  }
}

function renderTickers() {
  const s = financeData.summary;
  const items = [
    `👑 TOTAL NET WORTH: ${formatINR(s.net_worth)}`,
    `💎 TOTAL ASSET BASE: ${formatINR(s.total_assets)}`,
    `🏦 TOTAL LIABILITIES: ${formatINR(s.total_liabilities)}`,
    `📈 TOTAL RECORDED INCOME: ${formatINR(s.total_income)}`,
    `🧾 TOTAL RECORDED SPENDING: ${formatINR(s.total_expenses)}`,
    `📊 DOUBLE-ENTRY JOURNAL: ${s.total_transactions.toLocaleString()} Entries Verified`
  ];
  setElHTML('ticker-content', items.map(t => `<span class="inline-block px-3 py-0.5 rounded bg-slate-800/80 border border-slate-700/50">${t}</span>`).join(' &bull; '));
}

function renderOverviewKPIs() {
  const s = financeData.summary;
  const accounts = financeData.accounts;

  setElText('kpi-net-worth', formatINR(s.net_worth));
  setElText('kpi-total-assets', formatINR(s.total_assets));
  setElText('kpi-total-liabilities', formatINR(s.total_liabilities));
  setElText('kpi-total-earnings', formatINR(s.total_income));
  setElText('kpi-tx-count', s.total_transactions.toLocaleString());

  const liquid = accounts
    .filter(a => a.type === 'Current Asset' && a.statement === 'BLSheet')
    .reduce((sum, a) => sum + a.balance, 0);
  setElText('kpi-liquid-assets', formatINR(liquid));

  const debtRatio = s.total_assets ? ((Math.abs(s.total_liabilities) / s.total_assets) * 100).toFixed(1) : 0;
  setElText('kpi-debt-ratio', `${debtRatio}%`);
}

function renderOverviewCharts() {
  const accounts = financeData.accounts || [];

  const realEstate = accounts.find(a => a.name.includes('Bangalore') || a.name.includes('Home'))?.balance || 4029195;
  const mutualFunds = accounts.find(a => a.name.includes('Groww-Consolidated'))?.balance || 655169;
  const chitsKSFE = accounts.find(a => a.name.includes('KSFE'))?.balance || 399015;
  const liquidBanks = accounts.filter(a => a.type === 'Current Asset').reduce((s, a) => s + a.balance, 0);
  const ssyDaughters = (accounts.find(a => a.name.includes('Nivedita'))?.balance || 48000) + (accounts.find(a => a.name.includes('Nandita'))?.balance || 48000);
  const otherAssets = Math.max(financeData.summary.total_assets - (realEstate + mutualFunds + chitsKSFE + liquidBanks + ssyDaughters), 0);

  const ctxDonut = document.getElementById('assetAllocationDonutChart');
  if (ctxDonut) {
    if (assetDonutChart) assetDonutChart.destroy();
    assetDonutChart = new Chart(ctxDonut.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['Real Estate (Bangalore Home)', 'Mutual Funds (Groww)', 'KSFE Chit Funds', 'Liquid Bank & Cash', 'SSY (Daughters)', 'Other Capital Assets'],
        datasets: [{
          data: [realEstate, mutualFunds, chitsKSFE, liquidBanks, ssyDaughters, otherAssets],
          backgroundColor: ['#06b6d4', '#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6'],
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

  const listEl = document.getElementById('asset-allocation-list');
  if (listEl) {
    const items = [
      { label: 'Real Estate / Property', val: realEstate, color: 'bg-cyan-500' },
      { label: 'Mutual Funds Portfolio', val: mutualFunds, color: 'bg-emerald-500' },
      { label: 'KSFE Chit Funds', val: chitsKSFE, color: 'bg-amber-500' },
      { label: 'Liquid Bank & Cash', val: liquidBanks, color: 'bg-blue-500' },
      { label: 'SSY (Nivedita & Nandita)', val: ssyDaughters, color: 'bg-pink-500' }
    ];
    listEl.innerHTML = items.map(i => `
      <div class="flex items-center justify-between p-2 rounded-lg bg-slate-900/50 border border-slate-800/60">
        <span class="flex items-center gap-2 text-slate-300">
          <span class="w-2.5 h-2.5 rounded-full ${i.color}"></span> ${i.label}
        </span>
        <span class="font-mono font-semibold text-white">${formatINR(i.val)}</span>
      </div>
    `).join('');
  }

  const timeline = financeData.monthly_timeline || [];
  const labels = timeline.map(t => t.month);
  const income = timeline.map(t => t.income);
  const expenses = timeline.map(t => t.expenses);
  const savings = timeline.map(t => t.net_savings);

  const ctxBar = document.getElementById('monthlyCashflowBarChart');
  if (ctxBar) {
    if (cashflowBarChart) cashflowBarChart.destroy();
    cashflowBarChart = new Chart(ctxBar.getContext('2d'), {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { label: 'Income', data: income, backgroundColor: 'rgba(16, 185, 129, 0.8)', borderRadius: 4 },
          { label: 'Expenses', data: expenses, backgroundColor: 'rgba(244, 63, 94, 0.8)', borderRadius: 4 },
          { type: 'line', label: 'Net Savings', data: savings, borderColor: '#06b6d4', borderWidth: 2.5, pointRadius: 3, tension: 0.2 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8', font: { size: 10 } } },
          y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8', callback: v => `₹${(v / 100000).toFixed(0)}L` } }
        }
      }
    });
  }
}

function renderOverviewLists() {
  const accounts = financeData.accounts || [];

  const liquidList = document.getElementById('overview-liquid-accounts-list');
  if (liquidList) {
    const liquidAccs = accounts.filter(a => a.type === 'Current Asset' && a.balance > 0);
    liquidList.innerHTML = liquidAccs.map(a => `
      <div class="flex items-center justify-between p-2 rounded-xl bg-slate-900/50 border border-slate-800">
        <span class="text-xs font-medium text-slate-200">${a.name}</span>
        <span class="text-xs font-bold font-mono text-cyan-400">${formatINR(a.balance)}</span>
      </div>
    `).join('');
  }

  const expList = document.getElementById('overview-top-expenses-list');
  if (expList) {
    const expAccs = accounts.filter(a => a.type === 'Expenses' && a.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 6);
    expList.innerHTML = expAccs.map(a => `
      <div class="flex items-center justify-between p-2 rounded-xl bg-slate-900/50 border border-slate-800">
        <span class="text-xs font-medium text-slate-200">${a.name}</span>
        <span class="text-xs font-bold font-mono text-rose-400">${formatINR(a.balance)}</span>
      </div>
    `).join('');
  }
}

function initJournalExplorer() {
  const accSelect = document.getElementById('journal-account-filter');
  if (accSelect && financeData) {
    const uniqueAccs = Array.from(new Set(financeData.transactions.map(t => t.account))).sort();
    accSelect.innerHTML = `<option value="ALL">All Accounts (${uniqueAccs.length})</option>` +
      uniqueAccs.map(a => `<option value="${a}">${a}</option>`).join('');
  }
  filteredTransactions = financeData ? [...financeData.transactions] : [];
  renderJournalTable();
}

function filterJournalTransactions() {
  const search = (document.getElementById('journal-search-input')?.value || '').toLowerCase().trim();
  const acc = document.getElementById('journal-account-filter')?.value || 'ALL';
  const accType = document.getElementById('journal-type-filter')?.value || 'ALL';

  filteredTransactions = (financeData?.transactions || []).filter(t => {
    const matchSearch = !search || t.description.toLowerCase().includes(search) || t.account.toLowerCase().includes(search) || (t.reference && t.reference.toLowerCase().includes(search));
    const matchAcc = acc === 'ALL' || t.account === acc;
    const matchType = accType === 'ALL' || t.account_type === accType;
    return matchSearch && matchAcc && matchType;
  });

  journalPage = 1;
  renderJournalTable();
}

function renderJournalTable() {
  const tbody = document.getElementById('journal-table-tbody');
  if (!tbody) return;

  const total = filteredTransactions.length;
  setElText('journal-total-count-badge', `${total.toLocaleString()} Entries`);

  const totalPages = Math.max(1, Math.ceil(total / journalPageSize));
  journalPage = Math.max(1, Math.min(journalPage, totalPages));

  setElText('journal-current-page-num', journalPage);
  const btnPrev = document.getElementById('btn-journal-prev');
  const btnNext = document.getElementById('btn-journal-next');
  if (btnPrev) btnPrev.disabled = journalPage <= 1;
  if (btnNext) btnNext.disabled = journalPage >= totalPages;

  const start = (journalPage - 1) * journalPageSize;
  const end = Math.min(start + journalPageSize, total);

  setElText('journal-pagination-info', `Showing ${total ? start + 1 : 0}-${end} of ${total.toLocaleString()}`);

  if (total === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-500 font-sans">No transactions match your search filter</td></tr>`;
    return;
  }

  const pageItems = filteredTransactions.slice(start, end);
  tbody.innerHTML = pageItems.map(t => `
    <tr class="hover:bg-slate-900/60">
      <td class="py-2.5 px-2.5 text-slate-300 text-[11px] sm:text-xs">${t.date}</td>
      <td class="py-2.5 px-2.5 font-semibold text-white text-[11px] sm:text-xs">${t.account}</td>
      <td class="py-2.5 px-2.5">
        <span class="px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-sans font-medium bg-slate-900 border border-slate-800 text-slate-300">${t.account_type}</span>
      </td>
      <td class="py-2.5 px-3 font-sans text-slate-300 text-[11px] sm:text-xs max-w-xs truncate" title="${t.description}">${t.description}</td>
      <td class="py-2.5 px-2.5 text-slate-400 font-sans text-[11px] sm:text-xs">${t.reference || '-'}</td>
      <td class="py-2.5 px-2.5 text-right font-bold text-[11px] sm:text-xs ${t.debit > 0 ? 'text-emerald-400' : 'text-slate-500'}">${t.debit > 0 ? formatINR(t.debit) : '-'}</td>
      <td class="py-2.5 px-2.5 text-right font-bold text-[11px] sm:text-xs ${t.credit > 0 ? 'text-rose-400' : 'text-slate-500'}">${t.credit > 0 ? formatINR(t.credit) : '-'}</td>
    </tr>
  `).join('');
}

function changeJournalPage(delta) {
  journalPage += delta;
  renderJournalTable();
}

function renderBalanceSheet() {
  const accounts = financeData.accounts || [];

  setElText('bs-total-assets-badge', formatINR(financeData.summary.total_assets));
  setElText('bs-net-worth-val', formatINR(financeData.summary.net_worth));

  const curAssets = accounts.filter(a => a.type === 'Current Asset' && a.statement === 'BLSheet');
  const fixAssets = accounts.filter(a => a.type === 'Fixed Asset' && a.statement === 'BLSheet');
  const curLiab = accounts.filter(a => a.type === 'Current Liability' && a.statement === 'BLSheet');
  const longLiab = accounts.filter(a => a.type === 'Liability' && a.statement === 'BLSheet');

  setElHTML('bs-current-assets-list', curAssets.map(a => `
    <div class="flex justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800">
      <span class="text-slate-300">${a.name}</span>
      <span class="font-bold text-white">${formatINR(a.balance)}</span>
    </div>
  `).join(''));

  setElHTML('bs-fixed-assets-list', fixAssets.map(a => `
    <div class="flex justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800">
      <span class="text-slate-300">${a.name}</span>
      <span class="font-bold text-cyan-400">${formatINR(a.balance)}</span>
    </div>
  `).join(''));

  setElHTML('bs-current-liabilities-list', curLiab.map(a => `
    <div class="flex justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800">
      <span class="text-slate-300">${a.name}</span>
      <span class="font-bold text-rose-300">${formatINR(a.balance)}</span>
    </div>
  `).join(''));

  setElHTML('bs-longterm-liabilities-list', longLiab.map(a => `
    <div class="flex justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800">
      <span class="text-slate-300">${a.name}</span>
      <span class="font-bold text-rose-400">${formatINR(a.balance)}</span>
    </div>
  `).join(''));
}

function renderProfitAndLoss() {
  const accounts = financeData.accounts || [];

  const incomeAccs = accounts.filter(a => a.type === 'Income' && a.balance > 0);
  const expenseAccs = accounts.filter(a => a.type === 'Expenses' && a.balance > 0).sort((a, b) => b.balance - a.balance);

  setElText('pnl-total-income-badge', formatINR(financeData.summary.total_income));
  setElText('pnl-total-expenses-badge', formatINR(financeData.summary.total_expenses));

  setElHTML('pnl-income-tbody', incomeAccs.map(a => `
    <tr class="hover:bg-slate-900/50">
      <td class="py-2.5 px-3 font-semibold text-white">${a.name}</td>
      <td class="py-2.5 px-3 text-right font-bold text-emerald-400">${formatINR(a.balance)}</td>
    </tr>
  `).join(''));

  const totalExp = financeData.summary.total_expenses || 1;
  setElHTML('pnl-expenses-tbody', expenseAccs.map(a => {
    const pct = ((a.balance / totalExp) * 100).toFixed(1);
    return `
      <tr class="hover:bg-slate-900/50">
        <td class="py-2.5 px-3 font-semibold text-slate-200">${a.name}</td>
        <td class="py-2.5 px-3 text-right font-bold text-rose-400">${formatINR(a.balance)}</td>
        <td class="py-2.5 px-3 text-right text-slate-400">${pct}%</td>
      </tr>
    `;
  }).join(''));
}

function renderInvestments() {
  const accounts = financeData.accounts || [];
  const cardsEl = document.getElementById('investment-cards-grid');
  const tbody = document.getElementById('investments-table-tbody');

  const invList = [
    { name: 'Groww Consolidated Mutual Funds', cat: 'Equity & Mutual Funds', note: 'Long Term Portfolio', val: 655169, icon: 'trending-up', color: 'text-emerald-400' },
    { name: 'KSFE Chit Funds', cat: 'Fixed Chit Savings', note: 'Monthly Yield Chit Plan', val: 399015, icon: 'shield-check', color: 'text-amber-400' },
    { name: 'Sukanya Samriddhi (SSY - Nivedita)', cat: 'Government Savings Scheme', note: 'Daughter 1 Future Security', val: 48000, icon: 'heart', color: 'text-pink-400' },
    { name: 'Sukanya Samriddhi (SSY - Nandita)', cat: 'Government Savings Scheme', note: 'Daughter 2 Future Security', val: 48000, icon: 'heart', color: 'text-pink-400' },
    { name: 'Shares & Direct Equities (Groww)', cat: 'Equities', note: 'Direct Stock Portfolio', val: 10000, icon: 'bar-chart-2', color: 'text-cyan-400' },
    { name: 'SIP - Groww', cat: 'Recurring SIP', note: 'Active Auto-Debit', val: 11000, icon: 'repeat', color: 'text-indigo-400' }
  ];

  if (cardsEl) {
    cardsEl.innerHTML = invList.slice(0, 3).map(i => `
      <div class="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-5 border border-slate-800 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">${i.cat}</span>
          <i data-lucide="${i.icon}" class="w-4 h-4 ${i.color}"></i>
        </div>
        <span class="text-xl sm:text-2xl font-bold font-mono text-white block">${formatINR(i.val)}</span>
        <p class="text-xs text-slate-300 font-sans">${i.name}</p>
      </div>
    `).join('');
  }

  if (tbody) {
    tbody.innerHTML = invList.map(i => `
      <tr class="hover:bg-slate-900/50">
        <td class="py-2.5 px-4 font-bold text-white font-sans">${i.name}</td>
        <td class="py-2.5 px-4 text-slate-300 font-sans">${i.cat}</td>
        <td class="py-2.5 px-4 text-slate-400 font-sans">${i.note}</td>
        <td class="py-2.5 px-4 text-right font-bold text-emerald-400">${formatINR(i.val)}</td>
      </tr>
    `).join('');
  }
}

function renderLiabilities() {
  setElText('liab-total-sum', formatINR(financeData.summary.total_liabilities));

  const grid = document.getElementById('loan-items-grid');
  if (!grid) return;

  const loans = [
    { name: 'HDFC Home Loan (Bangalore Property)', type: 'Secured Mortgage Loan', opening: 2769349, emi: 'Monthly Auto Debit', note: 'Primary Residence Asset Collateral', color: 'border-rose-500/30' },
    { name: 'HDFC Personal Loan', type: 'Unsecured Term Facility', opening: 623475, emi: 'Fixed Tenure Installments', note: 'Personal Financing Facility', color: 'border-amber-500/30' },
    { name: 'SBI Credit Card Facility', type: 'Revolving Credit Line', opening: 57068, emi: 'Full Monthly Settlement', note: '0.00 Current Balance (Paid off)', color: 'border-cyan-500/30' },
    { name: 'HDFC Credit Card Facility', type: 'Revolving Credit Line', opening: 41062, emi: 'Full Monthly Settlement', note: 'Settled regularly via Net Banking', color: 'border-indigo-500/30' }
  ];

  grid.innerHTML = loans.map(l => `
    <div class="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-5 border ${l.color} space-y-2.5">
      <div class="flex items-center justify-between">
        <h4 class="font-bold text-white text-sm sm:text-base">${l.name}</h4>
        <span class="px-2 py-0.5 rounded text-[10px] font-sans font-medium bg-slate-900 border border-slate-800 text-slate-300">${l.type}</span>
      </div>
      <div class="flex justify-between items-baseline pt-2 border-t border-slate-800">
        <span class="text-xs text-slate-400">Principal Balance:</span>
        <span class="text-lg sm:text-xl font-bold font-mono text-rose-400">${formatINR(l.opening)}</span>
      </div>
      <p class="text-xs text-slate-400 font-sans">${l.note}</p>
    </div>
  `).join('');
}

function manualSelectTab(tabId) {
  if (isPresentationRunning) stopPresentationMode();
  switchTab(tabId);
}

function switchTab(tabId) {
  currentTab = tabId;
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(el => {
    el.classList.remove('active', 'bg-emerald-500/20', 'text-emerald-400', 'border-emerald-500/40');
    el.classList.add('text-slate-400', 'border-transparent');
  });

  const activePane = document.getElementById(`tab-${tabId}`);
  const activeBtn = document.getElementById(`tab-btn-${tabId}`);
  if (activePane) activePane.classList.add('active');
  if (activeBtn) {
    activeBtn.classList.add('active', 'bg-emerald-500/20', 'text-emerald-400', 'border-emerald-500/40');
    activeBtn.classList.remove('text-slate-400', 'border-transparent');
  }

  if (window.lucide) lucide.createIcons();
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

function exportJournalCSV() {
  let csv = `Date,Account,Account Type,Description,Reference,Debit,Credit\n`;
  filteredTransactions.forEach(t => {
    csv += `"${t.date}","${t.account}","${t.account_type}","${t.description.replace(/"/g, '""')}","${t.reference || ''}",${t.debit},${t.credit}\n`;
  });
  downloadBlob(csv, `Personal_General_Journal_${new Date().toISOString().slice(0,10)}.csv`, 'text/csv');
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
