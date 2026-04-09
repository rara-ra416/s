/* =====================================================
   かけいぼ - メインアプリロジック
   ===================================================== */

'use strict';

/* ─── ユーティリティ ─── */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
const fmt = (n) => '¥' + Math.abs(n).toLocaleString('ja-JP');
const fmtSigned = (n) => (n >= 0 ? '+¥' : '-¥') + Math.abs(n).toLocaleString('ja-JP');
const today = () => new Date().toISOString().split('T')[0];

/* ─── アプリの状態 ─── */
const State = {
  currentMonth: { y: new Date().getFullYear(), m: new Date().getMonth() + 1 },
  transactions: [],
  accounts: [],
  categories: [],
  travel_logs: [],
  editingId: null,

  async loadAll() {
    // ローカルストレージをバックアップとする簡易DB
    this.accounts = JSON.parse(localStorage.getItem('kb_accounts') || '[]');
    this.categories = JSON.parse(localStorage.getItem('kb_categories') || '[]');
    this.transactions = JSON.parse(localStorage.getItem('kb_transactions') || '[]');
    this.travel_logs = JSON.parse(localStorage.getItem('kb_travel_logs') || '[]');
    
    // 初期データがない場合のシード（省略）
    if (this.accounts.length === 0) {
      this.accounts = [{ id: 'a1', name: '現金', type: 'cash', balance: 0, is_wallet: true }];
      this.save('accounts');
    }
  },

  save(key) {
    localStorage.setItem(`kb_${key}`, JSON.stringify(this[key]));
  }
};

/* ─── UI制御 ─── */
const UI = {
  init() {
    this.renderDashboard();
    this.setupEventListeners();
    this.updateMonthDisplay();
  },

  showPage(pageId) {
    $$('.page').forEach(p => p.classList.remove('active'));
    $(`#page-${pageId}`).classList.add('active');
    
    $$('.nav-item').forEach(n => {
      n.classList.toggle('active', n.dataset.page === pageId);
    });

    if (pageId === 'dashboard') this.renderDashboard();
    if (pageId === 'transactions') this.renderTransactions();
    if (pageId === 'analysis') this.renderAnalysis();
  },

  updateMonthDisplay() {
    $('#display-month').textContent = `${State.currentMonth.y}年 ${State.currentMonth.m}月`;
  },

  renderDashboard() {
    // 収入・支出の計算
    const monthStr = `${State.currentMonth.y}-${String(State.currentMonth.m).padStart(2, '0')}`;
    const monthlyTrans = State.transactions.filter(t => t.date.startsWith(monthStr));
    
    const income = monthlyTrans.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = monthlyTrans.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    $('#summary-income').textContent = fmt(income);
    $('#summary-expense').textContent = fmt(expense);
    $('#summary-balance').textContent = fmtSigned(income - expense);

    // 口座リスト表示
    const grid = $('#account-list-dashboard');
    grid.innerHTML = State.accounts.map(acc => `
      <div class="account-card">
        <div class="acc-name">${acc.name}</div>
        <div class="acc-balance">${fmt(acc.balance)}</div>
      </div>
    `).join('');
  },

  renderTransactions() {
    const list = $('#transaction-list');
    if (State.transactions.length === 0) {
      list.innerHTML = '<div class="empty-state">取引がありません</div>';
      return;
    }
    // 日付順にソートして描画
    const sorted = [...State.transactions].sort((a, b) => b.date.localeCompare(a.date));
    list.innerHTML = sorted.map(t => `
      <div class="transaction-item" onclick="UI.editTransaction('${t.id}')">
        <div class="item-info">
          <div class="item-category">${t.memo || '未分類'}</div>
          <div class="item-memo">${t.date}</div>
        </div>
        <div class="item-amount ${t.type}">${t.type === 'expense' ? '-' : ''}${fmt(t.amount)}</div>
      </div>
    `).join('');
  },

  setupEventListeners() {
    // ナビゲーション
    $$('.nav-item, .nav-plus').forEach(btn => {
      btn.addEventListener('click', () => this.showPage(btn.dataset.page));
    });

    // 前月・次月
    $('#btn-prev-month').onclick = () => {
      State.currentMonth.m--;
      if (State.currentMonth.m < 1) { State.currentMonth.m = 12; State.currentMonth.y--; }
      this.updateMonthDisplay();
      this.renderDashboard();
    };

    $('#btn-next-month').onclick = () => {
      State.currentMonth.m++;
      if (State.currentMonth.m > 12) { State.currentMonth.m = 1; State.currentMonth.y++; }
      this.updateMonthDisplay();
      this.renderDashboard();
    };

    // 保存ボタン
    $('#btn-save-transaction').onclick = () => this.saveTransaction();
    
    // 入力フォームのタイプ切替
    $$('.type-tab').forEach(tab => {
      tab.onclick = () => {
        $$('.type-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        // 移動(transfer)の場合は口座選択の表示を切り替えるロジックをここに追加
      };
    });
  },

  async saveTransaction() {
    const amount = parseInt($('#input-amount').value);
    if (!amount) return this.showToast('金額を入力してください');

    const newTrans = {
      id: uuid(),
      type: $('.type-tab.active').dataset.type,
      amount: amount,
      date: $('#input-date').value || today(),
      memo: $('#input-memo').value,
      account_id: $('#input-account').value
    };

    State.transactions.push(newTrans);
    State.save('transactions');
    this.showToast('保存しました');
    this.showPage('dashboard');
    $('#input-amount').value = '';
  },

  showToast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2000);
  }
};

// 起動
document.addEventListener('DOMContentLoaded', async () => {
  await State.loadAll();
  UI.init();
});
