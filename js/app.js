/* =====================================================
   かけいぼ - メインアプリロジック (タブ切り替え修正済み)
   ===================================================== */

'use strict';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
const fmt = (n) => '¥' + Math.abs(n || 0).toLocaleString('ja-JP');
const today = () => new Date().toISOString().split('T')[0];

const State = {
  transactions: [],
  accounts: [],
  categories: [],
  currentMonth: { y: new Date().getFullYear(), m: new Date().getMonth() + 1 },

  init() {
    this.loadData();
    if (this.accounts.length === 0) this.seedData();
    UI.init();
  },

  loadData() {
    this.transactions = JSON.parse(localStorage.getItem('kb_transactions') || '[]');
    this.accounts = JSON.parse(localStorage.getItem('kb_accounts') || '[]');
    this.categories = JSON.parse(localStorage.getItem('kb_categories') || '[]');
  },

  save(key) {
    localStorage.setItem(`kb_${key}`, JSON.stringify(this[key]));
  },

  seedData() {
    this.accounts = [
      { id: 'acc_1', name: '財布(現金)', balance: 5000, type: 'cash' },
      { id: 'acc_2', name: '楽天銀行', balance: 120000, type: 'bank' }
    ];
    this.categories = [
      { id: 'cat_1', name: '食費', icon: '🍔', type: 'expense' },
      { id: 'cat_2', name: '給与', icon: '💰', type: 'income' }
    ];
    this.save('accounts');
    this.save('categories');
  }
};

const UI = {
  init() {
    this.renderDashboard();
    this.updateMonthDisplay();
    this.setupEventListeners();
    this.populateSelects();
    // 初期状態の日付をセット
    if($('#input-date')) $('#input-date').value = today();
  },

  setupEventListeners() {
    // ページナビゲーション
    $$('.nav-item, .nav-plus').forEach(btn => {
      btn.onclick = () => this.showPage(btn.dataset.page);
    });

    // ★ 収入・支出・移動のタブ切り替え (ここが修正ポイント) ★
    $$('.type-tab').forEach(tab => {
      tab.onclick = () => {
        // すべてのタブから active クラスを消す
        $$('.type-tab').forEach(t => t.classList.remove('active'));
        // クリックされたタブに active をつける
        tab.classList.add('active');
        
        const type = tab.dataset.type;
        console.log("Selected type:", type); // デバッグ用

        // 入力項目の表示切り替え（移動の場合などの制御）
        this.toggleInputFields(type);
      };
    });

    // 保存ボタン
    const saveBtn = $('#btn-save-transaction');
    if (saveBtn) saveBtn.onclick = () => this.handleSave();
  },

  toggleInputFields(type) {
    // 移動(transfer)の場合の表示切り替え
    const isTransfer = (type === 'transfer');
    if($('#row-account')) $('#row-account').classList.toggle('hidden', isTransfer);
    if($('#row-category')) $('#row-category').classList.toggle('hidden', isTransfer);
    if($('#row-from-account')) $('#row-from-account').classList.toggle('hidden', !isTransfer);
    if($('#row-to-account')) $('#row-to-account').classList.toggle('hidden', !isTransfer);
  },

  showPage(pageId) {
    $$('.page').forEach(p => p.classList.remove('active'));
    $(`#page-${pageId}`).classList.add('active');
    $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === pageId));
    if (pageId === 'dashboard') this.renderDashboard();
  },

  updateMonthDisplay() {
    if ($('#display-month')) $('#display-month').textContent = `${State.currentMonth.y}年 ${State.currentMonth.m}月`;
  },

  renderDashboard() {
    const monthStr = `${State.currentMonth.y}-${String(State.currentMonth.m).padStart(2, '0')}`;
    const monthlyTrans = State.transactions.filter(t => t.date.startsWith(monthStr));
    
    const income = monthlyTrans.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = monthlyTrans.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    if ($('#summary-balance')) $('#summary-balance').textContent = fmt(income - expense);
    if ($('#summary-income')) $('#summary-income').textContent = fmt(income);
    if ($('#summary-expense')) $('#summary-expense').textContent = fmt(expense);

    const grid = $('#account-list-dashboard');
    if (grid) {
      grid.innerHTML = State.accounts.map(acc => `
        <div class="account-card">
          <div class="acc-name">${acc.name}</div>
          <div class="acc-balance">${fmt(acc.balance)}</div>
        </div>
      `).join('');
    }
  },

  populateSelects() {
    const accHtml = State.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    if ($('#input-account')) $('#input-account').innerHTML = accHtml;
    if ($('#input-from-account')) $('#input-from-account').innerHTML = accHtml;
    if ($('#input-to-account')) $('#input-to-account').innerHTML = accHtml;
    if ($('#input-category')) {
      $('#input-category').innerHTML = State.categories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
    }
  },

  handleSave() {
    const amount = parseInt($('#input-amount').value);
    if (!amount) { alert('金額を入力してください'); return; }

    const activeTab = $('.type-tab.active');
    const type = activeTab ? activeTab.dataset.type : 'expense';
    
    const trans = {
      id: uuid(),
      type: type,
      amount: amount,
      date: $('#input-date').value || today(),
      memo: $('#input-memo').value || '',
      account_id: $('#input-account').value
    };

    const acc = State.accounts.find(a => a.id === trans.account_id);
    if (acc) {
      if (type === 'income') acc.balance += amount;
      else if (type === 'expense') acc.balance -= amount;
    }

    State.transactions.push(trans);
    State.save('transactions');
    State.save('accounts');

    $('#input-amount').value = '';
    alert('保存しました');
    this.showPage('dashboard');
  }
};

document.addEventListener('DOMContentLoaded', () => State.init());
