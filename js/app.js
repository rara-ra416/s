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
  editingAccountId: null,
  editingCategoryId: null,
  // フィルタ状態
  filter: {
    type: 'all', // all, income, expense, transfer
    keyword: ''
  }
};

const ACCOUNT_TYPE_ICONS = { cash: '💴', bank: '🏦', credit: '💳', 'e-money': '📱', other: '📦' };

/* ─── 初期化 ─── */
async function init() {
  await loadAllData();
  
  if (App.categories.length === 0) {
    const defaultCats = [
      { id: uuid(), name: '食費', type: 'expense', icon: '🍽️', is_active: true },
      { id: uuid(), name: '給与', type: 'income', icon: '💰', is_active: true }
    ];
    for (const c of defaultCats) await API.create('categories', c);
  }
  if (App.accounts.length === 0) {
    await API.create('accounts', { id: uuid(), name: '財布', account_type: 'cash', initial_balance: 0, is_active: true, is_wallet: true });
  }
  
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

/* ─── イベントリスナー ─── */
function setupEventListeners() {
  // ナビゲーション
  $$('.nav-item').forEach(btn => {
    btn.onclick = () => btn.dataset.page === 'input' ? openInputPage() : navigateTo(btn.dataset.page);
  });
  $('#btn-go-accounts').onclick = () => navigateTo('accounts');
  $('#btn-go-transactions').onclick = () => navigateTo('transactions');
  $$('.back-btn').forEach(btn => btn.onclick = () => navigateTo(btn.dataset.back || 'dashboard'));

  // モーダル
  $('#btn-wallet-check').onclick = () => openWalletCheckModal();
  $('#btn-wallet-check-banner').onclick = () => openWalletCheckModal();
  $('#btn-backup').onclick = () => openModal('backup');
  
  // フィルタ機能の実装
  const btnFilter = $('#btn-filter-transactions');
  if (btnFilter) {
    btnFilter.onclick = () => {
      const kw = prompt('検索キーワードを入力（メモ・カテゴリー名）', App.filter.keyword);
      if (kw !== null) {
        App.filter.keyword = kw;
        renderTransactionsList();
      }
    };
  }

  $$('.modal-close').forEach(btn => {
    btn.onclick = () => closeModal(btn.dataset.modal);
  });

  // 口座・カテゴリー保存
  $('#btn-save-account').onclick = saveAccount;
  $('#btn-delete-account').onclick = deleteAccount;
  $('#btn-add-account').onclick = () => openAccountModal();
  
  $('#btn-save-category').onclick = saveCategory;
  $('#btn-delete-category').onclick = deleteCategory;
  $('#btn-add-category').onclick = () => openCategoryModal();

  // 取引入力
  $$('.type-tab[data-type]').forEach(btn => {
    btn.onclick = () => {
      App.selectedTxType = btn.dataset.type;
      $$('.type-tab[data-type]').forEach(b => b.classList.toggle('active', b === btn));
      $('#group-category')?.classList.toggle('hidden', App.selectedTxType === 'transfer');
      $('#group-to-account')?.classList.toggle('hidden', App.selectedTxType !== 'transfer');
      renderCategoryPicker();
    };
  });
  $('#btn-save-transaction').onclick = saveTransaction;
  $('#btn-delete-transaction').onclick = deleteTransaction;

  // その他
  $('#btn-confirm-wallet-check').onclick = saveWalletCheck;
  $('#wc-actual-amount').oninput = updateWCDiff;
  $$('.month-nav-btn').forEach(btn => {
    btn.onclick = () => changeMonth(btn.id.includes('next') ? 1 : -1);
  });
}

/* ─── 描画 ─── */
function renderAll() {
  const { y, m } = parseMonth(App.currentMonth);
  $$('.month-label').forEach(el => el.textContent = `${y}年${m}月`);

  if (App.currentPage === 'dashboard') renderDashboard();
  if (App.currentPage === 'accounts') renderAccountsList();
  if (App.currentPage === 'transactions') renderTransactionsList();
  if (App.currentPage === 'categories') renderCategoriesList('expense');
}

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

function renderTransactionsList() {
  let list = App.transactions.filter(t => t.date.startsWith(App.currentMonth));
  
  // フィルタ適用
  if (App.filter.keyword) {
    const kw = App.filter.keyword.toLowerCase();
    list = list.filter(t => {
      const cat = App.categories.find(c => c.id === t.category_id);
      return (t.memo && t.memo.toLowerCase().includes(kw)) || 
             (cat && cat.name.toLowerCase().includes(kw));
    });
  }

  const container = $('#all-transactions');
  if (container) {
    container.innerHTML = list.length ? list.map(t => renderTxItem(t)).join('') : '<p class="empty-msg">条件に合う取引がありません</p>';
  }
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

/* ─── 以下、既存ロジックの維持 ─── */
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
  renderCategoryPicker();
  navigateTo('input');
}

function renderCategoryPicker() {
  const cats = App.categories.filter(c => c.type === App.selectedTxType);
  $('#category-picker').innerHTML = cats.map(c => `
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
    type: App.selectedTxType, amount,
    account_id: $('#input-account').value,
    to_account_id: App.selectedTxType === 'transfer' ? $('#input-to-account').value : '',
    category_id: App.selectedCategoryId,
    date: $('#input-date').value, memo: $('#input-memo').value
  };
  if (App.editingTxId) await API.update('transactions', App.editingTxId, data);
  else await API.create('transactions', data);
  await loadAllData();
  navigateTo('dashboard');
}

async function deleteTransaction() {
  if (confirm('削除しますか？')) {
    await API.delete('transactions', App.editingTxId);
    await loadAllData();
    navigateTo('dashboard');
  }
}

function computeAccountBalance(acc) {
  let bal = acc.initial_balance || 0;
  App.transactions.forEach(t => {
    if (t.account_id === acc.id) bal += (t.type === 'income' ? t.amount : -t.amount);
    if (t.type === 'transfer' && t.to_account_id === acc.id) bal += t.amount;
  });
  return bal;
}

function navigateTo(page) {
  $$('.page').forEach(p => p.classList.remove('active'));
  $(`#page-${page}`).classList.add('active');
  App.currentPage = page;
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  renderAll();
}

function openModal(n) { const m = $(`#modal-${n}`); if(m) m.classList.remove('hidden'); }
function closeModal(n) { const m = $(`#modal-${n}`); if(m) m.classList.add('hidden'); }

/* (その他の関数: saveAccount, openAccountModal, saveWalletCheckなどは前回同様) */
function openAccountModal(id = null) {
  const acc = App.accounts.find(a => a.id === id);
  App.editingAccountId = id;
  $('#account-name').value = acc ? acc.name : '';
  $('#account-balance').value = acc ? acc.initial_balance : 0;
  $('#account-is-wallet').checked = acc ? acc.is_wallet : false;
  openModal('account');
}
async function saveAccount() {
  const data = { id: App.editingAccountId || uuid(), name: $('#account-name').value, account_type: 'cash', initial_balance: parseInt($('#account-balance').value)||0, is_wallet: $('#account-is-wallet').checked, is_active: true };
  if (App.editingAccountId) await API.update('accounts', App.editingAccountId, data);
  else await API.create('accounts', data);
  await loadAllData(); closeModal('account'); renderAll();
}
async function deleteAccount() { if(confirm('削除？')) { await API.delete('accounts', App.editingAccountId); await loadAllData(); closeModal('account'); renderAll(); } }

function openWalletCheckModal() {
  const wallets = App.accounts.filter(a => a.is_wallet);
  if (!wallets.length) return alert('財布口座なし');
  $('#wc-account').innerHTML = wallets.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  updateWCDiff();
  openModal('wallet-check');
}
function updateWCDiff() {
  const acc = App.accounts.find(a => a.id === $('#wc-account').value);
  const sys = acc ? computeAccountBalance(acc) : 0;
  const actual = parseInt($('#wc-actual-amount').value) || 0;
  $('#wc-system-amount').textContent = fmt(sys);
  $('#wc-diff-value').textContent = fmtSigned(actual - sys);
}
async function saveWalletCheck() {
  const accId = $('#wc-account').value;
  const sys = computeAccountBalance(App.accounts.find(a => a.id === accId));
  const diff = (parseInt($('#wc-actual-amount').value)||0) - sys;
  if(diff !== 0) await API.create('transactions', { id: uuid(), type: diff>0?'income':'expense', amount: Math.abs(diff), account_id: accId, date: today(), memo: '財布チェック調整' });
  await loadAllData(); closeModal('wallet-check'); renderAll();
}

function changeMonth(delta) {
  const { y, m } = parseMonth(App.currentMonth);
  const d = new Date(y, m - 1 + delta, 1);
  App.currentMonth = monthKey(d.getFullYear(), d.getMonth() + 1);
  renderAll();
}

function renderAccountsList() {
  $('#accounts-list').innerHTML = App.accounts.map(acc => `<div class="account-item" onclick="openAccountModal('${acc.id}')"><div class="account-info">${acc.name}</div><div class="account-balance-text">${fmt(computeAccountBalance(acc))}</div></div>`).join('');
}

function renderCategoriesList(type) {
  $('#categories-list').innerHTML = App.categories.filter(c => c.type === type).map(c => `<div class="category-item" onclick="openCategoryModal('${c.id}')">${c.icon} ${c.name}</div>`).join('');
}

function openCategoryModal(id = null) {
  const cat = App.categories.find(c => c.id === id);
  App.editingCategoryId = id;
  $('#category-name').value = cat ? cat.name : '';
  openModal('category');
}
async function saveCategory() {
  const data = { id: App.editingCategoryId || uuid(), name: $('#category-name').value, icon: '📁', type: 'expense', is_active: true };
  if (App.editingCategoryId) await API.update('categories', App.editingCategoryId, data);
  else await API.create('categories', data);
  await loadAllData(); closeModal('category'); renderAll();
}
async function deleteCategory() { if(confirm('削除？')) { await API.delete('categories', App.editingCategoryId); await loadAllData(); closeModal('category'); renderAll(); } }

document.addEventListener('DOMContentLoaded', init);
