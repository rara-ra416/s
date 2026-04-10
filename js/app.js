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

/* ─── API ラッパー (LocalStorage版：GitHub Pages対応) ─── */
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
  App.accounts = acc.filter(a => a.is_active);
  App.categories = cat.filter(c => c.is_active);
  App.transactions = tx.sort((a,b) => b.date.localeCompare(a.date));
}

/* ─── 全イベントの紐付け ─── */
function setupEventListeners() {
  // 1. 財布チェック（モーダルを開く）
  $('#btn-wallet-check').onclick = () => openWalletCheckModal();
  $('#btn-wallet-check-banner').onclick = () => openWalletCheckModal();
  
  // 2. バックアップ（モーダルを開く）
  $('#btn-backup').onclick = () => openModal('backup');
  $('#btn-export-backup').onclick = exportData;

  // 3. ダッシュボード内リンク
  $('#btn-go-accounts').onclick = () => navigateTo('accounts');
  $('#btn-go-transactions').onclick = () => navigateTo('transactions');

  // 4. 入力タブ切り替え
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

  // 5. 保存・削除
  $('#btn-save-transaction').onclick = saveTransaction;
  $('#btn-delete-transaction')?.addEventListener('click', deleteTransaction);

  // 6. 月切り替えナビ
  const navs = [
    { p: '#btn-prev-month', n: '#btn-next-month' },
    { p: '#btn-prev-month-tx', n: '#btn-next-month-tx' },
    { p: '#btn-prev-month-rp', n: '#btn-next-month-rp' },
    { p: '#btn-prev-month-tr', n: '#btn-next-month-tr' }
  ];
  navs.forEach(btn => {
    if ($(btn.p)) $(btn.p).onclick = () => changeMonth(-1);
    if ($(btn.n)) $(btn.n).onclick = () => changeMonth(1);
  });

  // 7. モーダルを閉じるボタン共通
  $$('.modal-close').forEach(btn => {
    btn.onclick = () => closeModal(btn.dataset.modal);
  });
  
  // 8. 財布チェックの入力連動
  $('#wc-actual-amount')?.addEventListener('input', updateWCDiff);
  $('#wc-account')?.addEventListener('change', updateWCDiff);
  $('#btn-save-wallet-check')?.addEventListener('click', saveWalletCheck);
}

/* ─── 財布チェックモーダル処理 ─── */
function openWalletCheckModal() {
  const wallets = App.accounts.filter(a => a.is_wallet);
  if (wallets.length === 0) { alert('財布チェック対象の口座がありません'); return; }
  
  const sel = $('#wc-account');
  sel.innerHTML = wallets.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  
  $('#wc-actual-amount').value = '';
  updateWCDiff();
  openModal('wallet-check');
}

function updateWCDiff() {
  const accId = $('#wc-account').value;
  const acc = App.accounts.find(a => a.id === accId);
  if (!acc) return;

  const sysBal = computeAccountBalance(acc);
  $('#wc-system-amount').textContent = fmt(sysBal);

  const actualInput = $('#wc-actual-amount').value;
  if (actualInput === '') { $('#wc-diff-display').classList.add('hidden'); return; }

  const actual = parseInt(actualInput) || 0;
  const diff = actual - sysBal;
  $('#wc-diff-value').textContent = fmtSigned(diff);
  $('#wc-diff-display').classList.remove('hidden');
  
  const typeEl = $('#wc-diff-type');
  typeEl.textContent = diff > 0 ? '雑益として計上' : diff < 0 ? '雑損として計上' : '差額なし';
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
      memo: '財布チェック調整: ' + $('#wc-memo').value
    });
  }
  
  await loadAllData();
  closeModal('wallet-check');
  renderDashboard();
  alert('財布チェックを完了しました');
}

/* ─── ナビゲーション ─── */
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

function navigateTo(page) {
  $$('.page').forEach(p => p.classList.remove('active'));
  const target = $(`#page-${page}`);
  if (target) {
    target.classList.add('active');
    App.currentPage = page;
  }
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  if (page === 'dashboard') renderDashboard();
}

/* ─── 描画とデータ処理 ─── */
function renderDashboard() {
  const { y, m } = parseMonth(App.currentMonth);
  if ($('#dashboard-month-label')) $('#dashboard-month-label').textContent = `${y}年${m}月`;

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

async function deleteTransaction() {
  if (!App.editingTxId) return;
  if (confirm('この取引を削除しますか？')) {
    await API.delete('transactions', App.editingTxId);
    await loadAllData();
    navigateTo('dashboard');
  }
}

function changeMonth(delta) {
  const { y, m } = parseMonth(App.currentMonth);
  let nm = m + delta, ny = y;
  if (nm > 12) { nm = 1; ny++; } else if (nm < 1) { nm = 12; ny--; }
  App.currentMonth = monthKey(ny, nm);
  const label = `${ny}年${nm}月`;
  ['#dashboard-month-label', '#tx-month-label', '#rp-month-label', '#tr-month-label'].forEach(id => {
    if ($(id)) $(id).textContent = label;
  });
  navigateTo(App.currentPage);
}

function openModal(name) { $(`#modal-${name}`).classList.remove('hidden'); }
function closeModal(name) { $(`#modal-${name}`).classList.add('hidden'); }

function exportData() {
  const data = { transactions: API._db('transactions'), accounts: API._db('accounts'), categories: API._db('categories') };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kakeibo_backup_${today()}.json`;
  a.click();
}

document.addEventListener('DOMContentLoaded', init);
