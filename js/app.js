'use strict';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const App = {
  state: {
    transactions: JSON.parse(localStorage.getItem('kakeibo_tx')) || [],
    type: 'expense'
  },

  init() {
    this.bindEvents();
    this.render();
  },

  bindEvents() {
    $$('.nav-item, .nav-plus').forEach(el => {
      el.onclick = () => this.showPage(el.dataset.page);
    });

    $$('.type-tab').forEach(tab => {
      tab.onclick = () => {
        $$('.type-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.state.type = tab.dataset.type;
      };
    });

    $('#btn-save-transaction').onclick = () => this.save();
  },

  showPage(id) {
    $$('.page').forEach(p => p.classList.remove('active'));
    $(`#page-${id}`).classList.add('active');
  },

  save() {
    const amount = parseInt($('#input-amount').value);
    if (!amount) return;

    this.state.transactions.push({
      amount,
      type: this.state.type,
      date: $('#input-date').value || new Date().toISOString().split('T')[0]
    });

    localStorage.setItem('kakeibo_tx', JSON.stringify(this.state.transactions));
    this.showPage('dashboard');
    this.render();
  },

  render() {
    const income = this.state.transactions.filter(t => t.type === 'income').reduce((a, b) => a + b.amount, 0);
    const expense = this.state.transactions.filter(t => t.type === 'expense').reduce((a, b) => a + b.amount, 0);
    
    $('#summary-income').textContent = `¥${income.toLocaleString()}`;
    $('#summary-expense').textContent = `¥${expense.toLocaleString()}`;
    $('#summary-balance').textContent = `¥${(income - expense).toLocaleString()}`;
  }
};

window.onload = () => App.init();
