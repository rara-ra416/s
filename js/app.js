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

/* ─── API ラッパー (LocalStorage) ─── */
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
  
  // 初期データの補填
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

/* ─── 全イベントの紐付け ─── */
function setupEventListeners() {
  // 1. ナビゲーション関連
  $('.nav-add').onclick = () => openInputPage();
  $('#btn-go-accounts').onclick = () => navigateTo('accounts');
  $('#btn-go-transactions').onclick = () => navigateTo('transactions');
  
  // 2. 財布チェック
  const openWC = () => openWalletCheckModal();
  $('#btn-wallet-check').onclick = openWC;
  $('#btn-wallet-check-banner').onclick = openWC;
  $('#btn-confirm-wallet-check').onclick = saveWalletCheck;
  $('#wc-actual-amount').oninput = updateWCDiff;

  // 3. 口座の追加・保存・削除
  $('#btn-add-account').onclick = () => openAccountModal();
  $('#btn-save-account').onclick = saveAccount;
  $('#btn-delete-account').onclick = deleteAccount;

  // 4. カテゴリーの追加・保存・削除
  $('#btn-add-category').onclick = () => openCategoryModal();
  $('#btn-save-category').onclick = saveCategory;
  $('#btn-delete-category').onclick = deleteCategory;

  // 5. 取引保存
  $('#btn-save-transaction').onclick = saveTransaction;
  
  // 6. 入力画面のタブ切り替え
  $$('.type-tab').forEach(btn => {
    btn.onclick = () => {
      App.selectedTxType = btn.dataset.type;
      $$('.type-tab').forEach(b => b.classList.toggle('active', b === btn));
      $('#group-to-account')?.classList.toggle('hidden', App.selectedTxType !== 'transfer');
      $('#group-category')?.classList.toggle('hidden', App.selectedTxType === 'transfer');
      // 指示通り「移動記録(group-travel)」は無視（または非表示）
      $('#group-travel')?.classList.add('hidden');
      renderCategoryPicker();
    };
  });

  // 7. 月切り替えナビ
  $$('.month-nav-btn').forEach(btn => {
    btn.onclick = () => changeMonth(btn.id.includes('next') ? 1 : -1);
  });

  // 8. モーダルを閉じる
  $$('.modal-close').forEach(btn => {
    btn.onclick = () => closeModal(btn.dataset.modal);
  });
}

/* ─── 描画処理 ─── */
function renderAll() {
  const { y, m } = parseMonth(App.currentMonth);
  $$('.month-label').forEach(el => el.textContent = `${y}年${m}月`);

  if (App.currentPage === 'dashboard') renderDashboard();
  if (App.currentPage === 'accounts') renderAccountsList();
  if (App.currentPage === 'transactions') renderTransactionsList();
  if (App.currentPage === 'settings') renderCategoriesList();
}

function renderDashboard() {
  const txs = App.transactions.filter(t => t.date.startsWith(App.currentMonth));
  const inc = txs.filter(t => t.type === 'income').reduce((s,t) => s + t.amount, 0);
  const exp = txs.filter(t => t.type === 'expense').reduce((s,t) => s + t.amount, 0);

  $('#summary-income').textContent = fmt(inc);
  $('#summary-expense').textContent = fmt(exp);
  $('#summary-balance').textContent = fmtSigned(inc - exp);

  $('#account-list-dashboard').innerHTML = App.accounts.map(acc => `
    <div class="account-item">
      <div class="account-icon">${ACCOUNT_TYPE_ICONS[acc.account_type] || '💴'}</div>
      <div class="account-info"><div>${acc.name}</div></div>
      <div class="account-balance-text">${fmt(computeAccountBalance(acc))}</div>
    </div>
  `).join('');
}

/* ─── 口座編集ロジック ─── */
function renderAccountsList() {
  const list = $('#accounts-list');
  if (!list) return;
  list.innerHTML = App.accounts.map(acc => `
    <div class="account-item" onclick="openAccountModal('${acc.id}')">
      <div class="account-icon">${ACCOUNT_TYPE_ICONS[acc.account_type]}</div>
      <div class="account-info">
        <div class="account-name">${acc.name} ${acc.is_wallet ? '<i class="fa-solid fa-wallet"></i>' : ''}</div>
      </div>
      <div class="account-balance-text">${fmt(computeAccountBalance(acc))}</div>
    </div>
  `).join('');
}

function openAccountModal(id = null) {
  const acc = App.accounts.find(a => a.id === id);
  App.editingAccountId = id;
  $('#account-modal-title').textContent = acc ? '口座を編集' : '口座を追加';
  $('#account-name').value = acc ? acc.name : '';
  $('#account-balance').value = acc ? acc.initial_balance : 0;
  $('#account-is-wallet').checked = acc ? acc.is_wallet : false;
  
  const type = acc ? acc.account_type : 'cash';
  $$('.actype-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
    btn.onclick = () => {
      $$('.actype-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    };
  });

  $('#btn-delete-account').classList.toggle('hidden', !acc);
  openModal('account');
}

async function saveAccount() {
  const name = $('#account-name').value;
  if (!name) return alert('口座名を入力してください');
  const data = {
    id: App.editingAccountId || uuid(),
    name,
    account_type: $('.actype-btn.active')?.dataset.type || 'cash',
    initial_balance: parseInt($('#account-balance').value) || 0,
    is_wallet: $('#account-is-wallet').checked,
    is_active: true
  };
  if (App.editingAccountId) await API.update('accounts', App.editingAccountId, data);
  else await API.create('accounts', data);
  await loadAllData();
  closeModal('account');
  renderAll();
}

async function deleteAccount() {
  if (!confirm('この口座を削除しますか？（取引データは残ります）')) return;
  await API.delete('accounts', App.editingAccountId);
  await loadAllData();
  closeModal('account');
  renderAll();
}

/* ─── カテゴリー編集ロジック ─── */
function renderCategoriesList() {
  const list = $('#settings-category-list');
  if (!list) return;
  list.innerHTML = App.categories.map(cat => `
    <div class="category-item" onclick="openCategoryModal('${cat.id}')">
      <span class="cat-icon">${cat.icon}</span>
      <span class="cat-name">${cat.name} (${cat.type === 'expense' ? '支出' : '収入'})</span>
    </div>
  `).join('');
}

function openCategoryModal(id = null) {
  const cat = App.categories.find(c => c.id === id);
  App.editingCategoryId = id;
  $('#category-modal-title').textContent = cat ? 'カテゴリーを編集' : 'カテゴリーを追加';
  $('#category-name').value = cat ? cat.name : '';
  $('#category-icon').value = cat ? cat.icon : '📁';
  $('#category-type').value = cat ? cat.type : 'expense';
  
  $('#btn-delete-category').classList.toggle('hidden', !cat);
  openModal('category');
}

async function saveCategory() {
  const name = $('#category-name').value;
  if (!name) return alert('名前を入力してください');
  const data = {
    id: App.editingCategoryId || uuid(),
    name,
    icon: $('#category-icon').value || '📁',
    type: $('#category-type').value,
    is_active: true
  };
  if (App.editingCategoryId) await API.update('categories', App.editingCategoryId, data);
  else await API.create('categories', data);
  await loadAllData();
  closeModal('category');
  renderAll();
}

async function deleteCategory() {
  if (!confirm('このカテゴリーを削除しますか？')) return;
  await API.delete('categories', App.editingCategoryId);
  await loadAllData();
  closeModal('category');
  renderAll();
}

/* ─── 財布チェック ─── */
function openWalletCheckModal() {
  const wallets = App.accounts.filter(a => a.is_wallet);
  if (wallets.length === 0) return alert('チェック対象の口座がありません');
  $('#wc-account').innerHTML = wallets.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  $('#wc-actual-amount').value = '';
  updateWCDiff();
  openModal('wallet-check');
}

function updateWCDiff() {
  const acc = App.accounts.find(a => a.id === $('#wc-account').value);
  const sysBal = acc ? computeAccountBalance(acc) : 0;
  $('#wc-system-amount').textContent = fmt(sysBal);
  const actual = parseInt($('#wc-actual-amount').value) || 0;
  $('#wc-diff-value').textContent = fmtSigned(actual - sysBal);
  $('#wc-diff-display').classList.toggle('hidden', $('#wc-actual-amount').value === '');
}

async function saveWalletCheck() {
  const accId = $('#wc-account').value;
  const actual = parseInt($('#wc-actual-amount').value) || 0;
  const sysBal = computeAccountBalance(App.accounts.find(a => a.id === accId));
  const diff = actual - sysBal;
  if (diff !== 0) {
    await API.create('transactions', {
      id: uuid(),
      type: diff > 0 ? 'income' : 'expense',
      amount: Math.abs(diff),
      account_id: accId,
      date: today(),
      memo: '財布チェック調整: ' + ($('#wc-memo').value || '')
    });
  }
  await loadAllData();
  closeModal('wallet-check');
  renderAll();
}

/* ─── その他共通 ─── */
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
  const target = $(`#page-${page}`);
  if (target) { target.classList.add('active'); App.currentPage = page; }
  $$('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.page === page));
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

function openInputPage() {
  App.editingTxId = null;
  $('#input-amount').value = '';
  $('#input-date').value = today();
  $('#input-memo').value = '';
  const opts = App.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  $('#input-account').innerHTML = opts;
  if ($('#input-to-account')) $('#input-to-account').innerHTML = opts;
  // 移動記録は消す
  $('#group-travel')?.classList.add('hidden');
  renderCategoryPicker();
  navigateTo('input');
}

function renderCategoryPicker() {
  const container = $('#category-picker');
  if (!container) return;
  const cats = App.categories.filter(c => c.type === App.selectedTxType || c.type === 'both');
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
  await API.create('transactions', {
    id: uuid(), type: App.selectedTxType, amount,
    account_id: $('#input-account').value,
    to_account_id: App.selectedTxType === 'transfer' ? $('#input-to-account').value : '',
    category_id: App.selectedCategoryId,
    date: $('#input-date').value, memo: $('#input-memo').value
  });
  await loadAllData();
  navigateTo('dashboard');
}

function changeMonth(delta) {
  const { y, m } = parseMonth(App.currentMonth);
  const d = new Date(y, m - 1 + delta, 1);
  App.currentMonth = monthKey(d.getFullYear(), d.getMonth() + 1);
  renderAll();
}

function openModal(n) { $(`#modal-${n}`).classList.remove('hidden'); }
function closeModal(n) { $(`#modal-${n}`).classList.add('hidden'); }

document.addEventListener('DOMContentLoaded', init);
