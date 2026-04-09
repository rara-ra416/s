/* =====================================================
   かけいぼ - メインアプリロジック
   =====================================================
   アーキテクチャ:
   - State: LocalStorage + REST API (tables/)
   - ページング: SPA (単一ページ、セクション切替)
   ===================================================== */

'use strict';

/* ─── ユーティリティ ─── */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
const fmt = (n) => '¥' + Math.abs(n).toLocaleString('ja-JP');
const fmtSigned = (n) => (n >= 0 ? '+¥' : '-¥') + Math.abs(n).toLocaleString('ja-JP');
const today = () => new Date().toISOString().split('T')[0];
const monthKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
const parseMonth = (s) => ({ y: parseInt(s.split('-')[0]), m: parseInt(s.split('-')[1]) });

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
  // ...（中略：アップロードされた App オブジェクトの全メソッド）...

  /* ─── バックアップ (Export/Import) ─── */
  async exportData() {
    try {
      const data = {
        transactions: await API.list('transactions'),
        accounts: await API.list('accounts'),
        categories: await API.list('categories'),
        travel_logs: await API.list('travel_logs'),
        export_date: new Date().toISOString()
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kakeibo_backup_${today()}.json`;
      a.click();
      this.showToast('データをエクスポートしました');
    } catch (e) {
      console.error(e);
      this.showToast('エクスポートに失敗しました');
    }
  }
};

/* ─── ヘルパー関数群 ─── */
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ─── 初期化実行 ─── */
window.addEventListener('DOMContentLoaded', () => App.init());
