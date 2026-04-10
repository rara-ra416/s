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
  editingTxId: null,
  editingAccountId: null,
};

const ACCOUNT_TYPE_ICONS = { cash: '💴', bank: '🏦', credit: '💳', 'e-money': '📱', other: '📦' };

/* ─── 初期化 ─── */
async function init() {
  await loadAllData();
  
  // 初期データの生成
  if (App.categories.length === 0) {
    await API.create('categories', { id: uuid(), name: '食費', type: 'expense', icon: '🍽️', is_active: true });
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
  // 1. 財布チェック
  $('#btn-wallet-check').onclick = () => openWalletCheckModal();
  $('#btn-wallet-check-banner').onclick = () => openWalletCheckModal();
  $('#btn-confirm-wallet-check').onclick = saveWalletCheck;
  $('#wc-actual-amount').oninput = updateWCDiff;
  $('#wc-account').onchange = updateWCDiff;

  // 2. 口座管理
  $('#btn-add-account').onclick = () => openAccountModal();
  $('#btn-save-account').onclick = saveAccount;
  $('#btn-go-accounts').onclick = () => navigateTo('accounts');

  // 3. 取引入力
  $('#btn-save-transaction').onclick = saveTransaction;
  $('#btn-go-transactions').onclick = () => navigateTo('transactions');
  $$('.type-tab').forEach(btn => {
    btn.onclick = () => {
      App.selectedTxType = btn.dataset.type;
      $$('.type-tab').forEach(b => b.classList.toggle('active', b === btn));
      $('#group-to-account')?.classList.toggle('hidden', App.selectedTxType !== 'transfer');
      renderCategoryPicker();
    };
  });

  // 4. 月切り替えナビゲーション（すべてのページに対応）
  const monthNavGroups = [
    { p: '#btn-prev-month', n: '#btn-next-month', label: '#dashboard-month-label' },
    { p: '#btn-prev-month-tx', n: '#btn-next-month-tx', label: '#tx-month-label' },
    { p: '#btn-prev-month-rp', n: '#btn-next-month-rp', label: '#rp-month-label' },
    { p: '#btn-prev-month-tr', n: '#btn-next-month-tr', label: '#tr-month-label' }
  ];

  monthNavGroups.forEach(group => {
    const prevBtn = $(group.p);
    const nextBtn = $(group.n);
    if (prevBtn) prevBtn.onclick = () => changeMonth(-1);
    if (nextBtn) nextBtn.onclick = () => changeMonth(1);
  });

  // 5. モーダル共通
  $$('.modal-close').forEach(btn => {
    btn.onclick = () => closeModal(btn.dataset.modal);
  });

  // 6. バックアップ
  $('#btn-backup').onclick = () => openModal('backup');
  $('#btn-export-backup').onclick = exportData;
}

/* ─── ページ表示・描画 ─── */
function navigateTo(page) {
  $$('.page').forEach(p => p.classList.remove('active'));
  $(`#page-${page}`).classList.add('active');
  App.currentPage = page;
  
  $$('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });

  renderAll();
}

function renderAll() {
  const { y, m } = parseMonth(App.currentMonth);
  const label = `${y}年${m}月`;
  
  // 月ラベルの一斉更新
  $$('.month-label').forEach(el => el.textContent = label);

  if (App.currentPage === 'dashboard') renderDashboard();
  if (App.currentPage === 'accounts') renderAccountsList();
  if (App.currentPage === 'transactions') renderTransactionsList();
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

/* ─── ロジック：口座・財布チェック ─── */
function openWalletCheckModal() {
  const wallets = App.accounts.filter(a => a.is_wallet);
  if (wallets.length === 0) {
    alert('財布チェック対象の口座がありません。「口座管理」で口座を作成し、「財布チェック対象」をONにしてください。');
    return;
  }
  $('#wc-account').innerHTML = wallets.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  $('#wc-actual-amount').value = '';
  updateWCDiff();
  openModal('wallet-check');
}

function updateWCDiff() {
  const acc = App.accounts.find(a => a.id === $('#wc-account').value);
  if (!acc) return;
  const sysBal = computeAccountBalance(acc);
  $('#wc-system-amount').textContent = fmt(sysBal);
  
  const actual = parseInt($('#wc-actual-amount').value) || 0;
  const diff = actual - sysBal;
  $('#wc-diff-value').textContent = fmtSigned(diff);
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
      memo: '財布チェック調整'
    });
  }
  await loadAllData();
  closeModal('wallet-check');
  renderAll();
}

/* ─── 基本機能 ─── */
function changeMonth(delta) {
  const { y, m } = parseMonth(App.currentMonth);
  let d = new Date(y, m - 1 + delta, 1);
  App.currentMonth = monthKey(d.getFullYear(), d.getMonth() + 1);
  renderAll();
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

function setupNavigation() {
  $$('.nav-item').forEach(btn => {
    btn.onclick = () => {
      if (btn.dataset.page === 'input') {
        $('#input-date').value = today();
        updateAccountSelects();
        openInputPage();
      } else {
        navigateTo(btn.dataset.page);
      }
    };
  });
  $$('[data-back]').forEach(btn => btn.onclick = () => navigateTo(btn.dataset.back));
}

function openModal(name) { $(`#modal-${name}`).classList.remove('hidden'); }
function closeModal(name) { $(`#modal-${name}`).classList.add('hidden'); }

function updateAccountSelects() {
  const h = App.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  if ($('#input-account')) $('#input-account').innerHTML = h;
  if ($('#input-to-account')) $('#input-to-account').innerHTML = h;
}

async function saveTransaction() {
  const amount = parseInt($('#input-amount').value) || 0;
  if (!amount) return alert('金額を入力してください');
  await API.create('transactions', {
    id: uuid(),
    type: App.selectedTxType,
    amount,
    account_id: $('#input-account').value,
    to_account_id: App.selectedTxType === 'transfer' ? $('#input-to-account').value : '',
    date: $('#input-date').value || today(),
    memo: $('#input-memo').value
  });
  await loadAllData();
  navigateTo('dashboard');
}

async function saveAccount() {
  const name = $('#account-name').value;
  if (!name) return alert('名前を入力してください');
  const typeBtn = $('.actype-btn.active');
  await API.create('accounts', {
    id: uuid(),
    name,
    account_type: typeBtn ? typeBtn.dataset.type : 'cash',
    initial_balance: parseInt($('#account-balance').value) || 0,
    is_wallet: $('#account-is-wallet').checked,
    is_active: true
  });
  await loadAllData();
  closeModal('account');
  renderAll();
}

function exportData() {
  const d = { tx: API._db('transactions'), acc: API._db('accounts') };
  const blob = new Blob([JSON.stringify(d)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `backup_${today()}.json`;
  a.click();
}

document.addEventListener('DOMContentLoaded', init);
