'use strict';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const App = {
  state: {
    currentMonth: new Date(),
    transactions: JSON.parse(localStorage.getItem('kakeibo_tx')) || [],
    accounts: JSON.parse(localStorage.getItem('kakeibo_accounts')) || [
      {id: '1', name: '現金', balance: 0},
      {id: '2', name: '銀行', balance: 0}
    ],
    selectedType: 'expense'
  },

  init() {
    this.setupEventListeners();
    this.render();
  },

  setupEventListeners() {
    $$('.nav-item, .nav-plus').forEach(btn => {
      btn.onclick = () => this.showPage(btn.dataset.page);
    });

    $$('.back-btn').forEach(btn => {
      btn.onclick = () => this.showPage(btn.dataset.back);
    });

    $$('.type-tab').forEach(tab => {
      tab.onclick = () => {
        $$('.type-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.state.selectedType = tab.dataset.type;
        this.updateFormUI();
      };
    });

    $('#btn-save-transaction').onclick = () => this.saveTransaction();
  },

  showPage(pageId) {
    $$('.page').forEach(p => p.classList.remove('active'));
    $(`#page-${pageId}`).classList.add('active');
    
    $$('.nav-item').forEach(n => {
      n.classList.toggle('active', n.dataset.page === pageId);
    });
    
    if(pageId === 'dashboard') this.render();
  },

  updateFormUI() {
    const isTransfer = this.state.selectedType === 'transfer';
    $('#group-to-account').classList.toggle('hidden', !isTransfer);
    $('#label-account').textContent = isTransfer ? '移動元' : '口座';
  },

  saveTransaction() {
    const amount = parseInt($('#input-amount').value);
    if (!amount) return alert('金額を入力してください');

    const tx = {
      id: Date.now().toString(),
      type: this.state.selectedType,
      amount,
      date: $('#input-date').value || new Date().toISOString().split('T')[0],
      memo: $('#input-memo').value
    };

    this.state.transactions.push(tx);
    localStorage.setItem('kakeibo_tx', JSON.stringify(this.state.transactions));
    this.showPage('dashboard');
  },

  render() {
    const summary = this.state.transactions.reduce((acc, t) => {
      if(t.type === 'income') acc.income += t.amount;
      if(t.type === 'expense') acc.expense += t.amount;
      return acc;
    }, {income: 0, expense: 0});

    $('#summary-income').textContent = `¥${summary.income.toLocaleString()}`;
    $('#summary-expense').textContent = `¥${summary.expense.toLocaleString()}`;
    $('#summary-balance').textContent = `¥${(summary.income - summary.expense).toLocaleString()}`;
  }
};

window.addEventListener('DOMContentLoaded', () => App.init());
