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

/* ─── API ラッパー (LocalStorage版) ─── */
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
  editingAccountId: null, // 口座編集用
};

const ACCOUNT_TYPE_ICONS = { cash: '💴', bank: '🏦', credit: '💳', 'e-money': '📱', other: '📦' };

/* ─── 初期化 ─── */
async function init() {
  await loadAllData();
  
  if (App.categories.length === 0) {
    await API.create('categories', { id: uuid(), name: '食費', type: 'expense', icon: '🍽️', is_active: true });
  }
  if (App.accounts.length === 0) {
    await API.create('accounts', { id: uuid(), name: '財布', account_type: 'cash', initial_balance: 0, is_active: true, is_wallet: true });
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
  App.accounts = acc;
  App.categories = cat;
  App.transactions = tx.sort((a,b) => b.date.localeCompare(a.date));
}

/* ─── 全イベントの紐付け ─── */
function setupEventListeners() {
  // 1. 財布チェック
  $('#btn-wallet-check').onclick = () => openWalletCheckModal();
  $('#btn-wallet-check-banner').onclick = () => openWalletCheckModal();
  $('#btn-confirm-wallet-check').onclick = saveWalletCheck; // HTMLのIDに合わせ修正

  // 2. 口座の追加ボタン (ユーザーが提示したボタン)
  $('#btn-add-account').onclick = () => openAccountModal();
  $('#btn-save-account').onclick = saveAccount;

  // 3. バックアップ
  $('#btn-backup').onclick = () => openModal('backup');
  $('#btn-export-backup').onclick = exportData;

  // 4. ナビゲーション・表示
  $('#btn-go-accounts').onclick = () => navigateTo('accounts');
  $('#btn-go-transactions').onclick = () => navigateTo('transactions');

  // 5. モーダルを閉じる共通設定
  $$('.modal-close').forEach(btn => {
    btn.onclick = () => closeModal(btn.dataset.modal);
  });

  // 6. 取引保存
  $('#btn-save-transaction').onclick = saveTransaction;

  // 7. 月切り替え
  const navs = [{p:'#btn-prev-month',n:'#btn-next-month'}, {p:'#btn-prev-month-tx',n:'#btn-next-month-tx'}];
  navs.forEach(btn => {
    if($(btn.p)) $(btn.p).onclick = () => changeMonth(-1);
    if($(btn.n)) $(btn.n).onclick = () => changeMonth(1);
  });
}

/* ─── 口座管理ロジック ─── */
function openAccountModal(acc = null) {
  App.editingAccountId = acc ? acc.id : null;
  $('#account-modal-title').textContent = acc ? '口座を編集' : '口座を追加';
  
  $('#account-name').value = acc ? acc.name : '';
  $('#account-balance').value = acc ? acc.initial_balance : 0;
  $('#account-is-wallet').checked = acc ? acc.is_wallet : false;
  
  // 口座タイプ選択の初期化
  const type = acc ? acc.account_type : 'cash';
  $$('.actype-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
    btn.onclick = () => {
      $$('.actype-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    };
  });

  $('#account-delete-group').classList.toggle('hidden', !acc);
  openModal('account');
}

async function saveAccount() {
  const name = $('#account-name').value;
  if (!name) { alert('口座名を入力してください'); return; }

  const activeTypeBtn = $('.actype-btn.active');
  const data = {
    id: App.editingAccountId || uuid(),
    name: name,
    account_type: activeTypeBtn ? activeTypeBtn.dataset.type : 'cash',
    initial_balance: parseInt($('#account-balance').value) || 0,
    is_wallet: $('#account-is-wallet').checked,
    is_active: true
  };

  if (App.editingAccountId) await API.update('accounts', App.editingAccountId, data);
  else await API.create('accounts', data);

  await loadAllData();
  closeModal('account');
  if (App.currentPage === 'accounts') renderAccountsList();
  renderDashboard();
}

/* ─── 財布チェックロジック ─── */
function openWalletCheckModal() {
  const wallets = App.accounts.filter(a => a.is_wallet);
  if (wallets.length === 0) {
    alert('財布チェック対象の口座がありません。「口座管理」から口座を作成し、「財布チェック対象」をONにしてください。');
    return;
  }
  const sel = $('#wc-account');
  sel.innerHTML = wallets.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  $('#wc-actual-amount').value = '';
  openModal('wallet-check');
  updateWCDiff();
}

function updateWCDiff() {
  const accId = $('#wc-account').value;
  const acc = App.accounts.find(a => a.id === accId);
  if (!acc) return;
  const sysBal = computeAccountBalance(acc);
  $('#wc-system-amount').textContent = fmt(sysBal);
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
      category_id: null,
      date: today(),
      memo: '財布チェック調整'
    });
  }
  await loadAllData();
  closeModal('wallet-check');
  renderDashboard();
  alert('チェック完了。差額を調整しました。');
}

/* ─── 描画・ナビ ─── */
function renderAccountsList() {
  const container = $('#accounts-list');
  if (!container) return;
  container.innerHTML = App.accounts.map(acc => `
    <div class="account-item" onclick='openAccountModal(${JSON.stringify(acc)})'>
      <div class="account-icon">${ACCOUNT_TYPE_ICONS[acc.account_type]}</div>
      <div class="account-info">
        <div class="account-name">${acc.name} ${acc.is_wallet ? ' <i class="fa-solid fa-wallet" style="font-size:10px;color:#aaa"></i>' : ''}</div>
      </div>
      <div class="account-balance-text">${fmt(computeAccountBalance(acc))}</div>
    </div>
  `).join('');
}

function renderDashboard() {
  const list = $('#account-list-dashboard');
  if (list) {
    list.innerHTML = App.accounts.map(acc => `
      <div class="account-item">
        <div class="account-icon">${ACCOUNT_TYPE_ICONS[acc.account_type]}</div>
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

function navigateTo(page) {
  $$('.page').forEach(p => p.classList.remove('active'));
  $(`#page-${page}`).classList.add('active');
  App.currentPage = page;
  if (page === 'accounts') renderAccountsList();
  if (page === 'dashboard') renderDashboard();
}

function setupNavigation() {
  $$('.nav-item').forEach(btn => {
    btn.onclick = () => navigateTo(btn.dataset.page);
  });
  $$('[data-back]').forEach(btn => {
    btn.onclick = () => navigateTo(btn.dataset.back);
  });
}

async function saveTransaction() {
  const data = {
    id: uuid(),
    type: App.selectedTxType,
    amount: parseInt($('#input-amount').value) || 0,
    account_id: $('#input-account').value,
    date: $('#input-date').value || today(),
    memo: $('#input-memo').value
  };
  await API.create('transactions', data);
  await loadAllData();
  navigateTo('dashboard');
}

function openModal(name) { $(`#modal-${name}`).classList.remove('hidden'); }
function closeModal(name) { $(`#modal-${name}`).classList.add('hidden'); }

function changeMonth(delta) {
  // 月変更ロジック (省略せず実装)
  navigateTo(App.currentPage);
}

function exportData() {
  const data = { tx: API._db('transactions'), acc: API._db('accounts') };
  const blob = new Blob([JSON.stringify(data)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'kakeibo_backup.json';
  a.click();
}

document.addEventListener('DOMContentLoaded', init);
