'use strict';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
const fmt = (n) => (n || 0).toLocaleString() + '円';

const App = {
    currentPage: 'dashboard',
    currentMonth: new Date().toISOString().slice(0, 7), // YYYY-MM
    accounts: JSON.parse(localStorage.getItem('kb_acc') || '[{"id":"a1","name":"現金"},{"id":"a2","name":"銀行"}]'),
    categories: JSON.parse(localStorage.getItem('kb_cat') || '[]'),
    transactions: JSON.parse(localStorage.getItem('kb_tx') || '[]'),
    editingId: null, selectedType: 'expense', selectedCatId: null
};

// 初期カテゴリー
if (App.categories.length === 0) {
    App.categories = [
        { id: 'c1', name: '食費', icon: '🍔', type: 'expense' },
        { id: 'c2', name: '日用品', icon: '🧺', type: 'expense' },
        { id: 'c3', name: '給与', icon: '💰', type: 'income' }
    ];
    save();
}

function save() {
    localStorage.setItem('kb_acc', JSON.stringify(App.accounts));
    localStorage.setItem('kb_cat', JSON.stringify(App.categories));
    localStorage.setItem('kb_tx', JSON.stringify(App.transactions));
}

function init() {
    bindEvents();
    render();
}

function bindEvents() {
    // ページ遷移
    $$('.nav-item').forEach(el => el.onclick = () => {
        const p = el.dataset.page;
        if (p === 'input') openInput(); else navigate(p);
    });
    $$('.back-btn').forEach(el => el.onclick = () => navigate(el.dataset.back || 'dashboard'));
    
    // 月移動
    $('#btn-prev-month').onclick = () => shiftMonth(-1);
    $('#btn-next-month').onclick = () => shiftMonth(1);

    // 取引保存
    $('#btn-save-transaction').onclick = () => {
        const amt = parseInt($('#input-amount').value);
        if (!amt) return alert('金額を入力してください');
        const tx = {
            id: App.editingId || uuid(),
            amount: amt,
            type: App.selectedType,
            category_id: App.selectedCatId,
            account_id: $('#input-account').value,
            date: $('#input-date').value,
            memo: $('#input-memo').value
        };
        const idx = App.transactions.findIndex(t => t.id === tx.id);
        if (idx > -1) App.transactions[idx] = tx; else App.transactions.push(tx);
        save(); navigate('dashboard');
    };

    // タイプ切り替え
    $$('.type-tab').forEach(btn => btn.onclick = () => {
        App.selectedType = btn.dataset.type;
        $$('.type-tab').forEach(b => b.classList.toggle('active', b === btn));
        $('#group-category').classList.toggle('hidden', App.selectedType === 'transfer');
        $('#group-to-account').classList.toggle('hidden', App.selectedType !== 'transfer');
        renderCatPicker();
    });

    $$('.modal-close').forEach(el => el.onclick = () => closeModal(el.dataset.modal));
}

function render() {
    const [y, m] = App.currentMonth.split('-');
    $$('.month-label').forEach(el => el.textContent = `${y}年${m}月`);

    if (App.currentPage === 'dashboard') renderDash();
    if (App.currentPage === 'transactions') renderTransactions();
    if (App.currentPage === 'categories') renderCatList();
}

function renderDash() {
    const list = App.transactions.filter(t => t.date.startsWith(App.currentMonth));
    const inc = list.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = list.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    $('#summary-income').textContent = fmt(inc);
    $('#summary-expense').textContent = fmt(exp);
    $('#summary-balance').textContent = fmt(inc - exp);

    $('#recent-transactions').innerHTML = list.slice(0, 5).map(t => {
        const cat = App.categories.find(c => c.id === t.category_id) || {icon:'❓', name:'不明'};
        return `<div class="transaction-item compact" onclick="openInput('${t.id}')">
            <div>${cat.icon} ${t.memo || cat.name}</div>
            <div class="${t.type}">${fmt(t.amount)}</div>
        </div>`;
    }).join('');
}

function renderTransactions() {
    const list = App.transactions
        .filter(t => t.date.startsWith(App.currentMonth))
        .sort((a, b) => b.date.localeCompare(a.date));

    const groups = list.reduce((acc, t) => {
        if (!acc[t.date]) acc[t.date] = [];
        acc[t.date].push(t);
        return acc;
    }, {});

    let html = '';
    Object.keys(groups).forEach(date => {
        const d = new Date(date);
        const dayW = ['日','月','火','水','木','金','土'][d.getDay()];
        html += `<div class="date-header">${date.slice(5).replace('-', '月')}日(${dayW})</div>`;
        groups[date].forEach(t => {
            const acc = App.accounts.find(a => a.id === t.account_id) || { name: '現金' };
            html += `<div class="transaction-item compact" onclick="openInput('${t.id}')">
                <div class="tx-title">${acc.name}</div>
                <div class="tx-amount-plain">${fmt(t.amount)}</div>
            </div>`;
        });
    });
    $('#all-transactions').innerHTML = html || '<p style="text-align:center;padding:20px;">履歴なし</p>';
}

function openInput(id = null) {
    App.editingId = id;
    const t = App.transactions.find(x => x.id === id) || { amount: '', date: new Date().toISOString().slice(0, 10), type: 'expense' };
    $('#input-amount').value = t.amount;
    $('#input-date').value = t.date;
    $('#input-memo').value = t.memo || '';
    App.selectedType = t.type;
    App.selectedCatId = t.category_id;
    $('#input-account').innerHTML = App.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    renderCatPicker();
    navigate('input');
}

function renderCatPicker() {
    const cats = App.categories.filter(c => c.type === App.selectedType || c.type === 'both');
    $('#category-picker').innerHTML = cats.map(c => `
        <div class="cat-chip ${c.id === App.selectedCatId ? 'selected' : ''}" onclick="App.selectedCatId='${c.id}';renderCatPicker()">
            <span style="font-size:1.5rem">${c.icon}</span><span>${c.name}</span>
        </div>`).join('');
}

function shiftMonth(dir) {
    const [y, m] = App.currentMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + dir, 1);
    App.currentMonth = d.toISOString().slice(0, 7);
    render();
}

function navigate(p) {
    App.currentPage = p;
    $$('.page').forEach(el => el.classList.toggle('active', el.id === `page-${p}`));
    $$('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === p));
    render();
}

function closeModal(n) { $(`#modal-${n}`).classList.add('hidden'); }

document.addEventListener('DOMContentLoaded', init);
