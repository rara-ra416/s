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
    {id: 'c2', name: '日用品', type: 'expense'},
    {id: 'c3', name: '交際費', type: 'expense'},
    {id: 'c4', name: '給料', type: 'income'},
    {id: 'c5', name: 'お小遣い', type: 'income'}
  ];
  App.transactions = JSON.parse(localStorage.getItem('db_transactions')) || [];
}

function setupEvents() {
  // ナビゲーション
  $$('.nav-item').forEach(btn => {
    btn.onclick = () => showPage(btn.dataset.page);
  });
  $$('.back-btn').forEach(btn => {
    btn.onclick = () => showPage(btn.dataset.back);
  });

  // 収支タイプ切り替え
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

  // 保存処理
  $('#btn-save-transaction').onclick = () => {
    const amount = parseInt($('#input-amount').value);
    if (!amount) {
      alert('金額を入力してください');
      return;
    }
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

  // バックアップ
  $('#btn-backup').onclick = () => $('#modal-backup').classList.remove('hidden');
  $('.modal-close').onclick = () => $('#modal-backup').classList.add('hidden');
}

function showPage(id) {
  $$('.page').forEach(p => p.classList.remove('active'));
  $(`#page-${id}`).classList.add('active');
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === id));
  if (id === 'dashboard') renderDashboard();
  if (id === 'input') resetForm();
  if (id === 'report') renderReport();
}

function renderDashboard() {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const thisMonthTxs = App.transactions.filter(t => t.date.startsWith(currentMonth));
  
  const income = thisMonthTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = thisMonthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  $('#summary-income').textContent = '¥' + income.toLocaleString();
  $('#summary-expense').textContent = '¥' + expense.toLocaleString();
  $('#summary-balance').textContent = '¥' + (income - expense).toLocaleString();
  
  $('#account-list-dashboard').innerHTML = App.accounts.map(a => `
    <div style="display:flex; justify-content:space-between; padding:5px 0;">
      <span>${a.name}</span><span>¥${calculateBal(a.id).toLocaleString()}</span>
    </div>
  `).join('');

  $('#recent-transactions').innerHTML = App.transactions.slice(-5).reverse().map(t => `
    <div style="font-size:13px; margin-bottom:5px;">${t.date} ${t.memo || ''} ¥${t.amount.toLocaleString()}</div>
  `).join('');
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
  $('#input-amount').value = '';
  $('#input-memo').value = '';
  $('#input-date').value = new Date().toISOString().split('T')[0];
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

function renderReport() {
  const ctx = $('#monthly-bar-chart').getContext('2d');
  // 簡易的なグラフ表示（詳細はデータに合わせて拡張可能）
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['支出', '収入'],
      datasets: [{
        data: [
          App.transactions.filter(t => t.type === 'expense').reduce((s,t) => s+t.amount, 0),
          App.transactions.filter(t => t.type === 'income').reduce((s,t) => s+t.amount, 0)
        ],
        backgroundColor: ['#dc3545', '#28a745']
      }]
    },
    options: { plugins: { legend: { display: false } } }
  });
}
