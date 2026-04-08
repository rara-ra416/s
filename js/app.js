'use strict';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const App = {
  accounts: [],
  categories: [],
  transactions: [],
  selectedTxType: 'expense',
  selectedCategoryId: null
};

window.addEventListener('DOMContentLoaded', async () => {
  initData();
  setupEvents();
  renderDashboard();
});

function initData() {
  App.accounts = JSON.parse(localStorage.getItem('db_accounts')) || [
    {id: '1', name: '財布', initial_balance: 0},
    {id: '2', name: '銀行', initial_balance: 0}
  ];
  App.categories = JSON.parse(localStorage.getItem('db_categories')) || [
    {id: 'c1', name: '食費', type: 'expense'},
    {id: 'c2', name: '給料', type: 'income'}
  ];
  App.transactions = JSON.parse(localStorage.getItem('db_transactions')) || [];
}

function setupEvents() {
  $$('.nav-item').forEach(btn => {
    btn.onclick = () => showPage(btn.dataset.page);
  });
  $$('.back-btn').forEach(btn => {
    btn.onclick = () => showPage(btn.dataset.back);
  });

  $$('.type-tab').forEach(tab => {
    tab.onclick = () => {
      $$('.type-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      App.selectedTxType = tab.dataset.type;
      $('#group-category').classList.toggle('hidden', App.selectedTxType === 'transfer');
      $('#group-to-account').classList.toggle('hidden', App.selectedTxType !== 'transfer');
      renderCategoryPicker();
    };
  });

  $('#btn-save-transaction').onclick = () => {
    const amount = parseInt($('#input-amount').value);
    if (!amount) return;
    const tx = {
      id: Date.now().toString(),
      amount: amount,
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

  $('#btn-backup').onclick = () => $('#modal-backup').classList.remove('hidden');
  $('.modal-close').onclick = () => $('#modal-backup').classList.add('hidden');
}

function showPage(id) {
  $$('.page').forEach(p => p.classList.remove('active'));
  $(`#page-${id}`).classList.add('active');
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === id));
  if (id === 'dashboard') renderDashboard();
  if (id === 'input') resetForm();
}

function renderDashboard() {
  $('#summary-income').textContent = '¥' + calculateTotal('income').toLocaleString();
  $('#summary-expense').textContent = '¥' + calculateTotal('expense').toLocaleString();
  
  $('#account-list-dashboard').innerHTML = App.accounts.map(a => `
    <div>${a.name}: ¥${calculateBal(a.id).toLocaleString()}</div>
  `).join('');

  $('#recent-transactions').innerHTML = App.transactions.slice(-5).reverse().map(t => `
    <div>${t.date} ${t.amount.toLocaleString()}</div>
  `).join('');
}

function calculateTotal(type) {
  return App.transactions.filter(t => t.type === type).reduce((s, t) => s + t.amount, 0);
}

function calculateBal(id) {
  let bal = App.accounts.find(a => a.id === id).initial_balance;
  App.transactions.forEach(t => {
    if (t.account_id === id) {
      if (t.type === 'expense' || t.type === 'transfer') bal -= t.amount;
      if (t.type === 'income') bal += t.amount;
    }
    if (t.to_account_id === id && t.type === 'transfer') bal += t.amount;
  });
  return bal;
}

function resetForm() {
  const opts = App.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  $('#input-account').innerHTML = opts;
  $('#input-to-account').innerHTML = opts;
  renderCategoryPicker();
}

function renderCategoryPicker() {
  const filtered = App.categories.filter(c => c.type === App.selectedTxType);
  $('#category-picker').innerHTML = filtered.map(c => `
    <div class="category-chip ${App.selectedCategoryId === c.id ? 'active' : ''}" onclick="App.selectedCategoryId='${c.id}'; renderCategoryPicker();">
      ${c.name}
    </div>
  `).join('');
}

function showToast(m) {
  const t = $('#toast');
  t.textContent = m;
  t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 2000);
}
