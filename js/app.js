/* =====================================================
   かけいぼ - メインアプリロジック
   ===================================================== */
'use strict';

/* ─── ユーティリティ ─── */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
const fmt = (n) => '¥' + Math.abs(n).toLocaleString('ja-JP');
const today = () => new Date().toISOString().split('T')[0];

/* ─── API ラッパー ─── */
const API = {
  async list(table, params = {}) {
    const q = new URLSearchParams({ limit: 1000, ...params }).toString();
    const r = await fetch(`tables/${table}?${q}`);
    return r.json();
  },
  async save(table, data) {
    const method = data.id ? 'PUT' : 'POST';
    const url = `tables/${table}${data.id ? '/' + data.id : ''}`;
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return r.json();
  },
  async delete(table, id) {
    await fetch(`tables/${table}/${id}`, { method: 'DELETE' });
  }
};

/* ─── アプリケーション本体 ─── */
const App = {
  state: {
    currentMonth: { y: new Date().getFullYear(), m: new Date().getMonth() + 1 },
    editingTxId: null,
    transactions: [],
    accounts: [],
    categories: []
  },

  async init() {
    this.setupEventListeners();
    await this.loadInitialData();
    this.showPage('dashboard');
  },

  /* ...中略（提供された全メソッド：renderDashboard, saveTransaction, backup logic等）... */
};

window.addEventListener('DOMContentLoaded', () => App.init());
