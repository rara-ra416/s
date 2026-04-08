'use strict';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const uuid = () => crypto.randomUUID();
const fmt = (n) => '¥' + Math.abs(n).toLocaleString();

const App = {
    accounts: [],
    categories: [],
    transactions: [],
    selectedTxType: 'expense',
    selectedCategoryId: null,
    barChart: null
};

/* 初期起動 */
window.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    setupNavigation();
    setupInputLogic();
    renderDashboard();
});

async function loadData() {
    App.accounts = JSON.parse(localStorage.getItem('db_accounts') || '[]');
    App.categories = JSON.parse(localStorage.getItem('db_categories') || '[]');
    App.transactions = JSON.parse(localStorage.getItem('db_transactions') || '[]');

    // データが空の場合の初期値
    if (App.accounts.length === 0) {
        App.accounts = [{id: 'a1', name: '財布', initial_balance: 0}, {id: 'a2', name: '銀行', initial_balance: 0}];
        localStorage.setItem('db_accounts', JSON.stringify(App.accounts));
    }
    if (App.categories.length === 0) {
        App.categories = [
            {id: 'c1', name: '食費', type: 'expense', icon: '🍽️'},
            {id: 'c2', name: '収入', type: 'income', icon: '💰'}
        ];
        localStorage.setItem('db_categories', JSON.stringify(App.categories));
    }
}

/* ナビゲーション */
function setupNavigation() {
    $$('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = btn.dataset.page;
            showPage(page);
        });
    });
    $$('.back-btn').forEach(btn => {
        btn.addEventListener('click', () => showPage(btn.dataset.back));
    });
}

function showPage(id) {
    $$('.page').forEach(p => p.classList.remove('active'));
    $(`#page-${id}`).classList.add('active');
    $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === id));

    if (id === 'dashboard') renderDashboard();
    if (id === 'report') renderReport();
    if (id === 'input') resetForm();
}

/* 入力画面 */
function setupInputLogic() {
    $$('.type-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            $$('.type-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            App.selectedTxType = tab.dataset.type;
            $('#group-category').classList.toggle('hidden', App.selectedTxType === 'transfer');
            $('#group-to-account').classList.toggle('hidden', App.selectedTxType !== 'transfer');
            renderCategoryPicker();
        });
    });

    $('#btn-save-transaction').onclick = async () => {
        const val = parseInt($('#input-amount').value);
        if (!val) return;

        const tx = {
            id: uuid(),
            amount: val,
            type: App.selectedTxType,
            date: $('#input-date').value || new Date().toISOString().split('T')[0],
            account_id: $('#input-account').value,
            to_account_id: App.selectedTxType === 'transfer' ? $('#input-to-account').value : null,
            category_id: App.selectedCategoryId,
            memo: $('#input-memo').value
        };

        App.transactions.push(tx);
        localStorage.setItem('db_transactions', JSON.stringify(App.transactions));
        showToast('保存しました');
        showPage('dashboard');
    };
}

function resetForm() {
    $('#input-amount').value = '';
    const accOptions = App.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    $('#input-account').innerHTML = accOptions;
    $('#input-to-account').innerHTML = accOptions;
    renderCategoryPicker();
}

function renderCategoryPicker() {
    const cont = $('#category-picker');
    const filtered = App.categories.filter(c => c.type === App.selectedTxType);
    cont.innerHTML = filtered.map(c => `
        <div class="category-chip ${App.selectedCategoryId === c.id ? 'active' : ''}" onclick="App.selectedCategoryId='${c.id}'; renderCategoryPicker();">
            ${c.icon}<br>${c.name}
        </div>
    `).join('');
}

/* 描画 */
function renderDashboard() {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const txs = App.transactions.filter(t => t.date.startsWith(currentMonth));
    
    const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    $('#summary-income').textContent = fmt(income);
    $('#summary-expense').textContent = fmt(expense);
    $('#summary-balance').textContent = fmt(income - expense);

    // 口座リスト表示
    $('#account-list-dashboard').innerHTML = App.accounts.map(a => `
        <div class="transaction-item">
            <div style="flex:1">${a.name}</div>
            <div>${fmt(calculateBal(a.id))}</div>
        </div>
    `).join('');
}

function calculateBal(id) {
    const acc = App.accounts.find(a => a.id === id);
    let bal = acc.initial_balance || 0;
    App.transactions.forEach(t => {
        if (t.account_id === id) {
            if (t.type === 'expense' || t.type === 'transfer') bal -= t.amount;
            if (t.type === 'income') bal += t.amount;
        }
        if (t.to_account_id === id && t.type === 'transfer') bal += t.amount;
    });
    return bal;
}

function showToast(m) {
    const t = $('#toast');
    t.textContent = m;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2000);
}

function renderReport() {
    const ctx = $('#monthly-bar-chart').getContext('2d');
    if (App.barChart) App.barChart.destroy();
    App.barChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: ['今月'], datasets: [{label: '支出', data: [1000], backgroundColor: '#FF3B30'}] },
        options: { responsive: true, maintainAspectRatio: false }
    });
}
