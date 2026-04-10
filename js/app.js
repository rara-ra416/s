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

/* ─── API (LocalStorage) ─── */
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
  // フィルタパネルの状態
  filter: {
    type: '',     // income, expense, transfer
    account: '',  // accountId
    category: ''  // categoryId
  }
};

const ACCOUNT_TYPE_ICONS = { cash: '💴', bank: '🏦', credit: '💳', 'e-money': '📱', other: '📦' };

/* ─── 初期化 ─── */
async function init() {
  await loadAllData();
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

/* ─── イベントリスナー（HTML構造に完全準拠） ─── */
function setupEventListeners() {
  // ページ切り替え
  $$('.nav-item').forEach(btn => {
    btn.onclick = () => btn.dataset.page === 'input' ? openInputPage() : navigateTo(btn.dataset.page);
  });
  $('#btn-go-accounts').onclick = () => navigateTo('accounts');
  $('#btn-go-transactions').onclick = () => navigateTo('transactions');
  $$('.back-btn').forEach(btn => btn.onclick = () => navigateTo(btn.dataset.back || 'dashboard'));

  // フィルターパネル（#filter-panel）の制御
  $('#btn-filter-transactions').onclick = () => {
    $('#filter-panel').classList.toggle('hidden');
    renderFilterOptions(); // セレクトボックスの中身を最新状態に更新
  };

  // フィルター値が変更されたら即座に再描画
  $('#filter-type').onchange = (e) => { App.filter.type = e.target.value; renderTransactionsList(); };
  $('#filter-account').onchange = (e) => { App.filter.account = e.target.value; renderTransactionsList(); };
  $('#filter-category').onchange = (e) => { App.filter.category = e.target.value; renderTransactionsList(); };
  
  // フィルタークリア
  $('#btn-filter-clear').onclick = () => {
    App.filter = { type: '', account: '', category: '' };
    $('#filter-type').value = '';
    $('#filter-account').value = '';
    $('#filter-category').value = '';
    renderTransactionsList();
  };

  // 取引一覧用の月ナビゲーション
  $('#btn-prev-month-tx').onclick = () => changeMonth(-1);
  $('#btn-next-month-tx').onclick = () => changeMonth(1);

  // ダッシュボード用の月ナビゲーション
  $('#btn-prev-month').onclick = () => changeMonth(-1);
  $('#btn-next-month').onclick = () => changeMonth(1);

  // 保存処理
  $('#btn-save-transaction').onclick = saveTransaction;
  
  // タブ切り替え（入力画面）
  $$('.type-tab[data-type]').forEach(btn => {
    btn.onclick = () => {
      App.selectedTxType = btn.dataset.type;
      $$('.type-tab[data-type]').forEach(b => b.classList.toggle('active', b === btn));
      $('#group-category').classList.toggle('hidden', App.selectedTxType === 'transfer');
      $('#group-to-account').classList.toggle('hidden', App.selectedTxType !== 'transfer');
      renderCategoryPicker();
    };
  });
}

/* ─── フィルタ用セレクトボックスの同期 ─── */
function renderFilterOptions() {
  const accSelect = $('#filter-account');
  accSelect.innerHTML = '<option value="">すべての口座</option>' + 
    App.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  accSelect.value = App.filter.account;

  const catSelect = $('#filter-category');
  catSelect.innerHTML = '<option value="">すべてのカテゴリー</option>' + 
    App.categories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
  catSelect.value = App.filter.category;
}

/* ─── 描画ロジック ─── */
function renderAll() {
  const { y, m } = parseMonth(App.currentMonth);
  // 全ての月ラベルを更新
  $$('.month-label').forEach(el => el.textContent = `${y}年${m}月`);

  if (App.currentPage === 'dashboard') renderDashboard();
  if (App.currentPage === 'transactions') renderTransactionsList();
}

function renderTransactionsList() {
  // 基本は現在の月で絞り込み
  let list = App.transactions.filter(t => t.date.startsWith(App.currentMonth));

  // フィルタ条件を適用（HTMLのセレクトボックスの状態）
  if (App.filter.type) {
    list = list.filter(t => t.type === App.filter.type);
  }
  if (App.filter.account) {
    list = list.filter(t => t.account_id === App.filter.account || t.to_account_id === App.filter.account);
  }
  if (App.filter.category) {
    list = list.filter(t => t.category_id === App.filter.category);
  }

  const container = $('#all-transactions');
  container.innerHTML = list.length ? 
    list.map(t => renderTxItem(t)).join('') : 
    '<p class="empty-msg" style="text-align:center; padding:20px; color:#999;">条件に合う取引がありません</p>';
}

function renderTxItem(t) {
  const cat = App.categories.find(c => c.id === t.category_id);
  const acc = App.accounts.find(a => a.id === t.account_id);
  return `
    <div class="transaction-item" onclick="openInputPage('${t.id}')">
      <div class="tx-icon">${t.type === 'transfer' ? '🔄' : (cat ? cat.icon : '❓')}</div>
      <div class="tx-info">
        <div class="tx-title">${t.type === 'transfer' ? '資金移動' : (t.memo || (cat ? cat.name : '不明'))}</div>
        <div class="tx-sub">${t.date} · ${acc ? acc.name : '不明'}</div>
      </div>
      <div class="tx-amount ${t.type}">${t.type === 'expense' ? '-' : t.type === 'income' ? '+' : ''}${fmt(t.amount)}</div>
    </div>
  `;
}

/* ─── ダッシュボード描画 ─── */
function renderDashboard() {
  const currentMonthTxs = App.transactions.filter(t => t.date.startsWith(App.currentMonth));
  const income = currentMonthTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = currentMonthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  $('#summary-income').textContent = fmt(income);
  $('#summary-expense').textContent = fmt(expense);
  $('#summary-balance').textContent = fmtSigned(income - expense);

  $('#account-list-dashboard').innerHTML = App.accounts.map(acc => `
    <div class="account-item">
      <div class="account-icon">${ACCOUNT_TYPE_ICONS[acc.account_type] || '💴'}</div>
      <div class="account-info"><div>${acc.name}</div></div>
      <div class="account-balance-text">${fmt(computeAccountBalance(acc))}</div>
    </div>
  `).join('');

  $('#recent-transactions').innerHTML = App.transactions.slice(0, 5).map(t => renderTxItem(t)).join('');
}

/* ─── その他共通ロジック ─── */
function changeMonth(delta) {
  const { y, m } = parseMonth(App.currentMonth);
  const d = new Date(y, m - 1 + delta, 1);
  App.currentMonth = monthKey(d.getFullYear(), d.getMonth() + 1);
  renderAll();
}

function navigateTo(page) {
  $$('.page').forEach(p => p.classList.remove('active'));
  $(`#page-${page}`).classList.add('active');
  App.currentPage = page;
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  renderAll();
}

function computeAccountBalance(acc) {
  let bal = acc.initial_balance || 0;
  App.transactions.forEach(t => {
    if (t.account_id === acc.id) bal += (t.type === 'income' ? t.amount : -t.amount);
    if (t.type === 'transfer' && t.to_account_id === acc.id) bal += t.amount;
  });
  return bal;
}

// (以下、Input画面などの詳細は前回の基本ロジックを継続)
function openInputPage(id = null) {
  const t = App.transactions.find(x => x.id === id);
  App.editingTxId = id;
  $('#input-amount').value = t ? t.amount : '';
  $('#input-date').value = t ? t.date : today();
  $('#input-memo').value = t ? t.memo : '';
  App.selectedTxType = t ? t.type : 'expense';
  App.selectedCategoryId = t ? t.category_id : null;

  const opts = App.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  $('#input-account').innerHTML = opts;
  if ($('#input-to-account')) $('#input-to-account').innerHTML = opts;
  
  if (t) {
    $('#input-account').value = t.account_id;
    if (t.type === 'transfer') $('#input-to-account').value = t.to_account_id;
  }
  
  $$('.type-tab').forEach(b => b.classList.toggle('active', b.dataset.type === App.selectedTxType));
  renderCategoryPicker();
  navigateTo('input');
}

function renderCategoryPicker() {
  const picker = $('#category-picker');
  if (!picker) return;
  const cats = App.categories.filter(c => c.type === App.selectedTxType);
  picker.innerHTML = cats.map(c => `
    <button class="cat-chip ${c.id === App.selectedCategoryId ? 'selected' : ''}" 
            onclick="App.selectedCategoryId='${c.id}'; renderCategoryPicker()">
      <span>${c.icon}</span><span>${c.name}</span>
    </button>
  `).join('');
}

async function saveTransaction() {
  const amount = parseInt($('#input-amount').value);
  if (!amount) return;
  const data = {
    id: App.editingTxId || uuid(),
    type: App.selectedTxType, amount,
    account_id: $('#input-account').value,
    to_account_id: App.selectedTxType === 'transfer' ? $('#input-to-account').value : '',
    category_id: App.selectedCategoryId,
    date: $('#input-date').value, memo: $('#input-memo').value
  };
  App.editingTxId ? await API.update('transactions', App.editingTxId, data) : await API.create('transactions', data);
  await loadAllData();
  navigateTo('dashboard');
}

document.addEventListener('DOMContentLoaded', init);
