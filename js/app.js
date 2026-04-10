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
};

const ACCOUNT_TYPE_ICONS = { cash: '💴', bank: '🏦', credit: '💳', 'e-money': '📱', other: '📦' };

/* ─── 初期化 ─── */
async function init() {
  await loadAllData();
  
  // 初期データの補完
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

/* ─── 全イベントリスナー ─── */
function setupEventListeners() {
  // 1. ナビゲーション (フッター & ダッシュボード遷移)
  $$('.nav-item').forEach(btn => {
    btn.onclick = () => btn.dataset.page === 'input' ? openInputPage() : navigateTo(btn.dataset.page);
  });
  $('#btn-go-accounts').onclick = () => navigateTo('accounts');
  $('#btn-go-transactions').onclick = () => navigateTo('transactions');
  $$('.back-btn').forEach(btn => btn.onclick = () => navigateTo(btn.dataset.back || 'dashboard'));

  // 2. モーダル起動 (ヘッダーボタン)
  $('#btn-wallet-check').onclick = () => openWalletCheckModal();
  $('#btn-wallet-check-banner').onclick = () => openWalletCheckModal();
  $('#btn-backup').onclick = () => openModal('backup');

  // 3. モーダルを閉じる (すべての .modal-close に対応)
  $$('.modal-close').forEach(btn => {
    btn.onclick = () => closeModal(btn.dataset.modal);
  });

  // 4. 口座管理
  $('#btn-add-account').onclick = () => openAccountModal();
  $('#btn-save-account').onclick = saveAccount;
  $('#btn-delete-account').onclick = deleteAccount;
  $$('.actype-btn').forEach(btn => {
    btn.onclick = () => {
      $$('.actype-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    };
  });

  // 5. カテゴリー管理
  $('#btn-add-category').onclick = () => openCategoryModal();
  $('#btn-save-category').onclick = saveCategory;
  $('#btn-delete-category').onclick = deleteCategory;
  $$('[data-cattype]').forEach(btn => {
    btn.onclick = () => renderCategoriesList(btn.dataset.cattype);
  });

  // 6. 取引入力 (タブ・保存・削除)
  $$('.type-tab[data-type]').forEach(btn => {
    btn.onclick = () => {
      App.selectedTxType = btn.dataset.type;
      $$('.type-tab[data-type]').forEach(b => b.classList.toggle('active', b === btn));
      // 表示切り替え
      $('#group-category')?.classList.toggle('hidden', App.selectedTxType === 'transfer');
      $('#group-to-account')?.classList.toggle('hidden', App.selectedTxType !== 'transfer');
      renderCategoryPicker();
    };
  });
  $('#btn-save-transaction').onclick = saveTransaction;
  $('#btn-delete-transaction').onclick = deleteTransaction;

  // 7. 財布チェック計算
  $('#btn-confirm-wallet-check').onclick = saveWalletCheck;
  $('#wc-actual-amount').oninput = updateWCDiff;

  // 8. 月次ナビゲーション
  $$('.month-nav-btn').forEach(btn => {
    btn.onclick = () => changeMonth(btn.id.includes('next') ? 1 : -1);
  });
}

/* ─── 描画関数 ─── */
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

function renderAccountsList() {
  $('#accounts-list').innerHTML = App.accounts.map(acc => `
    <div class="account-item" onclick="openAccountModal('${acc.id}')">
      <div class="account-icon">${ACCOUNT_TYPE_ICONS[acc.account_type]}</div>
      <div class="account-info">
        <div class="account-name">${acc.name} ${acc.is_wallet ? '<i class="fa-solid fa-wallet"></i>' : ''}</div>
      </div>
      <div class="account-balance-text">${fmt(computeAccountBalance(acc))}</div>
    </div>
  `).join('');
}

function renderCategoriesList(type) {
  const list = App.categories.filter(c => c.type === type);
  $('#categories-list').innerHTML = list.map(cat => `
    <div class="category-item" onclick="openCategoryModal('${cat.id}')">
      <span class="cat-icon">${cat.icon}</span>
      <span class="cat-name">${cat.name}</span>
    </div>
  `).join('');
  $$('[data-cattype]').forEach(btn => btn.classList.toggle('active', btn.dataset.cattype === type));
}

function renderTransactionsList() {
  const list = App.transactions.filter(t => t.date.startsWith(App.currentMonth));
  $('#all-transactions').innerHTML = list.length ? list.map(t => renderTxItem(t)).join('') : '<p class="empty-msg">取引がありません</p>';
}

/* ─── 入力 & モーダル制御 ─── */
function openInputPage(id = null) {
  const t = App.transactions.find(x => x.id === id);
  App.editingTxId = id;
  $('#input-page-title').textContent = t ? '取引を編集' : '新規入力';
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

  $$('.type-tab[data-type]').forEach(b => b.classList.toggle('active', b.dataset.type === App.selectedTxType));
  $('#group-to-account').classList.toggle('hidden', App.selectedTxType !== 'transfer');
  $('#group-category').classList.toggle('hidden', App.selectedTxType === 'transfer');
  $('#group-delete').classList.toggle('hidden', !t);

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

/* ─── 保存ロジック ─── */
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

// 口座・カテゴリー
function openAccountModal(id = null) {
  const acc = App.accounts.find(a => a.id === id);
  App.editingAccountId = id;
  $('#account-name').value = acc ? acc.name : '';
  $('#account-balance').value = acc ? acc.initial_balance : 0;
  $('#account-is-wallet').checked = acc ? acc.is_wallet : false;
  const type = acc ? acc.account_type : 'cash';
  $$('.actype-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  $('#btn-delete-account').classList.toggle('hidden', !acc);
  openModal('account');
}

async function saveAccount() {
  const data = {
    id: App.editingAccountId || uuid(),
    name: $('#account-name').value,
    account_type: $('.actype-btn.active').dataset.type,
    initial_balance: parseInt($('#account-balance').value) || 0,
    is_wallet: $('#account-is-wallet').checked, is_active: true
  };
  if (App.editingAccountId) await API.update('accounts', App.editingAccountId, data);
  else await API.create('accounts', data);
  await loadAllData();
  closeModal('account');
  renderAll();
}

async function deleteAccount() {
  if (confirm('削除しますか？')) {
    await API.delete('accounts', App.editingAccountId);
    await loadAllData();
    closeModal('account');
    renderAll();
  }
}

// 財布チェック
function openWalletCheckModal() {
  const wallets = App.accounts.filter(a => a.is_wallet);
  if (!wallets.length) return alert('財布口座が設定されていません');
  $('#wc-account').innerHTML = wallets.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  $('#wc-actual-amount').value = '';
  updateWCDiff();
  openModal('wallet-check');
}

function updateWCDiff() {
  const acc = App.accounts.find(a => a.id === $('#wc-account').value);
  const sys = acc ? computeAccountBalance(acc) : 0;
  const actual = parseInt($('#wc-actual-amount').value) || 0;
  $('#wc-system-amount').textContent = fmt(sys);
  $('#wc-diff-value').textContent = fmtSigned(actual - sys);
  $('#wc-diff-display').classList.toggle('hidden', !$('#wc-actual-amount').value);
}

async function saveWalletCheck() {
  const accId = $('#wc-account').value;
  const actual = parseInt($('#wc-actual-amount').value) || 0;
  const sys = computeAccountBalance(App.accounts.find(a => a.id === accId));
  const diff = actual - sys;
  if (diff !== 0) {
    await API.create('transactions', {
      id: uuid(), type: diff > 0 ? 'income' : 'expense', amount: Math.abs(diff),
      account_id: accId, date: today(), memo: '財布チェック調整'
    });
  }
  await loadAllData();
  closeModal('wallet-check');
  renderAll();
}

/* ─── 共通制御 ─── */
function navigateTo(page) {
  $$('.page').forEach(p => p.classList.remove('active'));
  $(`#page-${page}`).classList.add('active');
  App.currentPage = page;
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  renderAll();
}

function openModal(n) { $(`#modal-${n}`).classList.remove('hidden'); }
function closeModal(n) { $(`#modal-${n}`).classList.add('hidden'); }

function computeAccountBalance(acc) {
  let bal = acc.initial_balance || 0;
  App.transactions.forEach(t => {
    if (t.account_id === acc.id) bal += (t.type === 'income' ? t.amount : -t.amount);
    if (t.type === 'transfer' && t.to_account_id === acc.id) bal += t.amount;
  });
  return bal;
}

function changeMonth(delta) {
  const { y, m } = parseMonth(App.currentMonth);
  const d = new Date(y, m - 1 + delta, 1);
  App.currentMonth = monthKey(d.getFullYear(), d.getMonth() + 1);
  renderAll();
}

function openCategoryModal(id = null) {
  const cat = App.categories.find(c => c.id === id);
  App.editingCategoryId = id;
  $('#category-name').value = cat ? cat.name : '';
  $('#category-icon').value = cat ? cat.icon : '📁';
  $('#category-type').value = cat ? cat.type : 'expense';
  $('#btn-delete-category').classList.toggle('hidden', !cat);
  openModal('category');
}

async function saveCategory() {
  const data = {
    id: App.editingCategoryId || uuid(),
    name: $('#category-name').value, icon: $('#category-icon').value,
    type: $('#category-type').value, is_active: true
  };
  if (App.editingCategoryId) await API.update('categories', App.editingCategoryId, data);
  else await API.create('categories', data);
  await loadAllData();
  closeModal('category');
  renderAll();
}

async function deleteCategory() {
  if (confirm('削除しますか？')) {
    await API.delete('categories', App.editingCategoryId);
    await loadAllData();
    closeModal('category');
    renderAll();
  }
}

document.addEventListener('DOMContentLoaded', init);
