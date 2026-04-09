/* =====================================================
   かけいぼ - メインアプリロジック (GitHub Pages対応版)
   ===================================================== */

'use strict';

// ─── ユーティリティ ───
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
const fmt = (n) => '¥' + Math.abs(n || 0).toLocaleString('ja-JP');
const today = () => new Date().toISOString().split('T')[0];

// ─── アプリの状態管理 ───
const State = {
  transactions: [],
  accounts: [],
  categories: [],
  currentMonth: { y: new Date().getFullYear(), m: new Date().getMonth() + 1 },

  async init() {
    // ローカルストレージからデータを読み込み（tablesフォルダは使いません）
    this.loadData();
    
    // データが空の場合の初期設定
    if (this.accounts.length === 0) {
      this.seedData();
    }
    
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
      { id: 'cat_2', name: '給与', icon: '💰', type: 'income' },
      { id: 'cat_3', name: '趣味', icon: '🎮', type: 'expense' }
    ];
    this.save('accounts');
    this.save('categories');
  }
};

// ─── UI制御 ───
const UI = {
  init() {
    this.renderDashboard();
    this.updateMonthDisplay();
    this.setupEventListeners();
    this.populateSelects();
  },

  showPage(pageId) {
    $$('.page').forEach(p => p.classList.remove('active'));
    $(`#page-${pageId}`).classList.add('active');
    
    $$('.nav-item').forEach(n => {
      n.classList.toggle('active', n.dataset.page === pageId);
    });

    if (pageId === 'dashboard') this.renderDashboard();
  },

  updateMonthDisplay() {
    const el = $('#display-month');
    if (el) el.textContent = `${State.currentMonth.y}年 ${State.currentMonth.m}月`;
  },

  renderDashboard() {
    const monthStr = `${State.currentMonth.y}-${String(State.currentMonth.m).padStart(2, '0')}`;
    const monthlyTrans = State.transactions.filter(t => t.date.startsWith(monthStr));
    
    const income = monthlyTrans.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = monthlyTrans.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    const balEl = $('#summary-balance');
    const incEl = $('#summary-income');
    const expEl = $('#summary-expense');

    if (balEl) balEl.textContent = fmt(income - expense);
    if (incEl) incEl.textContent = fmt(income);
    if (expEl) expEl.textContent = fmt(expense);

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
    const accSelect = $('#input-account');
    const catSelect = $('#input-category');
    
    if (accSelect) {
      accSelect.innerHTML = State.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    }
    if (catSelect) {
      catSelect.innerHTML = State.categories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
    }
  },

  setupEventListeners() {
    // ナビゲーション切り替え
    $$('.nav-item, .nav-plus').forEach(btn => {
      btn.onclick = () => this.showPage(btn.dataset.page);
    });

    // 戻るボタン
    $$('.back-btn').forEach(btn => {
      btn.onclick = () => this.showPage(btn.dataset.back);
    });

    // 取引保存
    const saveBtn = $('#btn-save-transaction');
    if (saveBtn) {
      saveBtn.onclick = () => this.handleSave();
    }
  },

  handleSave() {
    const amountInput = $('#input-amount');
    const amount = parseInt(amountInput.value);
    
    if (!amount) {
      alert('金額を入力してください');
      return;
    }

    const type = $('.type-tab.active')?.dataset.type || 'expense';
    
    const newTrans = {
      id: uuid(),
      type: type,
      amount: amount,
      date: $('#input-date').value || today(),
      memo: $('#input-memo').value || '',
      account_id: $('#input-account').value
    };

    // 口座残高を計算
    const account = State.accounts.find(a => a.id === newTrans.account_id);
    if (account) {
      if (type === 'income') account.balance += amount;
      else if (type === 'expense') account.balance -= amount;
    }

    State.transactions.push(newTrans);
    State.save('transactions');
    State.save('accounts');

    amountInput.value = '';
    alert('保存しました');
    this.showPage('dashboard');
  }
};

// 起動
document.addEventListener('DOMContentLoaded', () => {
  State.init();
});
