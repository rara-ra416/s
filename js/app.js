/* =====================================================
    かけいぼ - メインアプリロジック (LocalStorage版)
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
const esc = (str) => {
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
};

/* ─── API ラッパー (LocalStorage版) ─── */
const API = {
    async list(table) {
        const data = localStorage.getItem(`db_${table}`);
        return data ? JSON.parse(data) : [];
    },
    async get(table, id) {
        const list = await this.list(table);
        return list.find(item => item.id === id);
    },
    async create(table, data) {
        const list = await this.list(table);
        list.push(data);
        localStorage.setItem(`db_${table}`, JSON.stringify(list));
        return data;
    },
    async update(table, id, data) {
        let list = await this.list(table);
        list = list.map(item => item.id === id ? { ...item, ...data } : item);
        localStorage.setItem(`db_${table}`, JSON.stringify(list));
        return data;
    },
    async delete(table, id) {
        let list = await this.list(table);
        list = list.filter(item => item.id !== id);
        localStorage.setItem(`db_${table}`, JSON.stringify(list));
    }
};

/* ─── アプリ状態 ─── */
const App = {
    currentPage: 'dashboard',
    currentMonth: monthKey(new Date().getFullYear(), new Date().getMonth() + 1),
    txMonth: monthKey(new Date().getFullYear(), new Date().getMonth() + 1),
    rpMonth: monthKey(new Date().getFullYear(), new Date().getMonth() + 1),
    trMonth: monthKey(new Date().getFullYear(), new Date().getMonth() + 1),
    accounts: [],
    categories: [],
    transactions: [],
    walletChecks: [],
    travelLogs: [],
    editingTxId: null,
    editingAccountId: null,
    editingCategoryId: null,
    catTypeFilter: 'expense',
    selectedCategoryId: null,
    selectedTxType: 'expense',
    selectedAccountType: 'cash',
    selectedColor: '#FF3B30',
    selectedEmoji: '💴',
    barChart: null,
};

/* ─── 定数 ─── */
const ACCOUNT_TYPE_LABELS = { cash: '現金', bank: '銀行', credit: 'クレジット', 'e-money': '電子マネー', other: 'その他' };
const ACCOUNT_TYPE_ICONS  = { cash: '💴', bank: '🏦', credit: '💳', 'e-money': '📱', other: '📦' };

const DEFAULT_CATEGORIES = [
    { name: '食費', type: 'expense', icon: '🍽️', color: '#FF6B6B', is_system: true, sort_order: 1 },
    { name: '交通費', type: 'expense', icon: '🚃', color: '#4ECDC4', is_system: true, sort_order: 2 },
    { name: '日用品', type: 'expense', icon: '🛒', color: '#45B7D1', is_system: true, sort_order: 3 },
    { name: '給与', type: 'income', icon: '💰', color: '#34C759', is_system: true, sort_order: 11 },
];

const DEFAULT_ACCOUNTS = [
    { name: '財布', account_type: 'cash', balance: 0, initial_balance: 0, sort_order: 1, is_wallet: true, is_active: true },
    { name: '銀行口座', account_type: 'bank', balance: 0, initial_balance: 0, sort_order: 2, is_wallet: false, is_active: true },
];

const EMOJIS = ['💴','🏦','💳','📱','🛒','🍽️','🚃','🏠','👕','🎮','🎁','💡','📦','💰','💼','📉','📈','🎀','☕','🍜','📚','✈️'];
const COLORS = ['#FF3B30','#FF6B6B','#FF9500','#FFCC00','#34C759','#4ECDC4','#5AC8FA','#007AFF','#5856D6','#B0B0B0'];

/* ─── 初期化 ─── */
window.addEventListener('DOMContentLoaded', init);

async function init() {
    await ensureDefaultData();
    await loadAllData();
    setupNavigation();
    setupEventListeners();
    renderDashboard();
}

async function ensureDefaultData() {
    const cats = await API.list('categories');
    if (cats.length === 0) {
        for (const c of DEFAULT_CATEGORIES) {
            await API.create('categories', { id: uuid(), ...c, is_active: true });
        }
    }
    const accs = await API.list('accounts');
    if (accs.length === 0) {
        for (const a of DEFAULT_ACCOUNTS) {
            await API.create('accounts', { id: uuid(), ...a });
        }
    }
}

async function loadAllData() {
    const [accounts, categories, transactions, walletChecks, travelLogs] = await Promise.all([
        API.list('accounts'),
        API.list('categories'),
        API.list('transactions'),
        API.list('wallet_checks'),
        API.list('travel_logs'),
    ]);
    App.accounts = accounts.filter(a => a.is_active);
    App.categories = categories.filter(c => c.is_active);
    App.transactions = transactions.sort((a, b) => b.date.localeCompare(a.date));
    App.walletChecks = walletChecks;
    App.travelLogs = travelLogs;
}

/* ─── 残高計算 ─── */
function computeAccountBalance(account) {
    let balance = account.initial_balance || 0;
    App.transactions.forEach(tx => {
        if (tx.
