/**
 * System Settings, Backup Definitions & Operational Constants
 * Extracted from legacy server.js - 100% Preserved Business Logic
 */

const CAIRO_TIME_ZONE = 'Africa/Cairo';
const CAIRO_NOW_SQL = `(now() AT TIME ZONE '${CAIRO_TIME_ZONE}')`;
const CAIRO_DATE_SQL = `${CAIRO_NOW_SQL}::date`;

const DEFAULT_SETTINGS = {
  store_name: 'Bebyoon Center',
  tax_rate: '0',
  store_email: '',
  store_phone: '',
  store_address: '',
  show_email: 'true',
  show_phone: 'true',
  show_address: 'true',
  cashier_footer: 'شكراً لزيارتكم',
  rental_footer: 'شكراً لزيارتكم',
  rental_fine_per_day: '50',
  currency: 'ج.م',
  profit_password: '123',
  salary_password: '123',
  invoice_edit_password: '123456',
};

const DEFAULT_RENTAL_FINE_PER_DAY = 50;

const PUBLIC_STATIC_FILES = new Set([
  '/login.html',
  '/setup.html',
  '/responsive.css',
  '/router.js',
  '/auth.js',
]);

const BACKUP_GROUPS = {
  settings: {
    label: 'الإعدادات والفروع وحسابات الفروع',
    tables: ['settings', 'branches', 'users'],
  },
  users: {
    label: 'المستخدمون والصلاحيات',
    tables: ['users'],
  },
  customers: {
    label: 'العملاء',
    tables: ['customers'],
  },
  inventory: {
    label: 'المخزون والتحويلات',
    tables: ['inventory', 'inventory_branches', 'stock_transfers'],
  },
  suppliers: {
    label: 'الموردون وحساباتهم',
    tables: ['suppliers', 'supply_records', 'supplier_transactions'],
  },
  sales: {
    label: 'المبيعات والمرتجعات',
    tables: ['orders', 'order_items', 'returns', 'return_items'],
  },
  rentals: {
    label: 'التأجير ومخزون التأجير',
    tables: ['rental_inventory', 'rental_inventory_branches', 'rentals'],
  },
  employees: {
    label: 'الموظفون والحضور',
    tables: ['employees', 'attendance', 'employee_transactions'],
  },
  expenses: {
    label: 'المصاريف',
    tables: ['expenses'],
  },
  alterations: {
    label: 'التعديلات',
    tables: ['alterations', 'tailoring_orders'],
  },
  worn: {
    label: 'المهترئ',
    tables: ['worn_products'],
  },
  logs: {
    label: 'السجلات والمزامنة',
    tables: ['sync_queue'],
  },
};

const BACKUP_TABLE_ORDER = [
  'settings',
  'branches',
  'suppliers',
  'supplier_transactions',
  'customers',
  'employees',
  'users',
  'inventory',
  'inventory_branches',
  'rental_inventory',
  'rental_inventory_branches',
  'orders',
  'order_items',
  'returns',
  'return_items',
  'rentals',
  'supply_records',
  'stock_transfers',
  'attendance',
  'employee_transactions',
  'expenses',
  'alterations',
  'tailoring_orders',
  'worn_products',
  'sync_queue',
];

const BRANCH_LOGO_FILTERS = new Set(['black', 'slate', 'gold', 'rose', 'teal', 'emerald', 'indigo', 'none']);
const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  const normalized = Number.isInteger(parsed) ? parsed : fallback;
  return Math.min(Math.max(normalized, min), max);
}

function normalizeBranchInvoiceLogoSettings(input = {}) {
  const filter = BRANCH_LOGO_FILTERS.has(input.invoice_logo_filter) ? input.invoice_logo_filter : 'black';
  const bgStart = String(input.invoice_logo_bg_start || '').trim();
  const bgEnd = String(input.invoice_logo_bg_end || '').trim();
  return {
    invoice_logo_height: clampInt(input.invoice_logo_height, 160, 60, 260),
    invoice_logo_spacing: clampInt(input.invoice_logo_spacing, 8, -60, 60),
    invoice_logo_filter: filter,
    invoice_logo_bg_enabled: input.invoice_logo_bg_enabled === true || input.invoice_logo_bg_enabled === 'true',
    invoice_logo_bg_start: HEX_COLOR_RE.test(bgStart) ? bgStart.toLowerCase() : '#ffffff',
    invoice_logo_bg_end: HEX_COLOR_RE.test(bgEnd) ? bgEnd.toLowerCase() : '#ffffff',
  };
}

module.exports = {
  CAIRO_TIME_ZONE,
  CAIRO_NOW_SQL,
  CAIRO_DATE_SQL,
  DEFAULT_SETTINGS,
  DEFAULT_RENTAL_FINE_PER_DAY,
  PUBLIC_STATIC_FILES,
  BACKUP_GROUPS,
  BACKUP_TABLE_ORDER,
  BRANCH_LOGO_FILTERS,
  HEX_COLOR_RE,
  clampInt,
  normalizeBranchInvoiceLogoSettings,
};
