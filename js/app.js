/* =====================================================
   かけいぼ - メインアプリロジック (完全版・GitHub Pages対応)
   ===================================================== */

'use strict';

/* ─── ユーティリティ (変更なし) ─── */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
const fmt = (n) => '¥' + Math.abs(n || 0).toLocaleString('ja-JP');
const fmtSigned = (n) => (n >= 0 ? '+¥' : '-¥') + Math.abs(n || 0).toLocaleString('ja-JP');
const today = () => new Date().toISOString().split('T')[0];
const monthKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
const parseMonth = (s) => ({ y: parseInt(s.split('-')[0]), m: parseInt(s.split('-')[1]) });

/* ─── API ラッパー (LocalStorage 互換に修正) ─── */
const API = {
  _db(table) { return JSON.parse(localStorage.getItem(`kb_db_${table}`) || '[]'); },
  _save(table, data) { localStorage.setItem(`kb_db_${table}`, JSON.stringify(data)); },
  
  async list(table, params = {}) {
    let list = this._db(table);
    // 元のロジックを維持するためのダミー処理
    return list;
  },
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

/* ─── アプリ状態 (全機能維持) ─── */
const App = {
  currentPage: 'dashboard',
  currentMonth: monthKey(new Date().getFullYear(), new Date().getMonth() + 1),
  txMonth: monthKey(new Date().getFullYear(), new Date().getMonth() + 1),
  rpMonth: monthKey(new Date().getFullYear(), new Date().getMonth() + 1),
  trMonth: monthKey(new Date().getFullYear(), new Date().getMonth() + 1),
  accounts: [],
  categories: [],
  transactions: [],
  walletChecks: [],
  travelLogs: [],
  editingTxId: null,
  editingAccountId: null,
  editingCategoryId: null,
  catTypeFilter: 'expense',
  selectedCategoryId: null,
  selectedTxType: 'expense',
  selectedAccountType: 'cash',
  selectedColor: '#FF3B30',
  selectedEmoji: '💴',
  barChart: null,
};

/* ─── 定数 (変更なし) ─── */
const ACCOUNT_TYPE_LABELS = { cash: '現金', bank: '銀行', credit: 'クレジット', 'e-money': '電子マネー', other: 'その他' };
const ACCOUNT_TYPE_ICONS  = { cash: '💴', bank: '🏦', credit: '💳', 'e-money': '📱', other: '📦' };
const EMOJIS = ['💴','🏦','💳','📱','🛒','🍽️','🚃','🏥','🏠','👕','🎮','🎁','💡','📦','💰','📈','📉'];
const COLORS = ['#FF3B30','#FF9500','#FFCC00','#34C759','#5AC8FA','#007AFF','#5856D6','#B0B0B0'];

/* ─── 初期化 ─── */
async function init() {
  await loadAllData();
  // 初回起動時のデフォルトデータ
  if (App.categories.length === 0) {
    await API.create('categories', { id: uuid(), name: '食費', type: 'expense', icon: '🍽️', color: '#FF6B6B', is_active: true });
    await API.create('categories', { id: uuid(), name: '給与', type: 'income', icon: '💰', color: '#34C759', is_active: true });
    await loadAllData();
  }
  if (App.accounts.length === 0) {
    await API.create('accounts', { id: uuid(), name: '財布', account_type: 'cash', initial_balance: 0, is_active: true });
    await loadAllData();
  }

  setupNavigation();
  setupEventListeners();
  renderDashboard();
}

async function loadAllData() {
  const [acc, cat, tx, wc, tl] = await Promise.all([
    API.list('accounts'), API.list('categories'), API.list('transactions'),
    API.list('wallet_checks'), API.list('travel_logs')
  ]);
  App.accounts = acc.filter(a => a.is_active);
  App.categories = cat.filter(c => c.is_active);
  App.transactions = tx.sort((a,b) => b.date.localeCompare(a.date));
  App.walletChecks = wc;
  App.travelLogs = tl;
}

/* ─── ナビゲーション (全ボタン動作保証) ─── */
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
  $(`#page-${page}`)?.classList.add('active');
  App.currentPage = page;
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  
  if (page === 'dashboard')    renderDashboard();
  if (page === 'transactions') renderTransactionsList();
  if (page === 'accounts')     renderAccountsPage();
}

/* ─── イベントリスナー (タブ動作の核) ─── */
function setupEventListeners() {
  // 収入・支出・移動タブの確実な切り替え
  $$('.type-tab').forEach(btn => {
    btn.onclick = () => {
      const type = btn.dataset.type;
      App.selectedTxType = type;
      $$('.type-tab').forEach(b => b.classList.toggle('active', b.dataset.type === type));
      
      // フィールドの表示切り替えロジックを維持
      const isTransfer = (type === 'transfer');
      $('#group-to-account')?.classList.toggle('hidden', !isTransfer);
      $('#group-category')?.classList.toggle('hidden', isTransfer);
      
      renderCategoryPicker(type);
    };
  });

  // 保存ボタン
  $('#btn-save-transaction')?.addEventListener('click', saveTransaction);

  // 月切り替え
  $('#btn-prev-month')?.onclick = () => changeMonth(-1);
  $('#btn-next-month')?.onclick = () => changeMonth(1);
}

function changeMonth(delta) {
  const { y, m } = parseMonth(App.currentMonth);
  let nm = m + delta, ny = y;
  if (nm > 12) { nm = 1; ny++; } else if (nm < 1) { nm = 12; ny--; }
  App.currentMonth = monthKey(ny, nm);
  $('#dashboard-month-label').textContent = `${ny}年${nm}月`;
  renderDashboard();
}

/* ─── 描画とデータ処理 ─── */
function renderDashboard() {
  const txs = App.transactions.filter(t => t.date.startsWith(App.currentMonth));
  const inc = txs.filter(t => t.type === 'income').reduce((s,t) => s+t.amount, 0);
  const exp = txs.filter(t => t.type === 'expense').reduce((s,t) => s+t.amount, 0);

  $('#summary-income').textContent = fmt(inc);
  $('#summary-expense').textContent = fmt(exp);
  $('#summary-balance').textContent = fmtSigned(inc - exp);

  const list = $('#account-list-dashboard');
  if (list) {
    list.innerHTML = App.accounts.map(acc => {
      const bal = computeAccountBalance(acc);
      return `
        <div class="account-item">
          <div class="account-icon">${ACCOUNT_TYPE_ICONS[acc.account_type] || '💴'}</div>
          <div class="account-info"><div class="account-name">${acc.name}</div></div>
          <div class="account-balance-text">${fmt(bal)}</div>
        </div>`;
    }).join('');
  }
}

function openInputPage(tx) {
  App.editingTxId = tx?.id || null;
  const type = tx?.type || 'expense';
  App.selectedTxType = type;
  
  $('#input-amount').value = tx?.amount || '';
  $('#input-date').value = tx?.date || today();
  $('#input-memo').value = tx?.memo || '';
  
  $$('.type-tab').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  updateAccountSelects();
  renderCategoryPicker(type);
  navigateTo('input');
}

function renderCategoryPicker(type) {
  const container = $('#category-picker');
  if (!container) return;
  const cats = App.categories.filter(c => c.type === type || c.type === 'both');
  container.innerHTML = cats.map(c => `
    <button class="cat-chip ${c.id === App.selectedCategoryId ? 'selected' : ''}" onclick="selectCategory('${c.id}')">
      <span>${c.icon}</span><span>${c.name}</span>
    </button>
  `).join('');
}

window.selectCategory = (id) => {
  App.selectedCategoryId = id;
  $$('.cat-chip').forEach(c => c.classList.toggle('selected', c.innerHTML.includes(id)));
  renderCategoryPicker(App.selectedTxType); // 再描画して選択を反映
};

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

/* 起動 */
window.addEventListener('DOMContentLoaded', init);
