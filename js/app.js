/* =====================================================
   かけいぼ - メインアプリロジック (GitHub Pages & LocalStorage 完全対応版)
   ===================================================== */

'use strict';

/* ─── ユーティリティ ─── */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
const fmt = (n) => '¥' + Math.abs(n || 0).toLocaleString('ja-JP');
const fmtSigned = (n) => (n >= 0 ? '+¥' : '-¥') + Math.abs(n || 0).toLocaleString('ja-JP');
const today = () => new Date().toISOString().split('T')[0];
const monthKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
const parseMonth = (s) => ({ y: parseInt(s.split('-')[0]), m: parseInt(s.split('-')[1]) });

/* ─── API ラッパー (LocalStorage版に差し替え) ─── */
// GitHub Pagesではサーバー保存ができないため、ブラウザ内に保存するように変更しました
const API = {
  _load(table) {
    return JSON.parse(localStorage.getItem(`kb_${table}`) || '[]');
  },
  _save(table, data) {
    localStorage.setItem(`kb_${table}`, JSON.stringify(data));
  },
  async list(table) {
    return this._load(table);
  },
  async create(table, data) {
    const list = this._load(table);
    list.push(data);
    this._save(table, list);
    return data;
  },
  async update(table, id, data) {
    let list = this._load(table);
    list = list.map(item => item.id === id ? { ...item, ...data } : item);
    this._save(table, list);
    return data;
  },
  async delete(table, id) {
    let list = this._load(table);
    list = list.filter(item => item.id !== id);
    this._save(table, list);
  }
};

/* ─── アプリ状態 ─── */
const App = {
  currentPage: 'dashboard',
  currentMonth: monthKey(new Date().getFullYear(), new Date().getMonth() + 1),
  txMonth: monthKey(new Date().getFullYear(), new Date().getMonth() + 1),
  rpMonth: monthKey(new Date().getFullYear(), new Date().getMonth() + 1),
  trMonth: monthKey(new Date().getFullYear(), new Date().getMonth() + 1),
  accounts: [],
  categories: [],
  transactions: [],
  walletChecks: [],
  travelLogs: [],
  editingTxId: null,
  editingAccountId: null,
  editingCategoryId: null,
  catTypeFilter: 'expense',
  selectedCategoryId: null,
  selectedTxType: 'expense', // 初期値をセット
  selectedAccountType: 'cash',
  selectedColor: '#FF3B30',
  selectedEmoji: '💴',
  barChart: null,
};

/* ─── 定数 ─── */
const ACCOUNT_TYPE_LABELS = { cash: '現金', bank: '銀行', credit: 'クレジット', 'e-money': '電子マネー', other: 'その他' };
const ACCOUNT_TYPE_ICONS  = { cash: '💴', bank: '🏦', credit: '💳', 'e-money': '📱', other: '📦' };

const DEFAULT_CATEGORIES = [
  { name: '食費',     type: 'expense', icon: '🍽️', color: '#FF6B6B', is_system: true,  sort_order: 1 },
  { name: '給与',     type: 'income',  icon: '💰', color: '#34C759', is_system: true,  sort_order: 11 },
  { name: '雑損',     type: 'expense', icon: '📉', color: '#FF3B30', is_system: true,  sort_order: 10 },
  { name: '雑益',     type: 'income',  icon: '📈', color: '#34C759', is_system: true,  sort_order: 14 },
];

const DEFAULT_ACCOUNTS = [
  { name: '財布', account_type: 'cash', balance: 0, initial_balance: 0, sort_order: 1, is_wallet: true, is_active: true },
  { name: '銀行口座', account_type: 'bank', balance: 0, initial_balance: 0, sort_order: 2, is_wallet: false, is_active: true },
];

const EMOJIS = ['💴','🏦','💳','📱','🛒','🍽️','🚃','🏥','🏠','👕','🎮','🎁','💡','📦','💰','📈','📉'];
const COLORS = ['#FF3B30','#FF9500','#FFCC00','#34C759','#5AC8FA','#007AFF','#5856D6','#B0B0B0'];

/* ─── 初期化 ─── */
async function init() {
  await ensureDefaultData();
  await loadAllData();
  setupNavigation();
  setupEventListeners();
  renderDashboard();
}

async function ensureDefaultData() {
  const cats = await API.list('categories');
  if (cats.length === 0) {
    for (const c of DEFAULT_CATEGORIES) {
      await API.create('categories', { id: uuid(), ...c, is_active: true });
    }
  }
  const accs = await API.list('accounts');
  if (accs.length === 0) {
    for (const a of DEFAULT_ACCOUNTS) {
      await API.create('accounts', { id: uuid(), ...a });
    }
  }
}

async function loadAllData() {
  const [accounts, categories, transactions, walletChecks, travelLogs] = await Promise.all([
    API.list('accounts'),
    API.list('categories'),
    API.list('transactions'),
    API.list('wallet_checks'),
    API.list('travel_logs'),
  ]);
  App.accounts    = accounts.filter(a => a.is_active);
  App.categories  = categories.filter(c => c.is_active);
  App.transactions = transactions.sort((a, b) => b.date.localeCompare(a.date));
  App.walletChecks = walletChecks;
  App.travelLogs   = travelLogs;
}

/* ─── ナビゲーション ─── */
function setupNavigation() {
  $$('.nav-item').forEach(btn => {
    btn.onclick = () => {
      const page = btn.dataset.page;
      if (page === 'input') { openInputPage(null); return; }
      navigateTo(page);
    };
  });
  $$('[data-back]').forEach(btn => {
    btn.onclick = () => navigateTo(btn.dataset.back);
  });
}

function navigateTo(page) {
  $$('.page').forEach(p => p.classList.remove('active'));
  $(`#page-${page}`)?.classList.add('active');
  App.currentPage = page;
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  
  if (page === 'dashboard')    renderDashboard();
  if (page === 'transactions') renderTransactionsList();
  if (page === 'accounts')     renderAccountsPage();
  if (page === 'categories')   renderCategoriesPage();
}

/* ─── イベントリスナー (タブ切り替え強化) ─── */
function setupEventListeners() {
  // 月切り替えボタン
  $('#btn-prev-month')?.addEventListener('click', () => changeMonth('dashboard', -1));
  $('#btn-next-month')?.addEventListener('click', () => changeMonth('dashboard', +1));

  // ★ 収入・支出タブ切り替えの修正 ★
  $$('.type-tab[data-type]').forEach(btn => {
    btn.onclick = () => {
      const type = btn.dataset.type;
      App.selectedTxType = type;
      $$('.type-tab[data-type]').forEach(b => b.classList.toggle('active', b.dataset.type === type));
      
      // 移動先入力欄の表示切り替えなど
      $('#group-to-account')?.classList.toggle('hidden', type !== 'transfer');
      $('#group-category')?.classList.toggle('hidden', type === 'transfer');
      
      renderCategoryPicker(type);
    };
  });

  $('#btn-save-transaction')?.addEventListener('click', saveTransaction);
  
  // モーダルを閉じる
  $$('.modal-close').forEach(btn => {
    btn.onclick = () => btn.closest('.modal-overlay').classList.add('hidden');
  });
}

function changeMonth(target, delta) {
  const key = target === 'dashboard' ? 'currentMonth' : 'txMonth';
  const { y, m } = parseMonth(App[key]);
  let nm = m + delta, ny = y;
  if (nm > 12) { nm = 1; ny++; }
  if (nm < 1)  { nm = 12; ny--; }
  App[key] = monthKey(ny, nm);
  renderDashboard();
}

/* ─── 描画処理 ─── */
function renderDashboard() {
  $('#dashboard-month-label').textContent = formatMonthLabel(App.currentMonth);
  const txs = App.transactions.filter(t => t.date.startsWith(App.currentMonth));

  const income  = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  $('#summary-income').textContent  = fmt(income);
  $('#summary-expense').textContent = fmt(expense);
  $('#summary-balance').textContent = fmtSigned(income - expense);

  const container = $('#account-list-dashboard');
  container.innerHTML = App.accounts.map(acc => {
    const bal = computeAccountBalance(acc);
    return `
      <div class="account-item">
        <div class="account-icon">${ACCOUNT_TYPE_ICONS[acc.account_type]}</div>
        <div class="account-info">
          <div class="account-name">${acc.name}</div>
        </div>
        <div class="account-balance-text">${fmt(bal)}</div>
      </div>
    `;
  }).join('');
}

function openInputPage(tx) {
  App.editingTxId = tx?.id || null;
  const type = tx?.type || 'expense';
  App.selectedTxType = type;
  
  $('#input-amount').value = tx?.amount || '';
  $('#input-date').value = tx?.date || today();
  $('#input-memo').value = tx?.memo || '';
  
  // タブの状態をリセット
  $$('.type-tab[data-type]').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  
  updateAccountSelects();
  renderCategoryPicker(type);
  navigateTo('input');
}

function renderCategoryPicker(type) {
  const container = $('#category-picker');
  if (!container) return;
  container.innerHTML = '';
  const relevant = App.categories.filter(c => c.type === type || c.type === 'both');
  
  relevant.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'cat-chip' + (cat.id === App.selectedCategoryId ? ' selected' : '');
    btn.innerHTML = `<span>${cat.icon}</span><span>${cat.name}</span>`;
    btn.onclick = () => {
      App.selectedCategoryId = cat.id;
      $$('.cat-chip').forEach(c => c.classList.remove('selected'));
      btn.classList.add('selected');
    };
    container.appendChild(btn);
  });
}

function updateAccountSelects() {
  const html = App.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  if ($('#input-account')) $('#input-account').innerHTML = html;
  if ($('#input-to-account')) $('#input-to-account').innerHTML = html;
}

async function saveTransaction() {
  const amount = parseInt($('#input-amount').value);
  if (!amount) { alert('金額を入力してください'); return; }

  const data = {
    id: App.editingTxId || uuid(),
    type: App.selectedTxType,
    amount: amount,
    account_id: $('#input-account').value,
    to_account_id: App.selectedTxType === 'transfer' ? $('#input-to-account').value : '',
    category_id: App.selectedCategoryId,
    date: $('#input-date').value,
    memo: $('#input-memo').value,
    created_at: Date.now()
  };

  if (App.editingTxId) {
    await API.update('transactions', App.editingTxId, data);
  } else {
    await API.create('transactions', data);
  }

  await loadAllData();
  alert('保存しました');
  navigateTo('dashboard');
}

/* ─── 計算ヘルパー ─── */
function computeAccountBalance(acc) {
  let bal = acc.initial_balance || 0;
  App.transactions.forEach(tx => {
    if (tx.account_id === acc.id) {
      if (tx.type === 'expense' || tx.type === 'transfer') bal -= tx.amount;
      if (tx.type === 'income') bal += tx.amount;
    }
    if (tx.type === 'transfer' && tx.to_account_id === acc.id) bal += tx.amount;
  });
  return bal;
}

function formatMonthLabel(mk) {
  const { y, m } = parseMonth(mk);
  return `${y}年${m}月`;
}

// 起動
window.addEventListener('DOMContentLoaded', init);
