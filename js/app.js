'use strict';

/** ─── ユーティリティ ─── **/
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
const fmt = (n) => '¥' + Math.abs(n || 0).toLocaleString('ja-JP');
const fmtSigned = (n) => (n >= 0 ? '+¥' : '-¥') + Math.abs(n || 0).toLocaleString('ja-JP');
const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD
const monthKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
const parseMonth = (s) => {
    const p = s.split('-');
    return { y: parseInt(p[0]), m: parseInt(p[1]) };
};

/** ─── データベース (LocalStorage) ─── **/
const DB = {
    get(k) { return JSON.parse(localStorage.getItem(`kb_v3_${k}`) || '[]'); },
    set(k, v) { localStorage.setItem(`kb_v3_${k}`, JSON.stringify(v)); },
    async list(k) { return this.get(k); },
    async save(k, data) {
        const list = this.get(k);
        const idx = list.findIndex(item => item.id === data.id);
        if (idx > -1) list[idx] = data; else list.push(data);
        this.set(k, list);
        return data;
    },
    async remove(k, id) {
        const list = this.get(k).filter(item => item.id !== id);
        this.set(k, list);
    }
};

/** ─── アプリケーション状態 ─── **/
const App = {
    currentPage: 'dashboard',
    currentMonth: monthKey(new Date().getFullYear(), new Date().getMonth() + 1),
    accounts: [],
    categories: [],
    transactions: [],
    chart: null,
    // 編集用
    editingId: null,
    selectedType: 'expense',
    selectedCatId: null,
    // フィルタ
    filter: { type: '', account: '', category: '' }
};

const ICONS = { cash: '💴', bank: '🏦', credit: '💳', 'e-money': '📱', other: '📦' };

/** ─── 初期化 ─── **/
async function init() {
    await reloadData();
    // デフォルトデータの投入
    if (App.categories.length === 0) {
        const dats = [
            { id: 'c1', name: '食費', icon: '🍔', type: 'expense', color: '#ff6b6b' },
            { id: 'c2', name: '日用品', icon: '🧺', type: 'expense', color: '#fcc419' },
            { id: 'c3', name: '給与', icon: '💰', type: 'income', color: '#4dabf7' }
        ];
        for (const c of dats) await DB.save('categories', c);
        await reloadData();
    }
    bindEvents();
    render();
}

async function reloadData() {
    [App.accounts, App.categories, App.transactions] = await Promise.all([
        DB.list('accounts'), DB.list('categories'), DB.list('transactions')
    ]);
    App.transactions.sort((a, b) => b.date.localeCompare(a.date));
}

/** ─── イベントバインド ─── **/
function bindEvents() {
    // ページ切替
    $$('.nav-item').forEach(el => el.onclick = () => {
        const p = el.dataset.page;
        p === 'input' ? openInput() : navigate(p);
    });
    $('#btn-go-accounts').onclick = () => navigate('accounts');
    $('#btn-go-transactions').onclick = () => navigate('transactions');
    $$('.back-btn').forEach(el => el.onclick = () => navigate(el.dataset.back || 'dashboard'));

    // 入力フォーム
    $$('.type-tab[data-type]').forEach(el => el.onclick = () => {
        App.selectedType = el.dataset.type;
        $$('.type-tab[data-type]').forEach(b => b.classList.toggle('active', b === el));
        $('#group-category').classList.toggle('hidden', App.selectedType === 'transfer');
        $('#group-to-account').classList.toggle('hidden', App.selectedType !== 'transfer');
        $('#group-travel').classList.toggle('hidden', App.selectedType !== 'expense');
        renderCatPicker();
    });
    $('#toggle-travel').onchange = (e) => $('#travel-input-area').classList.toggle('hidden', !e.target.checked);
    $('#btn-save-transaction').onclick = saveTx;
    $('#btn-delete-transaction').onclick = deleteTx;

    // 履歴フィルタ
    $('#btn-filter-transactions').onclick = () => {
        $('#filter-panel').classList.toggle('hidden');
        $('#filter-account').innerHTML = '<option value="">すべての口座</option>' + App.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
        $('#filter-category').innerHTML = '<option value="">すべてのカテゴリー</option>' + App.categories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
    };
    $('#filter-type').onchange = (e) => { App.filter.type = e.target.value; renderTransactions(); };
    $('#filter-account').onchange = (e) => { App.filter.account = e.target.value; renderTransactions(); };
    $('#filter-category').onchange = (e) => { App.filter.category = e.target.value; renderTransactions(); };
    $('#btn-filter-clear').onclick = () => {
        App.filter = { type: '', account: '', category: '' };
        $('#filter-type').value = $('#filter-account').value = $('#filter-category').value = '';
        renderTransactions();
    };

    // 月ナビ (全画面)
    const pairs = [['#btn-prev-month', '#btn-next-month'], ['#btn-prev-month-tx', '#btn-next-month-tx'], ['#btn-prev-month-rp', '#btn-next-month-rp'], ['#btn-prev-month-tr', '#btn-next-month-tr']];
    pairs.forEach(([p, n]) => {
        $(p).onclick = () => shiftMonth(-1);
        $(n).onclick = () => shiftMonth(1);
    });

    // モーダル
    $$('.modal-close').forEach(el => el.onclick = () => closeModal(el.dataset.modal));
    $('#btn-wallet-check').onclick = () => openWalletModal();
    $('#btn-wallet-check-banner').onclick = () => openWalletModal();
    $('#btn-confirm-wallet-check').onclick = confirmWallet;
    $('#wc-actual-amount').oninput = updateWCDiff;

    // 口座管理
    $('#btn-add-account').onclick = () => openAccModal();
    $('#btn-save-account').onclick = saveAcc;
    $('#btn-delete-account').onclick = deleteAcc;
    $$('.actype-btn').forEach(el => el.onclick = () => {
        $$('.actype-btn').forEach(b => b.classList.remove('active'));
        el.classList.add('active');
    });

    // バックアップ
    $('#btn-backup').onclick = () => openModal('backup');
    $('#btn-export-backup').onclick = () => {
        const blob = new Blob([JSON.stringify({ accounts: App.accounts, categories: App.categories, transactions: App.transactions }, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `backup_${today()}.json`; a.click();
    };
    $('#import-file').onchange = (e) => {
        const fr = new FileReader();
        fr.onload = () => {
            const d = JSON.parse(fr.result);
            DB.set('accounts', d.accounts); DB.set('categories', d.categories); DB.set('transactions', d.transactions);
            location.reload();
        };
        fr.readAsText(e.target.files[0]);
    };
}

/** ─── 描画 ─── **/
function render() {
    const { y, m } = parseMonth(App.currentMonth);
    $$('.month-label').forEach(el => el.textContent = `${y}年${m}月`);
    if (App.currentPage === 'dashboard') renderDash();
    if (App.currentPage === 'transactions') renderTransactions();
    if (App.currentPage === 'accounts') renderAccList();
    if (App.currentPage === 'report') renderReport();
    if (App.currentPage === 'travel') renderTravel();
}

function renderDash() {
    const txs = App.transactions.filter(t => t.date.startsWith(App.currentMonth));
    const inc = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    $('#summary-income').textContent = fmt(inc);
    $('#summary-expense').textContent = fmt(exp);
    $('#summary-balance').textContent = fmtSigned(inc - exp);
    $('#account-list-dashboard').innerHTML = App.accounts.map(a => `
        <div class="account-item">
            <div class="account-icon">${ICONS[a.account_type] || '💴'}</div>
            <div class="account-info"><div>${a.name}</div></div>
            <div class="account-balance-text">${fmt(getBal(a))}</div>
        </div>`).join('');
    $('#recent-transactions').innerHTML = App.transactions.slice(0, 5).map(t => txHtml(t)).join('');
}

function renderTransactions() {
    let list = App.transactions.filter(t => t.date.startsWith(App.currentMonth));
    if (App.filter.type) list = list.filter(t => t.type === App.filter.type);
    if (App.filter.account) list = list.filter(t => t.account_id === App.filter.account || t.to_account_id === App.filter.account);
    if (App.filter.category) list = list.filter(t => t.category_id === App.filter.category);
    $('#all-transactions').innerHTML = list.length ? list.map(t => txHtml(t)).join('') : '<p class="empty-msg">なし</p>';
}

const txHtml = (t) => {
    const c = App.categories.find(x => x.id === t.category_id);
    const a = App.accounts.find(x => x.id === t.account_id);
    return `
    <div class="transaction-item" onclick="openInput('${t.id}')">
        <div class="tx-icon">${t.type === 'transfer' ? '🔄' : (c ? c.icon : '❓')}</div>
        <div class="tx-info">
            <div class="tx-title">${t.type === 'transfer' ? '移動' : (t.memo || (c ? c.name : '不明'))}</div>
            <div class="tx-sub">${t.date} · ${a ? a.name : ''}</div>
        </div>
        <div class="tx-amount ${t.type}">${t.type === 'expense' ? '-' : t.type === 'income' ? '+' : ''}${fmt(t.amount)}</div>
    </div>`;
};

/** ─── 業務ロジック ─── **/
function openInput(id = null) {
    App.editingId = id;
    const t = App.transactions.find(x => x.id === id);
    $('#input-page-title').textContent = id ? '取引を編集' : '新規入力';
    $('#input-amount').value = t ? t.amount : '';
    $('#input-date').value = t ? t.date : today();
    $('#input-memo').value = t ? t.memo : '';
    App.selectedType = t ? t.type : 'expense';
    App.selectedCatId = t ? t.category_id : null;
    const opts = App.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    $('#input-account').innerHTML = opts; $('#input-to-account').innerHTML = opts;
    if (t) {
        $('#input-account').value = t.account_id;
        if (t.type === 'transfer') $('#input-to-account').value = t.to_account_id;
    }
    $$('.type-tab').forEach(b => b.classList.toggle('active', b.dataset.type === App.selectedType));
    $('#group-delete').classList.toggle('hidden', !id);
    renderCatPicker();
    navigate('input');
}

function renderCatPicker() {
    const cats = App.categories.filter(c => c.type === App.selectedType || c.type === 'both');
    $('#category-picker').innerHTML = cats.map(c => `
        <button class="cat-chip ${c.id === App.selectedCatId ? 'selected' : ''}" onclick="App.selectedCatId='${c.id}';renderCatPicker()">
            <span>${c.icon}</span><span>${c.name}</span>
        </button>`).join('');
}

async function saveTx() {
    const amt = parseInt($('#input-amount').value);
    if (!amt) return alert('金額を入力してください');
    const data = {
        id: App.editingId || uuid(), type: App.selectedType, amount: amt,
        account_id: $('#input-account').value,
        to_account_id: App.selectedType === 'transfer' ? $('#input-to-account').value : '',
        category_id: App.selectedCatId, date: $('#input-date').value, memo: $('#input-memo').value,
        travel: (App.selectedType === 'expense' && $('#toggle-travel').checked) ? {
            from: $('#travel-from').value, to: $('#travel-to').value, transport: $('#travel-transport').value, purpose: $('#travel-purpose').value
        } : null
    };
    await DB.save('transactions', data); await reloadData(); navigate('dashboard');
}

async function deleteTx() {
    if (confirm('削除しますか？')) { await DB.remove('transactions', App.editingId); await reloadData(); navigate('dashboard'); }
}

/** ─── レポート ─── **/
function renderReport() {
    const txs = App.transactions.filter(t => t.date.startsWith(App.currentMonth));
    const inc = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    $('#rp-income').textContent = fmt(inc); $('#rp-expense').textContent = fmt(exp); $('#rp-balance').textContent = fmtSigned(inc - exp);

    if (App.chart) App.chart.destroy();
    App.chart = new Chart($('#monthly-bar-chart'), {
        type: 'bar',
        data: { labels: ['今月'], datasets: [{ label: '収入', data: [inc], backgroundColor: '#4dabf7' }, { label: '支出', data: [exp], backgroundColor: '#ff6b6b' }] },
        options: { responsive: true, maintainAspectRatio: false }
    });

    const b = {}; txs.filter(t => t.type === 'expense').forEach(t => b[t.category_id] = (b[t.category_id] || 0) + t.amount);
    $('#category-breakdown').innerHTML = Object.entries(b).map(([cid, v]) => {
        const c = App.categories.find(x => x.id === cid);
        return `<div class="breakdown-item"><span>${c ? c.icon + c.name : '？'}</span><span>${fmt(v)}</span></div>`;
    }).join('');
}

/** ─── 財布チェック ─── **/
function openWalletModal() {
    const ws = App.accounts.filter(a => a.is_wallet);
    if (!ws.length) return alert('財布口座が設定されていません');
    $('#wc-account').innerHTML = ws.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    $('#wc-actual-amount').value = ''; updateWCDiff(); openModal('wallet-check');
}
function updateWCDiff() {
    const a = App.accounts.find(x => x.id === $('#wc-account').value);
    const s = a ? getBal(a) : 0;
    const v = parseInt($('#wc-actual-amount').value) || 0;
    $('#wc-system-amount').textContent = fmt(s);
    $('#wc-diff-display').classList.toggle('hidden', !$('#wc-actual-amount').value);
    $('#wc-diff-value').textContent = fmtSigned(v - s);
}
async function confirmWallet() {
    const aid = $('#wc-account').value;
    const diff = (parseInt($('#wc-actual-amount').value) || 0) - getBal(App.accounts.find(x => x.id === aid));
    if (diff !== 0) await DB.save('transactions', { id: uuid(), type: diff > 0 ? 'income' : 'expense', amount: Math.abs(diff), account_id: aid, date: today(), memo: '財布チェック調整' });
    await reloadData(); closeModal('wallet-check'); render();
}

/** ─── 口座 ─── **/
function renderAccList() {
    $('#accounts-list').innerHTML = App.accounts.map(a => `
        <div class="account-item" onclick="openAccModal('${a.id}')">
            <div class="account-info"><div class="account-name">${a.name} ${a.is_wallet ? '👛' : ''}</div></div>
            <div class="account-balance-text">${fmt(getBal(a))}</div>
        </div>`).join('');
}
function openAccModal(id = null) {
    App.editingId = id; const a = App.accounts.find(x => x.id === id);
    $('#account-name').value = a ? a.name : ''; $('#account-balance').value = a ? a.initial_balance : 0; $('#account-is-wallet').checked = a ? a.is_wallet : false;
    $('#account-delete-group').classList.toggle('hidden', !id); openModal('account');
}
async function saveAcc() {
    const t = $('.actype-btn.active').dataset.type;
    await DB.save('accounts', { id: App.editingId || uuid(), name: $('#account-name').value, account_type: t, initial_balance: parseInt($('#account-balance').value) || 0, is_wallet: $('#account-is-wallet').checked });
    await reloadData(); closeModal('account'); render();
}
async function deleteAcc() { if (confirm('削除？')) { await DB.remove('accounts', App.editingId); await reloadData(); closeModal('account'); render(); } }

/** ─── 移動 ─── **/
function renderTravel() {
    const logs = App.transactions.filter(t => t.date.startsWith(App.currentMonth) && t.travel);
    $('#travel-logs-list').innerHTML = logs.map(t => `<div class="transaction-item"><div class="tx-info"><div class="tx-title">${t.travel.from} → ${t.travel.to}</div><div class="tx-sub">${t.date} · ${t.travel.transport}</div></div></div>`).join('');
}

/** ─── 共通 ─── **/
function getBal(a) {
    let b = a.initial_balance || 0;
    App.transactions.forEach(t => {
        if (t.account_id === a.id) b += (t.type === 'income' ? t.amount : -t.amount);
        if (t.type === 'transfer' && t.to_account_id === a.id) b += t.amount;
    });
    return b;
}
function navigate(p) {
    App.currentPage = p; $$('.page').forEach(el => el.classList.toggle('active', el.id === `page-${p}`));
    $$('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === p));
    render();
}
function openModal(n) { $(`#modal-${n}`).classList.remove('hidden'); }
function closeModal(n) { $(`#modal-${n}`).classList.add('hidden'); }
function shiftMonth(d) {
    const { y, m } = parseMonth(App.currentMonth);
    const dt = new Date(y, m - 1 + d, 1);
    App.currentMonth = monthKey(dt.getFullYear(), dt.getMonth() + 1);
    render();
}

document.addEventListener('DOMContentLoaded', init);
