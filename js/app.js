/* =====================================================
    かけいぼ - メインアプリロジック (LocalStorage版)
   ===================================================== */

'use strict';

/* ─── ユーティリティ ─── */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
const fmt = (n) => '¥' + Math.abs(n).toLocaleString('ja-JP');
const today = () => new Date().toISOString().split('T')[0];
const monthKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`;

/* ─── API ラッパー ─── */
const API = {
    async list(table) {
        const data = localStorage.getItem(`db_${table}`);
        return data ? JSON.parse(data) : [];
    },
    async create(table, data) {
        const list = await this.list(table);
        list.push(data);
        localStorage.setItem(`db_${table}`, JSON.stringify(list));
        return data;
    },
    async update(table, id, data) {
        let list = await this.list(table);
        list = list.map(item => item.id === id ? { ...item, ...data } : item);
        localStorage.setItem(`db_${table}`, JSON.stringify(list));
    },
    async delete(table, id) {
        let list = await this.list(table);
        list = list.filter(item => item.id !== id);
        localStorage.setItem(`db_${table}`, JSON.stringify(list));
    }
};

/* ─── アプリ状態 ─── */
const App = {
    accounts: [],
    categories: [],
    transactions: [],
    currentMonth: monthKey(new Date().getFullYear(), new Date().getMonth() + 1),
    selectedTxType: 'expense', // income, expense, transfer
    selectedCategoryId: null,
    editingTxId: null,
    barChart: null
};

/* ─── 初期化 ─── */
window.addEventListener('DOMContentLoaded', async () => {
    await ensureDefaultData();
    await loadAllData();
    setupNavigation();
    setupInputEvents();
    setupBackupEvents();
    renderDashboard();
});

async function ensureDefaultData() {
    const cats = await API.list('categories');
    if (cats.length === 0) {
        const defaults = [
            { id: uuid(), name: '食費', type: 'expense', icon: '🍽️', color: '#FF6B6B', is_active: true },
            { id: uuid(), name: '交通費', type: 'expense', icon: '🚃', color: '#4ECDC4', is_active: true },
            { id: uuid(), name: '日用品', type: 'expense', icon: '🛒', color: '#45B7D1', is_active: true },
            { id: uuid(), name: '給与', type: 'income', icon: '💰', color: '#34C759', is_active: true }
        ];
        for (const c of defaults) await API.create('categories', c);
    }
    const accs = await API.list('accounts');
    if (accs.length === 0) {
        const defaults = [
            { id: uuid(), name: '財布', type: 'cash', balance: 0, initial_balance: 0, is_active: true },
            { id: uuid(), name: '銀行', type: 'bank', balance: 0, initial_balance: 0, is_active: true }
        ];
        for (const a of defaults) await API.create('accounts', a);
    }
}

async function loadAllData() {
    App.accounts = await API.list('accounts');
    App.categories = await API.list('categories');
    const allTx = await API.list('transactions');
    App.transactions = allTx.sort((a, b) => b.date.localeCompare(a.date));
}

/* ─── ナビゲーション制御 ─── */
function setupNavigation() {
    $$('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const pageId = btn.dataset.page;
            showPage(pageId);
        });
    });

    $$('.back-btn').forEach(btn => {
        btn.addEventListener('click', () => showPage(btn.dataset.back));
    });

    // ダッシュボード内の「管理」ボタンなど
    $('#btn-go-accounts')?.addEventListener('click', () => showPage('settings'));
    $('#btn-go-transactions')?.addEventListener('click', () => showPage('transactions'));
}

function showPage(pageId) {
    $$('.page').forEach(p => p.classList.remove('active'));
    $(`#page-${pageId}`).classList.add('active');
    
    $$('.nav-item').forEach(n => {
        n.classList.toggle('active', n.dataset.page === (pageId === 'input' ? 'input' : pageId));
    });

    if (pageId === 'dashboard') renderDashboard();
    if (pageId === 'transactions') renderTransactions();
    if (pageId === 'report') renderReport();
    if (pageId === 'input') resetInputForm();
}

/* ─── 入力画面ロジック ─── */
function setupInputEvents() {
    // 収支タイプの切り替え
    $$('.type-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            $$('.type-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            App.selectedTxType = tab.dataset.type;
            
            // 振替（transfer）の場合はカテゴリーを隠し、移動先を表示
            $('#group-category').classList.toggle('hidden', App.selectedTxType === 'transfer');
            $('#group-to-account').classList.toggle('hidden', App.selectedTxType !== 'transfer');
            
            renderCategoryPicker();
        });
    });

    // 保存ボタン
    $('#btn-save-transaction').addEventListener('click', async () => {
        const amount = parseInt($('#input-amount').value);
        if (!amount) return showToast('金額を入力してください');

        const tx = {
            id: App.editingTxId || uuid(),
            type: App.selectedTxType,
            amount: amount,
            date: $('#input-date').value || today(),
            account_id: $('#input-account').value,
            to_account_id: App.selectedTxType === 'transfer' ? $('#input-to-account').value : null,
            category_id: App.selectedTxType === 'transfer' ? null : App.selectedCategoryId,
            memo: $('#input-memo').value
        };

        if (App.editingTxId) {
            await API.update('transactions', App.editingTxId, tx);
        } else {
            await API.create('transactions', tx);
        }

        showToast('保存しました');
        await loadAllData();
        showPage('dashboard');
    });
}

function resetInputForm() {
    App.editingTxId = null;
    $('#input-page-title').textContent = '新規入力';
    $('#input-amount').value = '';
    $('#input-date').value = today();
    $('#input-memo').value = '';
    
    const accountOptions = App.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    $('#input-account').innerHTML = accountOptions;
    $('#input-to-account').innerHTML = accountOptions;

    renderCategoryPicker();
}

function renderCategoryPicker() {
    const container = $('#category-picker');
    const filtered = App.categories.filter(c => c.type === App.selectedTxType);
    
    container.innerHTML = filtered.map(c => `
        <div class="category-chip ${App.selectedCategoryId === c.id ? 'active' : ''}" 
             onclick="App.selectedCategoryId='${c.id}'; renderCategoryPicker();"
             style="--cat-color: ${c.color}">
            <span>${c.icon} ${c.name}</span>
        </div>
    `).join('');
}

/* ─── 描画ロジック ─── */
function renderDashboard() {
    // 1. 残高計算
    let totalIncome = 0, totalExpense = 0;
    const currentMonthTx = App.transactions.filter(tx => tx.date.startsWith(App.currentMonth));
    
    currentMonthTx.forEach(tx => {
        if (tx.type === 'income') totalIncome += tx.amount;
        if (tx.type === 'expense') totalExpense += tx.amount;
    });

    $('#summary-income').textContent = fmt(totalIncome);
    $('#summary-expense').textContent = fmt(totalExpense);
    $('#summary-balance').textContent = fmt(totalIncome - totalExpense);

    // 2. 口座一覧
    const accList = $('#account-list-dashboard');
    accList.innerHTML = App.accounts.map(acc => {
        const balance = calculateAccountBalance(acc.id);
        return `
            <div class="account-item">
                <div class="account-info">
                    <span class="account-name">${acc.name}</span>
                </div>
                <span class="account-amount">${fmt(balance)}</span>
            </div>
        `;
    }).join('');

    // 3. 最近の取引
    const recentList = $('#recent-transactions');
    recentList.innerHTML = App.transactions.slice(0, 5).map(tx => renderTxItem(tx)).join('');
}

function calculateAccountBalance(accId) {
    const acc = App.accounts.find(a => a.id === accId);
    let bal = acc.initial_balance || 0;
    App.transactions.forEach(tx => {
        if (tx.account_id === accId) {
            if (tx.type === 'expense' || tx.type === 'transfer') bal -= tx.amount;
            if (tx.type === 'income') bal += tx.amount;
        }
        if (tx.to_account_id === accId && tx.type === 'transfer') {
            bal += tx.amount;
        }
    });
    return bal;
}

function renderTxItem(tx) {
    const cat = App.categories.find(c => c.id === tx.category_id) || { icon: '🔄', name: '振替', color: '#8E8E93' };
    const isMinus = tx.type === 'expense' || tx.type === 'transfer';
    return `
        <div class="transaction-item">
            <div class="tx-icon" style="background: ${cat.color}20; color: ${cat.color}">${cat.icon}</div>
            <div class="tx-info">
                <div class="tx-title">${tx.memo || cat.name}</div>
                <div class="tx-date">${tx.date}</div>
            </div>
            <div class="tx-amount ${isMinus ? 'minus' : 'plus'}">
                ${isMinus ? '-' : '+'}${fmt(tx.amount)}
            </div>
        </div>
    `;
}

/* ─── レポート（Chart.js） ─── */
function renderReport() {
    const ctx = $('#monthly-bar-chart').getContext('2d');
    if (App.barChart) App.barChart.destroy();

    // 直近3ヶ月のラベルを作成
    const labels = ['2月', '3月', '4月']; 
    const incomeData = [45000, 52000, 48000]; // 実際はApp.transactionsから集計
    const expenseData = [38000, 41000, 43000];

    App.barChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: '収入', data: incomeData, backgroundColor: '#34C759', borderRadius: 4 },
                { label: '支出', data: expenseData, backgroundColor: '#FF3B30', borderRadius: 4 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, grid: { display: false } }, x: { grid: { display: false } } },
            plugins: { legend: { display: false } }
        }
    });
}

/* ─── バックアップ機能 ─── */
function setupBackupEvents() {
    $('#btn-backup')?.addEventListener('click', () => {
        $('#modal-backup').classList.remove('hidden');
    });

    $('#btn-export-json')?.addEventListener('click', () => {
        const fullData = {
            db_accounts: localStorage.getItem('db_accounts'),
            db_categories: localStorage.getItem('db_categories'),
            db_transactions: localStorage.getItem('db_transactions')
        };
        const blob = new Blob([JSON.stringify(fullData)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kakeibo_backup_${today()}.json`;
        a.click();
        showToast('エクスポート完了');
    });

    $('#import-json')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = async (event) => {
            const data = JSON.parse(event.target.result);
            Object.keys(data).forEach(key => localStorage.setItem(key, data[key]));
            showToast('復元しました');
            location.reload();
        };
        reader.readAsText(file);
    });
}

function showToast(msg) {
    const toast = $('#toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}
