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

/* ─── API ─── */
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
  editingTxId: null,
};

const ACCOUNT_TYPE_ICONS = { cash: '💴', bank: '🏦', credit: '💳', 'e-money': '📱', other: '📦' };

/* ─── 初期化 ─── */
async function init() {
  await loadAllData();
  setupNavigation();
  setupEventListeners();
  renderAll();
}

async function loadAllData() {
  const [acc, cat, tx] = await Promise.all([
    API.list('accounts'), API.list('categories'), API.list('transactions')
  ]);
  App.accounts = acc;
  App.categories = cat;
  App.transactions = tx.sort((a,b) => b.date.localeCompare(a.date));
}

function setupEventListeners() {
  // 1. ダッシュボードのボタン
  $('#btn-wallet-check').onclick = () => openWalletCheckModal();
  $('#btn-go-accounts').onclick = () => navigateTo('accounts');
  $('#btn-go-transactions').onclick = () => navigateTo('transactions');
  
  // 2. 取引入力のタブ切り替え
  $$('.type-tab').forEach(btn => {
    btn.onclick = () => {
      App.selectedTxType = btn.dataset.type;
      $$('.type-tab').forEach(b => b.classList.toggle('active', b === btn));
      
      // 入力項目の出し分け
      $('#group-category')?.classList.toggle('hidden', App.selectedTxType === 'transfer');
      $('#group-to-account')?.classList.toggle('hidden', App.selectedTxType !== 'transfer');
      
      renderCategoryPicker();
    };
  });

  // 3. 月切り替え
  $$('.month-nav-btn').forEach(btn => {
    btn.onclick = () => changeMonth(btn.id.includes('next') ? 1 : -1);
  });

  // 4. 保存・バックアップ
  $('#btn-save-transaction').onclick = saveTransaction;
  $('#btn-backup').onclick = () => openModal('backup');

  // 5. 戻るボタン
  $$('.back-btn').forEach(btn => {
    btn.onclick = () => navigateTo(btn.dataset.back || 'dashboard');
  });
}

/* ─── 描画 ─── */
function renderAll() {
  const { y, m } = parseMonth(App.currentMonth);
  $$('.month-label').forEach(el => el.textContent = `${y}年${m}月`);

  if (App.currentPage === 'dashboard') renderDashboard();
  if (App.currentPage === 'transactions') renderTransactionsList();
}

function renderDashboard() {
  const currentMonthTxs = App.transactions.filter(t => t.date.startsWith(App.currentMonth));
  
  // サマリー計算 (資金移動は除外)
  const income = currentMonthTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = currentMonthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  $('#summary-income').textContent = fmt(income);
  $('#summary-expense').textContent = fmt(expense);
  $('#summary-balance').textContent = fmtSigned(income - expense);

  // 口座残高一覧
  $('#account-list-dashboard').innerHTML = App.accounts.map(acc => `
    <div class="account-item">
      <div class="account-icon">${ACCOUNT_TYPE_ICONS[acc.account_type] || '💴'}</div>
      <div class="account-info"><div>${acc.name}</div></div>
      <div class="account-balance-text">${fmt(computeAccountBalance(acc))}</div>
    </div>
  `).join('');

  // 最近の取引 (5件)
  $('#recent-transactions').innerHTML = App.transactions.slice(0, 5).map(t => renderTxItem(t)).join('');
}

function renderTxItem(t) {
  const cat = App.categories.find(c => c.id === t.category_id);
  const acc = App.accounts.find(a => a.id === t.account_id);
  const icon = t.type === 'transfer' ? '🔄' : (cat ? cat.icon : '❓');
  const title = t.type === 'transfer' ? '資金移動' : (t.memo || (cat ? cat.name : '不明'));
  
  return `
    <div class="transaction-item" onclick="openInputPage('${t.id}')">
      <div class="tx-icon">${icon}</div>
      <div class="tx-info">
        <div class="tx-title">${title}</div>
        <div class="tx-sub">${t.date} · ${acc ? acc.name : '不明'}</div>
      </div>
      <div class="tx-amount ${t.type}">
        ${t.type === 'expense' ? '-' : t.type === 'income' ? '+' : ''}${fmt(t.amount)}
      </div>
    </div>
  `;
}

function computeAccountBalance(acc) {
  let bal = acc.initial_balance || 0;
  App.transactions.forEach(t => {
    if (t.account_id === acc.id) bal += (t.type === 'income' ? t.amount : -t.amount);
    if (t.type === 'transfer' && t.to_account_id === acc.id) bal += t.amount;
  });
  return bal;
}

/* ─── 画面遷移 ─── */
function navigateTo(page) {
  $$('.page').forEach(p => p.classList.remove('active'));
  $(`#page-${page}`).classList.add('active');
  App.currentPage = page;
  renderAll();
}

function openInputPage(id = null) {
  const t = App.transactions.find(x => x.id === id);
  App.editingTxId = id;
  
  $('#input-amount').value = t ? t.amount : '';
  $('#input-date').value = t ? t.date : today();
  $('#input-memo').value = t ? t.memo : '';
  
  App.selectedTxType = t ? t.type : 'expense';
  $$('.type-tab').forEach(b => b.classList.toggle('active', b.dataset.type === App.selectedTxType));
  
  // セレクトボックス更新
  const opts = App.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  $('#input-account').innerHTML = opts;
  if ($('#input-to-account')) $('#input-to-account').innerHTML = opts;
  
  if (t) {
    $('#input-account').value = t.account_id;
    if (t.type === 'transfer') $('#input-to-account').value = t.to_account_id;
  }

  renderCategoryPicker();
  navigateTo('input');
}

function renderCategoryPicker() {
  const cats = App.categories.filter(c => c.type === App.selectedTxType);
  const container = $('#category-picker');
  if (!container) return;
  
  container.innerHTML = cats.map(c => `
    <button class="cat-chip ${c.id === App.selectedCategoryId ? 'selected' : ''}" 
            onclick="App.selectedCategoryId='${c.id}'; renderCategoryPicker()">
      <span>${c.icon}</span><span>${c.name}</span>
    </button>
  `).join('');
}

async function saveTransaction() {
  const amount = parseInt($('#input-amount').value);
  if (!amount) return alert('金額を入力してください');

  const data = {
    id: App.editingTxId || uuid(),
    type: App.selectedTxType,
    amount,
    account_id: $('#input-account').value,
    to_account_id: App.selectedTxType === 'transfer' ? $('#input-to-account').value : '',
    category_id: App.selectedTxType === 'transfer' ? null : App.selectedCategoryId,
    date: $('#input-date').value,
    memo: $('#input-memo').value
  };

  if (App.editingTxId) await API.update('transactions', App.editingTxId, data);
  else await API.create('transactions', data);

  await loadAllData();
  navigateTo('dashboard');
}

function changeMonth(delta) {
  const { y, m } = parseMonth(App.currentMonth);
  const d = new Date(y, m - 1 + delta, 1);
  App.currentMonth = monthKey(d.getFullYear(), d.getMonth() + 1);
  renderAll();
}

function setupNavigation() {
  $$('.nav-item').forEach(btn => {
    btn.onclick = () => {
      if (btn.dataset.page === 'input') openInputPage();
      else navigateTo(btn.dataset.page);
    };
  });
}

function openModal(n) { $(`#modal-${n}`).classList.remove('hidden'); }
function closeModal(n) { $(`#modal-${n}`).classList.add('hidden'); }

document.addEventListener('DOMContentLoaded', init);
