/* =====================================================
   かけいぼ - メインアプリロジック
   =====================================================
   アーキテクチャ:
   - State: LocalStorage + REST API (tables/)
   - ページング: SPA (単一ページ、セクション切替)
   - 全テーブル: transactions / accounts / categories /
                wallet_checks / travel_logs
   ===================================================== */

'use strict';

/* ─── ユーティリティ ─── */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
const fmt = (n) => '¥' + Math.abs(n).toLocaleString('ja-JP');
const fmtSigned = (n) => (n >= 0 ? '+¥' : '-¥') + Math.abs(n).toLocaleString('ja-JP');
const today = () => new Date().toISOString().split('T')[0];
const monthKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
const parseMonth = (s) => ({ y: parseInt(s.split('-')[0]), m: parseInt(s.split('-')[1]) });

/* ─── API ラッパー ─── */
const API = {
  async list(table, params = {}) {
    const q = new URLSearchParams({ limit: 1000, ...params }).toString();
    const r = await fetch(`tables/${table}?${q}`);
    return (await r.json()).data || [];
  },
  async get(table, id) {
    const r = await fetch(`tables/${table}/${id}`);
    return await r.json();
  },
  async create(table, data) {
    const r = await fetch(`tables/${table}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await r.json();
  },
  async update(table, id, data) {
    const r = await fetch(`tables/${table}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await r.json();
  },
  async delete(table, id) {
    await fetch(`tables/${table}/${id}`, { method: 'DELETE' });
  }
};

/* ─── アプリ状態 ─── */
const App = {
  currentPage: 'dashboard',
  currentMonth: monthKey(new Date().getFullYear(), new Date().getMonth() + 1),
  txMonth: monthKey(new Date().getFullYear(), new Date().getMonth() + 1),
  rpMonth: monthKey(new Date().getFullYear(), new Date().getMonth() + 1),
  trMonth: monthKey(new Date().getFullYear(), new Date().getMonth() + 1),
  // キャッシュ
  accounts: [],
  categories: [],
  transactions: [],
  walletChecks: [],
  travelLogs: [],
  // 編集中
  editingTxId: null,
  editingAccountId: null,
  editingCategoryId: null,
  catTypeFilter: 'expense',
  selectedCategoryId: null,
  selectedCatType: 'expense',  // モーダル用
  selectedAccountType: 'cash',
  selectedColor: '#FF3B30',
  selectedEmoji: '💴',
  barChart: null,
};

/* ─── 定数 ─── */
const ACCOUNT_TYPE_LABELS = { cash: '現金', bank: '銀行', credit: 'クレジット', 'e-money': '電子マネー', other: 'その他' };
const ACCOUNT_TYPE_ICONS  = { cash: '💴', bank: '🏦', credit: '💳', 'e-money': '📱', other: '📦' };

const DEFAULT_CATEGORIES = [
  { name: '食費',     type: 'expense', icon: '🍽️', color: '#FF6B6B', is_system: true,  sort_order: 1 },
  { name: '交通費',   type: 'expense', icon: '🚃', color: '#4ECDC4', is_system: true,  sort_order: 2 },
  { name: '日用品',   type: 'expense', icon: '🛒', color: '#45B7D1', is_system: true,  sort_order: 3 },
  { name: '医療費',   type: 'expense', icon: '🏥', color: '#96CEB4', is_system: true,  sort_order: 4 },
  { name: '娯楽',     type: 'expense', icon: '🎮', color: '#FFEAA7', is_system: true,  sort_order: 5 },
  { name: '衣類',     type: 'expense', icon: '👕', color: '#DDA0DD', is_system: true,  sort_order: 6 },
  { name: '光熱費',   type: 'expense', icon: '💡', color: '#FFB347', is_system: true,  sort_order: 7 },
  { name: '通信費',   type: 'expense', icon: '📱', color: '#87CEEB', is_system: true,  sort_order: 8 },
  { name: '雑費',     type: 'expense', icon: '📦', color: '#B0B0B0', is_system: true,  sort_order: 9 },
  { name: '雑損',     type: 'expense', icon: '📉', color: '#FF3B30', is_system: true,  sort_order: 10 },
  { name: '給与',     type: 'income',  icon: '💰', color: '#34C759', is_system: true,  sort_order: 11 },
  { name: 'ボーナス', type: 'income',  icon: '🎁', color: '#5AC8FA', is_system: true,  sort_order: 12 },
  { name: '副業',     type: 'income',  icon: '💼', color: '#FF9500', is_system: true,  sort_order: 13 },
  { name: '雑益',     type: 'income',  icon: '📈', color: '#34C759', is_system: true,  sort_order: 14 },
  { name: '贈り物',   type: 'income',  icon: '🎀', color: '#FF6B9D', is_system: true,  sort_order: 15 },
];

const DEFAULT_ACCOUNTS = [
  { name: '財布', account_type: 'cash', balance: 0, initial_balance: 0, sort_order: 1, is_wallet: true, is_active: true },
  { name: '銀行口座', account_type: 'bank', balance: 0, initial_balance: 0, sort_order: 2, is_wallet: false, is_active: true },
];

const EMOJIS = ['💴','💵','🏦','💳','📱','🛒','🍽️','🚃','🚌','🚕','🚗','🏥','🏠','👕','🎮','🎁','💡','📦','💰','💼','📉','📈','🎀','🧾','☕','🍺','🍜','🎵','📚','✈️','🏋️','💊','🔧','🎪','🌟'];
const COLORS = ['#FF3B30','#FF6B6B','#FF9500','#FFB347','#FFCC00','#34C759','#4ECDC4','#45B7D1','#5AC8FA','#007AFF','#5856D6','#DDA0DD','#FF2D55','#FF6B9D','#B0B0B0','#8E8E93'];

/* ─── 初期化 ─── */
async function init() {
  await ensureDefaultData();
  await loadAllData();
  setupNavigation();
  setupEventListeners();
  renderDashboard();
  checkWalletCheckDue();
}

async function ensureDefaultData() {
  // カテゴリー初期化
  const cats = await API.list('categories');
  if (cats.length === 0) {
    for (const c of DEFAULT_CATEGORIES) {
      await API.create('categories', { id: uuid(), ...c, is_active: true });
    }
  }
  // 口座初期化
  const accs = await API.list('accounts');
  if (accs.length === 0) {
    for (const a of DEFAULT_ACCOUNTS) {
      await API.create('accounts', { id: uuid(), ...a });
    }
  }
}

async function loadAllData() {
  const [accounts, categories, transactions, walletChecks, travelLogs] = await Promise.all([
    API.list('accounts'),
    API.list('categories'),
    API.list('transactions'),
    API.list('wallet_checks'),
    API.list('travel_logs'),
  ]);
  App.accounts    = accounts.filter(a => a.is_active);
  App.categories  = categories.filter(c => c.is_active);
  App.transactions = transactions.sort((a, b) => b.date.localeCompare(a.date) || b.created_at - a.created_at);
  App.walletChecks = walletChecks.sort((a, b) => b.check_date.localeCompare(a.check_date));
  App.travelLogs   = travelLogs.sort((a, b) => b.date.localeCompare(a.date));
}

/* ─── ナビゲーション ─── */
function setupNavigation() {
  // ボトムナビ
  $$('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      if (!page) return;
      if (page === 'input') {
        openInputPage(null);
        return;
      }
      navigateTo(page);
    });
  });

  // 戻るボタン
  $$('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.back));
  });
}

function navigateTo(page) {
  const current = $(`#page-${App.currentPage}`);
  const next    = $(`#page-${page}`);
  if (!next) return;

  current?.classList.remove('active');
  current?.classList.add('slide-out');
  setTimeout(() => current?.classList.remove('slide-out'), 250);

  next.classList.add('active');
  App.currentPage = page;

  // ボトムナビ更新
  $$('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.page === page);
  });

  // ページ固有処理
  if (page === 'dashboard')    renderDashboard();
  if (page === 'transactions') renderTransactionsList();
  if (page === 'accounts')     renderAccountsPage();
  if (page === 'categories')   renderCategoriesPage();
  if (page === 'report')       renderReport();
  if (page === 'travel')       renderTravelLogs();
}

/* ─── イベントリスナー設定 ─── */
function setupEventListeners() {
  // ダッシュボード月ナビ
  $('#btn-prev-month').addEventListener('click', () => changeMonth('dashboard', -1));
  $('#btn-next-month').addEventListener('click', () => changeMonth('dashboard', +1));

  // 取引一覧月ナビ
  $('#btn-prev-month-tx').addEventListener('click', () => changeMonth('tx', -1));
  $('#btn-next-month-tx').addEventListener('click', () => changeMonth('tx', +1));

  // レポート月ナビ
  $('#btn-prev-month-rp').addEventListener('click', () => changeMonth('rp', -1));
  $('#btn-next-month-rp').addEventListener('click', () => changeMonth('rp', +1));

  // 移動記録月ナビ
  $('#btn-prev-month-tr').addEventListener('click', () => changeMonth('tr', -1));
  $('#btn-next-month-tr').addEventListener('click', () => changeMonth('tr', +1));

  // ダッシュボード
  $('#btn-go-accounts').addEventListener('click', () => navigateTo('accounts'));
  $('#btn-go-transactions').addEventListener('click', () => navigateTo('transactions'));
  $('#btn-wallet-check').addEventListener('click', openWalletCheckModal);
  $('#btn-wallet-check-banner').addEventListener('click', openWalletCheckModal);
  $('#btn-backup').addEventListener('click', () => openModal('backup'));

  // フィルター
  $('#btn-filter-transactions').addEventListener('click', () => {
    const panel = $('#filter-panel');
    panel.classList.toggle('hidden');
  });
  $('#btn-filter-clear').addEventListener('click', clearFilters);
  ['filter-type','filter-account','filter-category'].forEach(id => {
    $(`#${id}`).addEventListener('change', renderTransactionsList);
  });

  // 入力フォーム
  $$('.type-tab[data-type]').forEach(btn => {
    btn.addEventListener('click', () => selectTxType(btn.dataset.type));
  });
  $('#btn-save-transaction').addEventListener('click', saveTransaction);
  $('#btn-delete-transaction').addEventListener('click', () => deleteTransaction(App.editingTxId));
  $('#toggle-travel').addEventListener('change', (e) => {
    $('#travel-input-area').classList.toggle('hidden', !e.target.checked);
  });
  $('#wc-actual-amount').addEventListener('input', updateWCDiff);
  $('#wc-account').addEventListener('change', updateWCDiff);

  // 口座モーダル
  $('#btn-add-account').addEventListener('click', () => openAccountModal(null));
  $('#btn-save-account').addEventListener('click', saveAccount);
  $('#btn-delete-account').addEventListener('click', () => deleteAccount(App.editingAccountId));
  $$('.actype-btn[data-type]').forEach(btn => {
    btn.addEventListener('click', () => selectAccountType(btn.dataset.type));
  });

  // カテゴリー管理タブ
  $$('.type-tab[data-cattype]').forEach(btn => {
    btn.addEventListener('click', () => {
      App.catTypeFilter = btn.dataset.cattype;
      $$('.type-tab[data-cattype]').forEach(b => b.classList.toggle('active', b.dataset.cattype === btn.dataset.cattype));
      renderCategoriesPage();
    });
  });
  $('#btn-add-category').addEventListener('click', () => openCategoryModal(null));
  $('#btn-save-category').addEventListener('click', saveCategory);
  $('#btn-delete-category').addEventListener('click', () => deleteCategory(App.editingCategoryId));

  // 財布チェック保存
  $('#btn-confirm-wallet-check').addEventListener('click', saveWalletCheck);

  // バックアップ
  $('#btn-export-backup').addEventListener('click', exportBackup);
  $('#import-file').addEventListener('change', importBackup);

  // モーダル閉じる
  $$('.modal-close[data-modal]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.modal));
  });
  $$('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.add('hidden');
      }
    });
  });

  // 確認ダイアログ
  $('#btn-confirm-cancel').addEventListener('click', () => closeModal('confirm'));
  $('#btn-confirm-ok').addEventListener('click', async () => {
    closeModal('confirm');
    if (_confirmCallback) await _confirmCallback();
    _confirmCallback = null;
  });
}

function changeMonth(target, delta) {
  const key = target === 'dashboard' ? 'currentMonth'
            : target === 'tx'        ? 'txMonth'
            : target === 'rp'        ? 'rpMonth'
            : 'trMonth';
  const { y, m } = parseMonth(App[key]);
  let nm = m + delta, ny = y;
  if (nm > 12) { nm = 1; ny++; }
  if (nm < 1)  { nm = 12; ny--; }
  App[key] = monthKey(ny, nm);

  const labelIds = { dashboard: '#dashboard-month-label', tx: '#tx-month-label', rp: '#rp-month-label', tr: '#tr-month-label' };
  $(labelIds[target]).textContent = formatMonthLabel(App[key]);

  if (target === 'dashboard')    renderDashboard();
  if (target === 'tx')           renderTransactionsList();
  if (target === 'rp')           renderReport();
  if (target === 'tr')           renderTravelLogs();
}

function formatMonthLabel(mk) {
  const { y, m } = parseMonth(mk);
  return `${y}年${m}月`;
}

/* ─── ダッシュボード描画 ─── */
function renderDashboard() {
  $('#dashboard-month-label').textContent = formatMonthLabel(App.currentMonth);
  const txs = filterByMonth(App.transactions, App.currentMonth);

  // サマリー
  const income  = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;

  $('#summary-income').textContent  = fmt(income);
  $('#summary-expense').textContent = fmt(expense);
  const balEl = $('#summary-balance');
  balEl.textContent = (balance >= 0 ? '+' : '-') + fmt(balance);
  balEl.className = 'summary-amount ' + (balance >= 0 ? 'positive' : 'negative');

  // 口座残高
  renderAccountListDashboard();

  // 最近の取引 (最新5件)
  renderTransactionItems($('#recent-transactions'), App.transactions.slice(0, 5), false);
}

function renderAccountListDashboard() {
  const container = $('#account-list-dashboard');
  container.innerHTML = '';
  if (App.accounts.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>口座がありません</p></div>';
    return;
  }
  App.accounts.forEach(acc => {
    const bal = computeAccountBalance(acc);
    const div = document.createElement('div');
    div.className = 'account-item';
    div.innerHTML = `
      <div class="account-icon">${ACCOUNT_TYPE_ICONS[acc.account_type] || '📦'}</div>
      <div class="account-info">
        <div class="account-name">${esc(acc.name)}</div>
        <div class="account-type-label">${ACCOUNT_TYPE_LABELS[acc.account_type] || acc.account_type}</div>
      </div>
      <div class="account-balance-text">${fmt(bal)}</div>
    `;
    div.addEventListener('click', () => navigateTo('accounts'));
    container.appendChild(div);
  });
}

/* ─── 取引リスト描画 ─── */
function renderTransactionsList() {
  $('#tx-month-label').textContent = formatMonthLabel(App.txMonth);
  let txs = filterByMonth(App.transactions, App.txMonth);

  // フィルター適用
  const type     = $('#filter-type').value;
  const accountId  = $('#filter-account').value;
  const categoryId = $('#filter-category').value;
  if (type)       txs = txs.filter(t => t.type === type);
  if (accountId)  txs = txs.filter(t => t.account_id === accountId || t.to_account_id === accountId);
  if (categoryId) txs = txs.filter(t => t.category_id === categoryId);

  renderTransactionItems($('#all-transactions'), txs, true);

  // フィルターセレクト更新
  updateFilterSelects();
}

function renderTransactionItems(container, txs, showDivider) {
  container.innerHTML = '';
  if (txs.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-receipt"></i><p>取引がありません</p></div>';
    return;
  }

  let lastDate = null;
  txs.forEach(tx => {
    if (showDivider && tx.date !== lastDate) {
      const d = document.createElement('div');
      d.className = 'tx-date-divider';
      d.textContent = formatDateDivider(tx.date);
      container.appendChild(d);
      lastDate = tx.date;
    }
    container.appendChild(buildTxItem(tx));
  });
}

function buildTxItem(tx) {
  const cat = App.categories.find(c => c.id === tx.category_id);
  const acc = App.accounts.find(a => a.id === tx.account_id);
  const toAcc = App.accounts.find(a => a.id === tx.to_account_id);

  const isAdj = tx.is_adjustment;
  const typeClass = isAdj ? 'adjustment' : tx.type;

  let icon = '';
  let label = '';
  let amountStr = '';

  if (tx.type === 'transfer') {
    icon  = '↔️';
    label = `${acc?.name || '?'} → ${toAcc?.name || '?'}`;
    amountStr = fmt(tx.amount);
  } else {
    icon  = cat?.icon || (tx.type === 'income' ? '💰' : '💴');
    label = isAdj ? (tx.type === 'income' ? '雑益（財布調整）' : '雑損（財布調整）') : (cat?.name || '未分類');
    amountStr = (tx.type === 'income' ? '+' : '-') + fmt(tx.amount);
  }

  const div = document.createElement('div');
  div.className = 'tx-item';
  div.innerHTML = `
    <div class="tx-icon ${typeClass}"><span>${icon}</span></div>
    <div class="tx-info">
      <div class="tx-category">${esc(label)}</div>
      <div class="tx-meta">
        <span>${formatDateShort(tx.date)}</span>
        ${tx.memo ? `<span>· ${esc(tx.memo)}</span>` : ''}
      </div>
    </div>
    <div class="tx-amount-wrap">
      <div class="tx-amount ${typeClass}">${amountStr}</div>
      <div class="tx-account-label">${acc?.name || ''}</div>
    </div>
  `;
  div.addEventListener('click', () => openInputPage(tx));
  return div;
}

function updateFilterSelects() {
  const accSel = $('#filter-account');
  const catSel = $('#filter-category');
  const curAcc = accSel.value;
  const curCat = catSel.value;

  accSel.innerHTML = '<option value="">すべての口座</option>';
  App.accounts.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = a.name;
    if (a.id === curAcc) opt.selected = true;
    accSel.appendChild(opt);
  });

  catSel.innerHTML = '<option value="">すべてのカテゴリー</option>';
  App.categories.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.icon} ${c.name}`;
    if (c.id === curCat) opt.selected = true;
    catSel.appendChild(opt);
  });
}

function clearFilters() {
  $('#filter-type').value = '';
  $('#filter-account').value = '';
  $('#filter-category').value = '';
  renderTransactionsList();
}

/* ─── 入力フォーム ─── */
function openInputPage(tx) {
  App.editingTxId = tx?.id || null;
  $('#input-page-title').textContent = tx ? '取引を編集' : '新規入力';
  $('#group-delete').classList.toggle('hidden', !tx);

  // タイプ選択
  const type = tx?.type || 'expense';
  selectTxType(type);

  // 金額
  $('#input-amount').value = tx?.amount || '';

  // 日付
  $('#input-date').value = tx?.date || today();

  // カテゴリー
  App.selectedCategoryId = tx?.category_id || null;
  renderCategoryPicker(type);

  // 口座セレクト更新
  updateAccountSelects(tx?.account_id, tx?.to_account_id);

  // メモ
  $('#input-memo').value = tx?.memo || '';

  // 移動記録
  $('#toggle-travel').checked = false;
  $('#travel-input-area').classList.add('hidden');

  navigateTo('input');
}

function selectTxType(type) {
  $$('.type-tab[data-type]').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  App.selectedTxType = type;

  // カテゴリーグループ
  const showCat = type !== 'transfer';
  $('#group-category').classList.toggle('hidden', !showCat);

  // 移動先
  $('#group-to-account').classList.toggle('hidden', type !== 'transfer');

  // 移動記録
  $('#group-travel').classList.toggle('hidden', type !== 'expense');

  // カテゴリー再描画
  renderCategoryPicker(type);
}

function renderCategoryPicker(type) {
  const container = $('#category-picker');
  container.innerHTML = '';
  const relevant = App.categories.filter(c =>
    c.type === type || c.type === 'both'
  );
  relevant.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'cat-chip' + (cat.id === App.selectedCategoryId ? ' selected' : '');
    btn.innerHTML = `<span>${cat.icon}</span><span>${esc(cat.name)}</span>`;
    btn.addEventListener('click', () => {
      App.selectedCategoryId = cat.id;
      $$('.cat-chip').forEach(c => c.classList.remove('selected'));
      btn.classList.add('selected');
    });
    container.appendChild(btn);
  });
}

function updateAccountSelects(accId, toAccId) {
  ['input-account', 'input-to-account'].forEach(id => {
    const sel = $(`#${id}`);
    sel.innerHTML = '';
    App.accounts.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = `${ACCOUNT_TYPE_ICONS[a.account_type]} ${a.name}`;
      sel.appendChild(opt);
    });
  });
  if (accId) $('#input-account').value = accId;
  if (toAccId) $('#input-to-account').value = toAccId;
}

async function saveTransaction() {
  const amount = parseInt($('#input-amount').value);
  if (!amount || amount <= 0) { showToast('金額を入力してください'); return; }

  const type      = App.selectedTxType || 'expense';
  const accountId = $('#input-account').value;
  const date      = $('#input-date').value;
  const memo      = $('#input-memo').value.trim();

  if (!accountId) { showToast('口座を選択してください'); return; }

  const txData = {
    type,
    amount,
    account_id:   accountId,
    to_account_id: type === 'transfer' ? $('#input-to-account').value : '',
    category_id:  (type !== 'transfer') ? (App.selectedCategoryId || '') : '',
    date,
    memo,
    is_adjustment: false,
  };

  let savedTx;
  if (App.editingTxId) {
    savedTx = await API.update('transactions', App.editingTxId, { id: App.editingTxId, ...txData });
    showToast('取引を更新しました');
  } else {
    txData.id = uuid();
    savedTx = await API.create('transactions', txData);
    showToast('取引を保存しました');
  }

  // 移動記録追加
  if ($('#toggle-travel').checked && type === 'expense') {
    const travelData = {
      id: uuid(),
      date,
      from_location:   $('#travel-from').value.trim(),
      to_location:     $('#travel-to').value.trim(),
      transport_type:  $('#travel-transport').value,
      purpose:         $('#travel-purpose').value.trim(),
      amount,
      transaction_id:  savedTx.id,
      memo,
    };
    await API.create('travel_logs', travelData);
    await loadAllData();
  } else {
    await loadAllData();
  }

  navigateTo('dashboard');
}

async function deleteTransaction(id) {
  if (!id) return;
  showConfirm('取引を削除', 'この取引を削除しますか？', async () => {
    await API.delete('transactions', id);
    showToast('取引を削除しました');
    await loadAllData();
    navigateTo('dashboard');
  });
}

/* ─── 口座管理 ─── */
function renderAccountsPage() {
  const container = $('#accounts-list');
  container.innerHTML = '';
  App.accounts.forEach(acc => {
    const bal = computeAccountBalance(acc);
    const card = document.createElement('div');
    card.className = 'account-card';
    card.innerHTML = `
      <div class="account-card-icon">${ACCOUNT_TYPE_ICONS[acc.account_type] || '📦'}</div>
      <div class="account-card-info">
        <div class="account-card-name">${esc(acc.name)}</div>
        <div class="account-card-type">${ACCOUNT_TYPE_LABELS[acc.account_type] || acc.account_type}</div>
        ${acc.is_wallet ? '<span class="wallet-badge">💴 財布チェック対象</span>' : ''}
      </div>
      <div class="account-card-balance">${fmt(bal)}</div>
    `;
    card.addEventListener('click', () => openAccountModal(acc));
    container.appendChild(card);
  });
}

function openAccountModal(acc) {
  App.editingAccountId = acc?.id || null;
  $('#account-modal-title').textContent = acc ? '口座を編集' : '口座を追加';
  $('#account-name').value    = acc?.name || '';
  $('#account-balance').value = acc ? computeAccountBalance(acc) : '';
  $('#account-is-wallet').checked = acc?.is_wallet || false;
  $('#account-delete-group').classList.toggle('hidden', !acc);

  // 種類選択
  selectAccountType(acc?.account_type || 'cash');

  openModal('account');
}

function selectAccountType(type) {
  App.selectedAccountType = type;
  $$('.actype-btn[data-type]').forEach(b => b.classList.toggle('active', b.dataset.type === type));
}

async function saveAccount() {
  const name    = $('#account-name').value.trim();
  const balance = parseInt($('#account-balance').value) || 0;
  if (!name) { showToast('口座名を入力してください'); return; }

  const data = {
    name,
    account_type:    App.selectedAccountType,
    balance,
    initial_balance: balance,
    sort_order:      App.accounts.length + 1,
    is_wallet:       $('#account-is-wallet').checked,
    is_active:       true,
  };

  if (App.editingAccountId) {
    // 既存口座: 残高差分を取引として記録
    const existing = App.accounts.find(a => a.id === App.editingAccountId);
    const oldBal = computeAccountBalance(existing);
    await API.update('accounts', App.editingAccountId, { id: App.editingAccountId, ...data, initial_balance: existing.initial_balance });
    if (balance !== oldBal) {
      const diff = balance - oldBal;
      const adjTx = {
        id: uuid(),
        type: diff > 0 ? 'income' : 'expense',
        amount: Math.abs(diff),
        account_id: App.editingAccountId,
        to_account_id: '',
        category_id: getSystemCategoryId(diff > 0 ? '雑益' : '雑損'),
        date: today(),
        memo: '残高調整',
        is_adjustment: true,
      };
      await API.create('transactions', adjTx);
    }
    showToast('口座を更新しました');
  } else {
    data.id = uuid();
    await API.create('accounts', data);
    showToast('口座を追加しました');
  }

  await loadAllData();
  closeModal('account');
  renderAccountsPage();
}

async function deleteAccount(id) {
  if (!id) return;
  showConfirm('口座を削除', 'この口座を削除しますか？関連取引は残ります。', async () => {
    await API.update('accounts', id, { ...App.accounts.find(a => a.id === id), is_active: false });
    showToast('口座を削除しました');
    await loadAllData();
    closeModal('account');
    renderAccountsPage();
  });
}

/* ─── カテゴリー管理 ─── */
function renderCategoriesPage() {
  const container = $('#categories-list');
  container.innerHTML = '';
  const filtered = App.categories.filter(c =>
    c.type === App.catTypeFilter || c.type === 'both'
  );
  filtered.forEach(cat => {
    const card = document.createElement('div');
    card.className = 'category-card';
    card.innerHTML = `
      <div class="category-card-icon" style="background:${cat.color}20">${cat.icon}</div>
      <div class="category-card-name">${esc(cat.name)}</div>
      ${cat.is_system ? '<span class="system-badge">システム</span>' : `<span class="category-card-type">${cat.type === 'both' ? '支出/収入' : cat.type === 'income' ? '収入' : '支出'}</span>`}
    `;
    card.addEventListener('click', () => openCategoryModal(cat));
    container.appendChild(card);
  });
}

function openCategoryModal(cat) {
  App.editingCategoryId = cat?.id || null;
  $('#category-modal-title').textContent = cat ? 'カテゴリーを編集' : 'カテゴリーを追加';
  $('#category-name').value = cat?.name || '';
  $('#category-delete-group').classList.toggle('hidden', !cat || cat.is_system);
  $('#btn-save-category').disabled = cat?.is_system || false;
  $('#btn-save-category').style.opacity = cat?.is_system ? '0.5' : '1';

  // 種類選択
  App.selectedCatType = cat?.type || 'expense';
  $$('.actype-btn[data-cattype]').forEach(b => b.classList.toggle('active', b.dataset.cattype === App.selectedCatType));

  // 絵文字/色
  App.selectedEmoji = cat?.icon || '📦';
  App.selectedColor = cat?.color || '#FF3B30';

  renderEmojiGrid();
  renderColorPalette();

  // カスタム絵文字
  $('#category-icon-custom').value = '';

  // カテゴリー種別ボタン
  $$('.actype-btn[data-cattype]').forEach(btn => {
    btn.onclick = () => {
      App.selectedCatType = btn.dataset.cattype;
      $$('.actype-btn[data-cattype]').forEach(b => b.classList.toggle('active', b.dataset.cattype === btn.dataset.cattype));
    };
  });

  openModal('category');
}

function renderEmojiGrid() {
  const grid = $('#emoji-grid');
  grid.innerHTML = '';
  EMOJIS.forEach(e => {
    const btn = document.createElement('button');
    btn.className = 'emoji-btn' + (e === App.selectedEmoji ? ' selected' : '');
    btn.textContent = e;
    btn.addEventListener('click', () => {
      App.selectedEmoji = e;
      $$('.emoji-btn').forEach(b => b.classList.toggle('selected', b.textContent === e));
      $('#category-icon-custom').value = '';
    });
    grid.appendChild(btn);
  });

  // カスタム入力
  $('#category-icon-custom').oninput = (ev) => {
    const v = ev.target.value.trim();
    if (v) {
      App.selectedEmoji = v;
      $$('.emoji-btn').forEach(b => b.classList.remove('selected'));
    }
  };
}

function renderColorPalette() {
  const palette = $('#color-palette');
  palette.innerHTML = '';
  COLORS.forEach(c => {
    const dot = document.createElement('div');
    dot.className = 'color-dot' + (c === App.selectedColor ? ' selected' : '');
    dot.style.background = c;
    dot.addEventListener('click', () => {
      App.selectedColor = c;
      $$('.color-dot').forEach(d => d.classList.toggle('selected', d.style.background === c));
    });
    palette.appendChild(dot);
  });
}

async function saveCategory() {
  const name = $('#category-name').value.trim();
  if (!name) { showToast('カテゴリー名を入力してください'); return; }
  if (App.editingCategoryId && App.categories.find(c => c.id === App.editingCategoryId)?.is_system) {
    showToast('システムカテゴリーは編集できません'); return;
  }

  const data = {
    name,
    type: App.selectedCatType,
    icon: App.selectedEmoji,
    color: App.selectedColor,
    sort_order: App.categories.length + 1,
    is_system: false,
    is_active: true,
  };

  if (App.editingCategoryId) {
    await API.update('categories', App.editingCategoryId, { id: App.editingCategoryId, ...data });
    showToast('カテゴリーを更新しました');
  } else {
    data.id = uuid();
    await API.create('categories', data);
    showToast('カテゴリーを追加しました');
  }

  await loadAllData();
  closeModal('category');
  renderCategoriesPage();
}

async function deleteCategory(id) {
  if (!id) return;
  const cat = App.categories.find(c => c.id === id);
  if (cat?.is_system) { showToast('システムカテゴリーは削除できません'); return; }
  showConfirm('カテゴリーを削除', 'このカテゴリーを削除しますか？', async () => {
    await API.update('categories', id, { ...cat, is_active: false });
    showToast('カテゴリーを削除しました');
    await loadAllData();
    closeModal('category');
    renderCategoriesPage();
  });
}

/* ─── レポート ─── */
function renderReport() {
  $('#rp-month-label').textContent = formatMonthLabel(App.rpMonth);
  const txs = filterByMonth(App.transactions, App.rpMonth);

  const income  = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;

  $('#rp-income').textContent  = fmt(income);
  $('#rp-expense').textContent = fmt(expense);
  const balEl = $('#rp-balance');
  balEl.textContent = (balance >= 0 ? '+' : '-') + fmt(balance);
  balEl.className = 'summary-amount ' + (balance >= 0 ? 'positive' : 'negative');

  renderBarChart();
  renderCategoryBreakdown(txs);
  renderWalletCheckHistory();
}

function renderBarChart() {
  const { y, m } = parseMonth(App.rpMonth);
  const months = [];
  const incomeData = [];
  const expenseData = [];

  for (let i = 5; i >= 0; i--) {
    let my = y, mm = m - i;
    while (mm <= 0) { mm += 12; my--; }
    const mk = monthKey(my, mm);
    const txs = filterByMonth(App.transactions, mk);
    months.push(`${mm}月`);
    incomeData.push(txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0));
    expenseData.push(txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0));
  }

  const ctx = $('#monthly-bar-chart').getContext('2d');
  if (App.barChart) App.barChart.destroy();
  App.barChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months,
      datasets: [
        { label: '収入', data: incomeData, backgroundColor: 'rgba(52,199,89,0.7)', borderRadius: 4 },
        { label: '支出', data: expenseData, backgroundColor: 'rgba(255,59,48,0.7)', borderRadius: 4 },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: {
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: {
            font: { size: 10 },
            callback: (v) => v >= 10000 ? (v/10000).toFixed(0) + '万' : v
          }
        }
      }
    }
  });
}

function renderCategoryBreakdown(txs) {
  const container = $('#category-breakdown');
  container.innerHTML = '';
  const expenses = txs.filter(t => t.type === 'expense');
  const total = expenses.reduce((s, t) => s + t.amount, 0);
  if (total === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:20px"><p>支出データがありません</p></div>';
    return;
  }

  const byCategory = {};
  expenses.forEach(tx => {
    const key = tx.category_id || '__none__';
    byCategory[key] = (byCategory[key] || 0) + tx.amount;
  });

  const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

  sorted.forEach(([catId, amount]) => {
    const cat = App.categories.find(c => c.id === catId);
    const pct = Math.round((amount / total) * 100);
    const div = document.createElement('div');
    div.className = 'breakdown-item';
    div.innerHTML = `
      <div class="breakdown-icon" style="background:${(cat?.color || '#B0B0B0')}20">${cat?.icon || '📦'}</div>
      <div class="breakdown-info">
        <div class="breakdown-name">${esc(cat?.name || '未分類')}</div>
        <div class="breakdown-bar-wrap">
          <div class="breakdown-bar" style="width:${pct}%;background:${cat?.color || '#B0B0B0'}"></div>
        </div>
      </div>
      <div>
        <div class="breakdown-amount">${fmt(amount)}</div>
        <div class="breakdown-percent">${pct}%</div>
      </div>
    `;
    container.appendChild(div);
  });
}

function renderWalletCheckHistory() {
  const container = $('#wallet-check-history');
  container.innerHTML = '';
  const checks = App.walletChecks.slice(0, 10);
  if (checks.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:20px"><p>財布チェック履歴がありません</p></div>';
    return;
  }
  checks.forEach(wc => {
    const acc = App.accounts.find(a => a.id === wc.account_id);
    const diff = wc.difference;
    const div = document.createElement('div');
    div.className = 'wh-item';
    div.innerHTML = `
      <div>
        <div class="wh-date">${formatDateShort(wc.check_date)}</div>
        <div class="wh-account">${acc?.name || '?'} · 実際: ${fmt(wc.actual_amount)}</div>
      </div>
      <div class="wh-diff ${diff > 0 ? 'positive' : diff < 0 ? 'negative' : 'zero'}">
        ${diff === 0 ? '差額なし' : fmtSigned(diff)}
      </div>
    `;
    container.appendChild(div);
  });
}

/* ─── 財布チェック ─── */
function openWalletCheckModal() {
  const walletAccounts = App.accounts.filter(a => a.is_wallet);
  const wcSel = $('#wc-account');
  wcSel.innerHTML = '';

  if (walletAccounts.length === 0) {
    showToast('財布チェック対象の口座がありません。口座設定で「財布チェック対象」を有効にしてください。');
    return;
  }

  walletAccounts.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = a.name;
    wcSel.appendChild(opt);
  });

  $('#wc-actual-amount').value = '';
  $('#wc-memo').value = '';
  $('#wc-diff-display').classList.add('hidden');
  updateWCDiff();
  openModal('wallet-check');
}

function updateWCDiff() {
  const accId = $('#wc-account').value;
  const acc = App.accounts.find(a => a.id === accId);
  if (!acc) return;

  const sysBal = computeAccountBalance(acc);
  $('#wc-system-amount').textContent = fmt(sysBal);

  const actual = parseInt($('#wc-actual-amount').value) || 0;
  if ($('#wc-actual-amount').value === '') {
    $('#wc-diff-display').classList.add('hidden');
    return;
  }

  const diff = actual - sysBal;
  $('#wc-diff-value').textContent = fmtSigned(diff);
  $('#wc-diff-display').classList.remove('hidden');

  const typeEl = $('#wc-diff-type');
  if (diff > 0) {
    typeEl.textContent = '雑益として計上';
    typeEl.style.background = 'rgba(52,199,89,0.15)';
    typeEl.style.color = '#34C759';
  } else if (diff < 0) {
    typeEl.textContent = '雑損として計上';
    typeEl.style.background = 'rgba(255,59,48,0.12)';
    typeEl.style.color = '#FF3B30';
  } else {
    typeEl.textContent = '差額なし';
    typeEl.style.background = 'rgba(142,142,147,0.15)';
    typeEl.style.color = '#8E8E93';
  }
}

async function saveWalletCheck() {
  const accId  = $('#wc-account').value;
  const actual = parseInt($('#wc-actual-amount').value);
  if (isNaN(actual) || actual < 0) { showToast('実際の残高を入力してください'); return; }

  const acc    = App.accounts.find(a => a.id === accId);
  const sysBal = computeAccountBalance(acc);
  const diff   = actual - sysBal;
  const memo   = $('#wc-memo').value.trim();

  let adjTxId = '';

  // 差額がある場合は雑益/雑損として自動計上
  if (diff !== 0) {
    const adjTx = {
      id: uuid(),
      type: diff > 0 ? 'income' : 'expense',
      amount: Math.abs(diff),
      account_id: accId,
      to_account_id: '',
      category_id: getSystemCategoryId(diff > 0 ? '雑益' : '雑損'),
      date: today(),
      memo: memo || '財布チェック差額調整',
      is_adjustment: true,
    };
    const created = await API.create('transactions', adjTx);
    adjTxId = created.id;
  }

  // 財布チェック記録
  await API.create('wallet_checks', {
    id: uuid(),
    check_date:  today(),
    account_id:  accId,
    actual_amount: actual,
    system_amount: sysBal,
    difference:  diff,
    adjustment_transaction_id: adjTxId,
    memo,
  });

  // 最終チェック日をLocalStorageに保存
  localStorage.setItem('lastWalletCheck', today());

  await loadAllData();
  closeModal('wallet-check');
  renderDashboard();
  showToast(diff === 0 ? '財布チェック完了（差額なし）' : `差額 ${fmtSigned(diff)} を自動調整しました`);
}

function checkWalletCheckDue() {
  const last = localStorage.getItem('lastWalletCheck');
  if (!last) {
    $('#wallet-check-banner').classList.remove('hidden');
    return;
  }
  const lastDate = new Date(last);
  const now = new Date();
  const diffDays = (now - lastDate) / (1000 * 60 * 60 * 24);
  if (diffDays >= 7) {
    $('#wallet-check-banner').classList.remove('hidden');
  }
}

/* ─── 移動記録 ─── */
function renderTravelLogs() {
  $('#tr-month-label').textContent = formatMonthLabel(App.trMonth);
  const container = $('#travel-logs-list');
  container.innerHTML = '';

  const logs = App.travelLogs.filter(l => l.date.startsWith(App.trMonth));
  if (logs.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-route"></i><p>移動記録がありません</p></div>';
    return;
  }

  logs.forEach(log => {
    const div = document.createElement('div');
    div.className = 'travel-item';
    div.innerHTML = `
      <div class="travel-route">
        <span>${esc(log.from_location || '?')}</span>
        <span style="color:var(--color-text-sub)">→</span>
        <span>${esc(log.to_location || '?')}</span>
        <span class="travel-transport-badge">${esc(log.transport_type || '')}</span>
      </div>
      <div class="travel-meta">
        <span>${formatDateShort(log.date)}${log.purpose ? ' · ' + esc(log.purpose) : ''}</span>
        ${log.amount ? `<span class="travel-amount-badge">-${fmt(log.amount)}</span>` : ''}
      </div>
      ${log.memo ? `<div style="font-size:12px;color:var(--color-text-sub);margin-top:4px">${esc(log.memo)}</div>` : ''}
    `;
    container.appendChild(div);
  });
}

/* ─── バックアップ ─── */
async function exportBackup() {
  const allAccounts     = await API.list('accounts');
  const allCategories   = await API.list('categories');
  const allTransactions = await API.list('transactions');
  const allWalletChecks = await API.list('wallet_checks');
  const allTravelLogs   = await API.list('travel_logs');

  const backup = {
    version: '1.0',
    exported_at: new Date().toISOString(),
    data: { accounts: allAccounts, categories: allCategories, transactions: allTransactions, wallet_checks: allWalletChecks, travel_logs: allTravelLogs }
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `kakeibo-backup-${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);

  const log = $('#backup-log');
  log.classList.remove('hidden');
  log.textContent = `✅ エクスポート完了\n取引: ${allTransactions.length}件\n口座: ${allAccounts.length}件\nカテゴリー: ${allCategories.length}件`;
}

async function importBackup(event) {
  const file = event.target.files[0];
  if (!file) return;

  const text = await file.text();
  let backup;
  try { backup = JSON.parse(text); } catch { showToast('JSONファイルが正しくありません'); return; }

  if (!backup.data) { showToast('バックアップ形式が不正です'); return; }

  const log = $('#backup-log');
  log.classList.remove('hidden');
  log.style.color = '#FF9500';
  log.textContent = '⏳ インポート中...';

  try {
    const d = backup.data;
    // 各テーブルに追加（重複はupsertせずスキップ - idで判定）
    let imported = 0;
    for (const table of ['accounts','categories','transactions','wallet_checks','travel_logs']) {
      const existing = await API.list(table);
      const existingIds = new Set(existing.map(r => r.id));
      const rows = d[table] || [];
      for (const row of rows) {
        if (!existingIds.has(row.id)) {
          await API.create(table, row);
          imported++;
        }
      }
    }
    log.style.color = '#34C759';
    log.textContent = `✅ インポート完了 (${imported}件追加)`;
    await loadAllData();
    renderDashboard();
    showToast('バックアップを復元しました');
  } catch (e) {
    log.style.color = '#FF3B30';
    log.textContent = '❌ インポートに失敗しました: ' + e.message;
  }

  event.target.value = '';
}

/* ─── ヘルパー ─── */
function computeAccountBalance(acc) {
  if (!acc) return 0;
  const txs = App.transactions.filter(t => !t.deleted);
  let bal = acc.initial_balance || 0;
  txs.forEach(tx => {
    if (tx.type === 'income'   && tx.account_id === acc.id) bal += tx.amount;
    if (tx.type === 'expense'  && tx.account_id === acc.id) bal -= tx.amount;
    if (tx.type === 'transfer' && tx.account_id === acc.id) bal -= tx.amount;
    if (tx.type === 'transfer' && tx.to_account_id === acc.id) bal += tx.amount;
  });
  return bal;
}

function filterByMonth(txs, mk) {
  return txs.filter(t => t.date && t.date.startsWith(mk));
}

function getSystemCategoryId(name) {
  const cat = App.categories.find(c => c.name === name);
  return cat?.id || '';
}

function formatDateDivider(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['日','月','火','水','木','金','土'];
  return `${d.getMonth()+1}月${d.getDate()}日（${days[d.getDay()]}）`;
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth()+1}/${d.getDate()}`;
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ─── モーダル ─── */
function openModal(name) {
  $(`#modal-${name}`).classList.remove('hidden');
}
function closeModal(name) {
  $(`#modal-${name}`).classList.add('hidden');
}

/* ─── 確認ダイアログ ─── */
let _confirmCallback = null;
function showConfirm(title, message, callback, okLabel = '削除') {
  $('#confirm-title').textContent   = title;
  $('#confirm-message').textContent = message;
  $('#btn-confirm-ok').textContent  = okLabel;
  _confirmCallback = callback;
  openModal('confirm');
}
// ← confirm OK は setupEventListeners 内に移動済み

/* ─── トースト ─── */
let _toastTimer = null;
function showToast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  el.classList.remove('hidden');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.classList.add('hidden'), 300);
  }, 2500);
}

/* ─── 起動 ─── */
window.addEventListener('DOMContentLoaded', init);
