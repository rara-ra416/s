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

/* ─── API ラッパー (LocalStorage 互換) ─── */
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

/* ─── アプリ状態 ─── */
const App = {
  currentPage: 'dashboard',
  currentMonth: monthKey(new Date().getFullYear(), new Date().getMonth() + 1),
  accounts: [],
  categories: [],
  transactions: [],
  selectedTxType: 'expense',
  selectedCategoryId: null,
  editingTxId: null,
};

const ACCOUNT_TYPE_ICONS = { cash: '💴', bank: '🏦', credit: '💳', 'e-money': '📱', other: '📦' };

/* ─── 初期化 ─── */
async function init() {
  await loadAllData();
  
  // 初期データがない場合の補填
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
}

async function loadAllData() {
  const [acc, cat, tx] = await Promise.all([
    API.list('accounts'), API.list('categories'), API.list('transactions')
  ]);
  App.accounts = acc.filter(a => a.is_active);
  App.categories = cat.filter(c => c.is_active);
  App.transactions = tx.sort((a,b) => b.date.localeCompare(a.date));
}

/* ─── イベント設定 (154行目のエラーを修正済み) ─── */
function setupEventListeners() {
  // 収入・支出・移動タブ
  $$('.type-tab').forEach(btn => {
    btn.onclick = () => {
      const type = btn.dataset.type;
      App.selectedTxType = type;
      $$('.type-tab').forEach(b => b.classList.toggle('active', b === btn));
      $('#group-to-account')?.classList.toggle('hidden', type !== 'transfer');
      $('#group-category')?.classList.toggle('hidden', type === 'transfer');
      renderCategoryPicker(type);
    };
  });

  // 保存
  $('#btn-save-transaction')?.addEventListener('click', saveTransaction);

  // 月切り替え (SyntaxErrorの修正箇所)
  const prevMonthBtn = $('#btn-prev-month');
  const nextMonthBtn = $('#btn-next-month');
  
  if (prevMonthBtn) prevMonthBtn.onclick = () => changeMonth(-1);
  if (nextMonthBtn) nextMonthBtn.onclick = () => changeMonth(1);
}

function changeMonth(delta) {
  const { y, m } = parseMonth(App.currentMonth);
  let nm = m + delta, ny = y;
  if (nm > 12) { nm = 1; ny++; } else if (nm < 1) { nm = 12; ny--; }
  
  // ここが 154 行目のエラー修正ポイントです
  App.currentMonth = monthKey(ny, nm); 
  
  renderDashboard();
}

function setupNavigation() {
  $$('.nav-item').forEach(btn => {
    btn.onclick = () => {
      const page = btn.dataset.page;
      if (page === 'input') { openInputPage(null); return; }
      navigateTo(page);
    };
  });
}

function navigateTo(page) {
  $$('.page').forEach(p => p.classList.remove('active'));
  $(`#page-${page}`)?.classList.add('active');
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  if (page === 'dashboard') renderDashboard();
}

function renderDashboard() {
  const label = $('#dashboard-month-label');
  if (label) {
    const { y, m } = parseMonth(App.currentMonth);
    label.textContent = `${y}年${m}月`;
  }

  const txs = App.transactions.filter(t => t.date.startsWith(App.currentMonth));
  const inc = txs.filter(t => t.type === 'income').reduce((s,t) => s+t.amount, 0);
  const exp = txs.filter(t => t.type === 'expense').reduce((s,t) => s+t.amount, 0);

  if ($('#summary-income')) $('#summary-income').textContent = fmt(inc);
  if ($('#summary-expense')) $('#summary-expense').textContent = fmt(exp);
  if ($('#summary-balance')) $('#summary-balance').textContent = fmtSigned(inc - exp);

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

function openInputPage(tx) {
  App.editingTxId = tx?.id || null;
  const type = tx?.type || 'expense';
  App.selectedTxType = type;
  $('#input-amount').value = tx?.amount || '';
  $('#input-date').value = tx?.date || today();
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
  navigateTo('dashboard');
}

document.addEventListener('DOMContentLoaded', init);
