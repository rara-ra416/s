'use strict';

/* ─── ユーティリティ ─── */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
const fmt = (n) => '¥' + Math.abs(n).toLocaleString('ja-JP');
const fmtSigned = (n) => (n >= 0 ? '+¥' : '-¥') + Math.abs(n).toLocaleString('ja-JP');
const today = () => new Date().toISOString().split('T')[0];

/* ─── API ラッパー ─── */
const API = {
  /* あなたが実装した localStorage や fetch のロジック */
  async list(table, params = {}) {
    // ユーザー提供のロジック
  }
};

/* ─── アプリケーション本体 ─── */
const App = {
  state: {
    currentMonth: { y: new Date().getFullYear(), m: new Date().getMonth() + 1 },
    editingTxId: null,
    // その他すべての状態保持
  },

  async init() {
    this.setupEventListeners();
    await this.loadInitialData();
    this.showPage('dashboard');
  },

  /* setupEventListeners, renderDashboard, saveTransaction などの全メソッド */
};

window.addEventListener('DOMContentLoaded', () => App.init());
