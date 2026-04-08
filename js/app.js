'use strict';
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const App = {
  transactions: JSON.parse(localStorage.getItem('kakeibo_tx')) || [],
  type: 'expense'
};

window.addEventListener('DOMContentLoaded', () => {
  setupEvents();
  render();
});

function setupEvents() {
  $$('.nav-item').forEach(btn => btn.onclick = () => showPage(btn.dataset.page));
  $$('.back-btn').forEach(btn => btn.onclick = () => showPage(btn.dataset.back));
  
  $$('.type-tab').forEach(tab => tab.onclick = () => {
    $$('.type-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    App.type = tab.dataset.type;
  });

  $('#btn-save-transaction').onclick = () => {
    const amount = parseInt($('#input-amount').value);
    if (!amount) return;
    App.transactions.push({
      amount,
      type: App.type,
      date: $('#input-date').value || new Date().toLocaleDateString(),
      memo: $('#input-memo').value
    });
    localStorage.setItem('kakeibo_tx', JSON.stringify(App.transactions));
    showPage('dashboard');
  };
}

function showPage(id) {
  $$('.page').forEach(p => p.classList.remove('active'));
  $(`#page-${id}`).classList.add('active');
  render();
}

function render() {
  const exp = App.transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const inc = App.transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  $('#summary-expense').textContent = `¥${exp.toLocaleString()}`;
  $('#summary-income').textContent = `¥${inc.toLocaleString()}`;
  $('#summary-balance').textContent = `¥${(inc - exp).toLocaleString()}`;
}
