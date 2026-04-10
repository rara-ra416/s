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
};

const ACCOUNT_TYPE_ICONS = { cash: '💴', bank: '🏦', credit: '💳', 'e-money': '📱', other: '📦' };

/* ─── 初期化 ─── */
async function init() {
  await loadAllData();
  
  // 初期データの補填
  if (App.categories.length === 0) {
    await API.create('categories', { id: uuid(), name: '食費', type: 'expense', icon: '🍽️', is_active: true });
    await API.create('categories', { id: uuid(), name: '給与', type: 'income', icon: '💰', is_active: true });
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
  App.accounts = acc.filter(a => a.is_active);
  App.categories = cat.filter(c => c.is_active);
  App.transactions = tx.sort((a,b) => b.date.localeCompare(a.date));
}

/* ─── 全イベントの紐付け ─── */
function setupEventListeners() {
  // 1. 取引入力の起動 (中央の＋ボタン)
  $('.nav-add').onclick = () => openInputPage();

  // 2. 取引フィルタ
  $('#btn-filter-transactions').onclick = () => alert('フィルタ機能を準備中です');

  // 3. 口座の追加
  $('#btn-add-account').onclick = () => openAccountModal();
  $('#btn-save-account').onclick = saveAccount;

  // 4. 財布チェック
  $('#btn-wallet-check').onclick = () => openWalletCheckModal();
  $('#btn-wallet-check-banner').onclick = () => openWalletCheckModal();
  $('#btn-confirm-wallet-check').onclick = saveWalletCheck;
  $('#wc-actual-amount').oninput = updateWCDiff;

  // 5. 保存・削除ボタン
  $('#btn-save-transaction').onclick = saveTransaction;
  
  // 6. 入力画面のタブ切り替え
  $$('.type-tab').forEach(btn => {
    btn.onclick = () => {
      App.selectedTxType = btn.dataset.type;
      $$('.type-tab').forEach(b => b.classList.toggle('active', b === btn));
      $('#group-to-account')?.classList.toggle('hidden', App.selectedTxType !== 'transfer');
      renderCategoryPicker();
    };
  });

  // 7. 月ナビゲーション
  $$('.month-nav-btn').forEach(btn => {
    btn.onclick = () => changeMonth(btn.id.includes('next') ? 1 : -1);
  });

  // 8. モーダルを閉じる
  $$('.modal-close').forEach(btn => {
    btn.onclick = () => closeModal(btn.dataset.modal);
  });

  // 9. バックアップ
  $('#btn-backup').onclick = () => openModal('backup');
  $('#btn-export-backup').onclick = exportData;
}

/* ─── 画面遷移・描画 ─── */
function navigateTo(page) {
  $$('.page').forEach(p => p.classList.remove('active'));
  const target = $(`#page-${page}`);
  if (target) {
    target.classList.add('active');
    App.currentPage = page;
  }
  $$('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.page === page));
  renderAll();
}

function renderAll() {
  const { y, m } = parseMonth(App.currentMonth);
  $$('.month-label').forEach(el => el.textContent = `${y}年${m}月`);

  if (App.currentPage === 'dashboard') renderDashboard();
  if (App.currentPage === 'accounts') renderAccountsList();
  if (App.currentPage === 'transactions') renderTransactionsList();
}

/* ─── 取引入力ロジック ─── */
function openInputPage() {
  App.editingTxId = null;
  $('#input-amount').value = '';
  $('#input-date').value = today();
  $('#input-memo').value = '';
  
  // 口座セレクトボックスの更新
  const options = App.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  $('#input-account').innerHTML = options;
  if ($('#input-to-account')) $('#input-to-account').innerHTML = options;

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
    id: uuid(),
    type: App.selectedTxType,
    amount,
    account_id: $('#input-account').value,
    to_account_id: App.selectedTxType === 'transfer' ? $('#input-to-account').value : '',
    category_id: App.selectedCategoryId,
    date: $('#input-date').value,
    memo: $('#input-memo').value
  });

  await loadAllData();
  navigateTo('dashboard');
}

/* ─── 口座管理ロジック ─── */
function openAccountModal() {
  App.editingAccountId = null;
  $('#account-name').value = '';
  $('#account-balance').value = 0;
  $('#account-is-wallet').checked = false;
  openModal('account');
}

async function saveAccount() {
  const name = $('#account-name').value;
  if (!name) return alert('口座名を入力してください');

  await API.create('accounts', {
    id: uuid(),
    name,
    account_type: $('.actype-btn.active')?.dataset.type || 'cash',
    initial_balance: parseInt($('#account-balance').value) || 0,
    is_wallet: $('#account-is-wallet').checked,
    is_active: true
  });

  await loadAllData();
  closeModal('account');
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
  // 差額調整ロジック (省略)
  closeModal('wallet-check');
  await loadAllData();
  renderAll();
}

/* ─── その他共通機能 ─── */
function computeAccountBalance(acc) {
  let bal = acc.initial_balance || 0;
  App.transactions.forEach(t => {
    if (t.account_id === acc.id) bal += (t.type === 'income' ? t.amount : -t.amount);
    if (t.type === 'transfer' && t.to_account_id === acc.id) bal += t.amount;
  });
  return bal;
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
      <div class="account-icon">${ACCOUNT_TYPE_ICONS[acc.account_type]}</div>
      <div class="account-info"><div>${acc.name}</div></div>
      <div class="account-balance-text">${fmt(computeAccountBalance(acc))}</div>
    </div>
  `).join('');
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

function exportData() {
  const d = { tx: API._db('transactions'), acc: API._db('accounts') };
  const blob = new Blob([JSON.stringify(d)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `backup_${today()}.json`;
  a.click();
}

document.addEventListener('DOMContentLoaded', init);
