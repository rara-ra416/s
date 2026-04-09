'use strict';

/* ─── ユーティリティ (変更なし) ─── */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
const fmt = (n) => '¥' + Math.abs(n || 0).toLocaleString('ja-JP');
const fmtSigned = (n) => (n >= 0 ? '+¥' : '-¥') + Math.abs(n || 0).toLocaleString('ja-JP');
const today = () => new Date().toISOString().split('T')[0];
const monthKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
const parseMonth = (s) => ({ y: parseInt(s.split('-')[0]), m: parseInt(s.split('-')[1]) });

/* ─── API ラッパー (LocalStorageに完全移行) ─── */
const API = {
  _db(table) { return JSON.parse(localStorage.getItem(`kb_v3_${table}`) || '[]'); },
  _save(table, data) { localStorage.setItem(`kb_v3_${table}`, JSON.stringify(data)); },
  async list(table) { return this._db(table); },
  async create(table, data) {
    const list = this._db(table);
    list.push(data);
    this._save(table, list);
    return data;
  },
  async update(table, id, data) {
    let list = this._db(table);
    list = list.map(item => item.id === id ? { ...item, ...data } : item);
    this._save(table, list);
    return data;
  },
  async delete(table, id) {
    let list = this._db(table);
    list = list.filter(item => item.id !== id);
    this._save(table, list);
  }
};

/* ─── アプリ状態 (あなたのコードから全機能を維持) ─── */
const App = {
  currentPage: 'dashboard',
  currentMonth: monthKey(new Date().getFullYear(), new Date().getMonth() + 1),
  accounts: [],
  categories: [],
  transactions: [],
  walletChecks: [],
  travelLogs: [],
  selectedTxType: 'expense',
  selectedCategoryId: null,
  editingTxId: null,
};

const ACCOUNT_TYPE_ICONS = { cash: '💴', bank: '🏦', credit: '💳', 'e-money': '📱', other: '📦' };

/* ─── 初期化 ─── */
async function init() {
  try {
    await loadAllData();
    // デフォルトデータの投入
    if (App.categories.length === 0) {
      await API.create('categories', { id: uuid(), name: '食費', type: 'expense', icon: '🍽️', is_active: true });
      await API.create('categories', { id: uuid(), name: '給与', type: 'income', icon: '💰', is_active: true });
    }
    if (App.accounts.length === 0) {
      await API.create('accounts', { id: uuid(), name: '財布', account_type: 'cash', initial_balance: 0, is_active: true });
    }
    await loadAllData();

    setupNavigation();
    setupEventListeners();
    renderDashboard();
  } catch (e) {
    console.error("初期化エラー:", e);
  }
}

async function loadAllData() {
  const [acc, cat, tx, wc, tl] = await Promise.all([
    API.list('accounts'), API.list('categories'), API.list('transactions'),
    API.list('wallet_checks'), API.list('travel_logs')
  ]);
  App.accounts = acc.filter(a => a.is_active);
  App.categories = cat.filter(c => c.is_active);
  App.transactions = tx.sort((a,b) => b.date.localeCompare(a.date));
  App.walletChecks = wc;
  App.travelLogs = tl;
}

/* ─── イベント設定 (ボタンの動作を保証) ─── */
function setupEventListeners() {
  // 1. 収入・支出・移動タブの切り替え
  $$('.type-tab').forEach(btn => {
    btn.onclick = () => {
      const type = btn.dataset.type;
      App.selectedTxType = type;
      $$('.type-tab').forEach(b => b.classList.toggle('active', b === btn));
      
      // フィールド表示の連動
      $('#group-to-account')?.classList.toggle('hidden', type !== 'transfer');
      $('#group-category')?.classList.toggle('hidden', type === 'transfer');
      
      renderCategoryPicker(type);
    };
  });

  // 2. 保存ボタン
  const saveBtn = $('#btn-save-transaction');
  if (saveBtn) {
    saveBtn.onclick = async () => {
      await saveTransaction();
    };
  }

  // 3. 月切り替え
  $('#btn-prev-month').onclick = () => changeMonth(-1);
  $('#btn-next-month').onclick = () => changeMonth(1);
}

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

/* ─── メインロジック (描画・保存) ─── */
function navigateTo(page) {
  $$('.page').forEach(p => p.classList.remove('active'));
  const target = $(`#page-${page}`);
  if (target) target.classList.add('active');
  
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  if (page === 'dashboard') renderDashboard();
  if (page === 'transactions') renderTransactionsList();
}

function renderDashboard() {
  $('#dashboard-month-label').textContent = formatMonthLabel(App.currentMonth);
  const txs = App.transactions.filter(t => t.date.startsWith(App.currentMonth));
  const inc = txs.filter(t => t.type === 'income').reduce((s,t) => s+t.amount, 0);
  const exp = txs.filter(t => t.type === 'expense').reduce((s,t) => s+t.amount, 0);

  $('#summary-income').textContent = fmt(inc);
  $('#summary-expense').textContent = fmt(exp);
  $('#summary-balance').textContent = fmtSigned(inc - exp);

  const list = $('#account-list-dashboard');
  if (list) {
    list.innerHTML = App.accounts.map(acc => `
      <div class="account-item">
        <div class="account-icon">${ACCOUNT_TYPE_ICONS[acc.account_type] || '💴'}</div>
        <div class="account-info"><div>${acc.name}</div></div>
        <div class="account-balance-text">${fmt(computeAccountBalance(acc))}</div>
      </div>
    `).join('');
  }
}

function openInputPage(tx) {
  App.editingTxId = tx?.id || null;
  const type = tx?.type || 'expense';
  App.selectedTxType = type;
  
  $('#input-amount').value = tx?.amount || '';
  $('#input-date').value = tx?.date || today();
  $('#input-memo').value = tx?.memo || '';
  
  $$('.type-tab').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  updateAccountSelects();
  renderCategoryPicker(type);
  navigateTo('input');
}

function renderCategoryPicker(type) {
  const container = $('#category-picker');
  if (!container) return;
  const cats = App.categories.filter(c => c.type === type || c.type === 'both');
  container.innerHTML = cats.map(c => `
    <button class="cat-chip ${c.id === App.selectedCategoryId ? 'selected' : ''}" 
            onclick="App.selectedCategoryId='${c.id}'; renderCategoryPicker('${type}')">
      <span>${c.icon}</span><span>${c.name}</span>
    </button>
  `).join('');
}

function updateAccountSelects() {
  const options = App.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  if ($('#input-account')) $('#input-account').innerHTML = options;
  if ($('#input-to-account')) $('#input-to-account').innerHTML = options;
}

async function saveTransaction() {
  const amount = parseInt($('#input-amount').value);
  if (!amount) { alert('金額を入力してください'); return; }

  const data = {
    id: App.editingTxId || uuid(),
    type: App.selectedTxType,
    amount,
    account_id: $('#input-account').value,
    to_account_id: App.selectedTxType === 'transfer' ? $('#input-to-account').value : '',
    category_id: App.selectedCategoryId,
    date: $('#input-date').value,
    memo: $('#input-memo').value
  };

  if (App.editingTxId) await API.update('transactions', App.editingTxId, data);
  else await API.create('transactions', data);

  await loadAllData();
  alert('保存しました');
  navigateTo('dashboard');
}

function computeAccountBalance(acc) {
  let bal = acc.initial_balance || 0;
  App.transactions.forEach(t => {
    if (t.account_id === acc.id) {
      if (t.type === 'expense' || t.type === 'transfer') bal -= t.amount;
      if (t.type === 'income') bal += t.amount;
    }
    if (t.type === 'transfer' && t.to_account_id === acc.id) bal += t.amount;
  });
  return bal;
}

function changeMonth(delta) {
  const { y, m } = parseMonth(App.currentMonth);
  let nm = m + delta, ny = y;
  if (nm > 12) { nm = 1; ny++; } else if (nm < 1) { nm = 12; ny--; }
  App.currentMonth = monthKey(ny, nm);
  renderDashboard();
}

function formatMonthLabel(mk) {
  const { y, m } = parseMonth(mk);
  return `${y}年${m}月`;
}

// 起動
document.addEventListener('DOMContentLoaded', init);
