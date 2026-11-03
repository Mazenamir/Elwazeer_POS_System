/**
 * Elwazeer POS System — Authoritative Granular RBAC Catalog & Definitions
 * Hierarchical Permission Model: Modules -> Tabs -> Actions
 * Full Backward Compatibility with Legacy Page-Based Permissions
 */

// Legacy Page Permissions (Preserved for compatibility)
const ALL_PERMISSIONS = [
  'Dashboard.html',
  'index.html',
  'Rentals.html',
  'Barcodes.html',
  'Customers.html',
  'Suppliers.html',
  'RentalInventory.html',
  'WornProducts.html',
  'Employees.html',
  'Expenses.html',
  'Reports.html',
  'Settings.html',
  'Alterations.html',
  'Tailoring.html',
];

const DEFAULT_BRANCH_PERMISSIONS = [
  'index.html',
  'Rentals.html',
  'Barcodes.html',
  'Customers.html',
  'Suppliers.html',
  'RentalInventory.html',
  'WornProducts.html',
];

const INVENTORY_ADMIN_PERMISSION = 'inventory_admin';
const INVENTORY_VIEW_ALL_BRANCHES_PERMISSION = 'inventory_view_all_branches';

const EXTRA_PERMISSIONS = [
  INVENTORY_ADMIN_PERMISSION,
  INVENTORY_VIEW_ALL_BRANCHES_PERMISSION,
];

/**
 * Hierarchical Permission Catalog
 * Modules -> Tabs / Subsections -> Actions
 */
const HIERARCHICAL_CATALOG = [
  {
    moduleId: 'pos',
    modulePerm: 'pos.access',
    legacyPerm: 'index.html',
    label: 'الكاشير والفواتير (POS)',
    description: 'تسجيل فواتير المبيعات، البحث، الاسترجاع، وسداد المتبقي',
    group: 'المبيعات والتشغيل',
    tabs: [
      {
        tabId: 'sales',
        label: 'نقطة البيع (Cashier)',
        actions: [
          { id: 'pos.sales.view', label: 'فتح شاشة الكاشير' },
          { id: 'pos.sales.create', label: 'إنشاء فواتير مبيعات' },
        ],
      },
      {
        tabId: 'invoices',
        label: 'سجل الفواتير (Invoices)',
        actions: [
          { id: 'pos.invoices.view', label: 'استعراض قائمة الفواتير' },
          { id: 'pos.invoices.search', label: 'البحث المتقدم في الفواتير' },
          { id: 'pos.invoices.print', label: 'طباعة الفواتير والإيصالات' },
          { id: 'pos.invoices.edit', label: 'تعديل الفواتير (محمي بكلمة سر)', sensitive: true, passwordType: 'invoice_edit' },
        ],
      },
      {
        tabId: 'returns',
        label: 'المرتجعات (Returns)',
        actions: [
          { id: 'pos.returns.view', label: 'عرض سجل المرتجعات' },
          { id: 'pos.invoices.refund', label: 'استرجاع الفواتير وصرف المرتجع (محمي بكلمة سر)', sensitive: true, passwordType: 'return' },
        ],
      },
    ],
  },
  {
    moduleId: 'rentals',
    modulePerm: 'rentals.access',
    legacyPerm: 'Rentals.html',
    label: 'عقود التأجير',
    description: 'حجز وتسليم واسترجاع فساتين وبدل التأجير وسداد الحسابات',
    group: 'المبيعات والتشغيل',
    branchFeature: 'rentals', // Can be toggled per branch
    tabs: [
      {
        tabId: 'contracts',
        label: 'إدارة العقود والحجوزات',
        actions: [
          { id: 'rentals.contracts.view', label: 'عرض عقود وحجوزات التأجير' },
          { id: 'rentals.contracts.create', label: 'إنشاء وحجز عقود جديدة' },
          { id: 'rentals.contracts.edit', label: 'تعديل بيانات العقد والحجز' },
          { id: 'rentals.contracts.return', label: 'استلام قطع التأجير وتصفية التأمين' },
          { id: 'rentals.contracts.cancel', label: 'إلغاء الحجز' },
        ],
      },
    ],
  },
  {
    moduleId: 'rental_inventory',
    modulePerm: 'rental_inventory.access',
    legacyPerm: 'RentalInventory.html',
    label: 'مخزون التأجير',
    description: 'إدارة قطع ومقاسات مخزون التأجير والتحقق من التوفر',
    group: 'المخزون والمنتجات',
    branchFeature: 'rentals',
    tabs: [
      {
        tabId: 'inventory',
        label: 'قطع التأجير',
        actions: [
          { id: 'rental_inventory.items.view', label: 'عرض مخزون قطع التأجير' },
          { id: 'rental_inventory.items.create', label: 'إضافة قطعة تأجير جديدة' },
          { id: 'rental_inventory.items.edit', label: 'تعديل مواصفات وأسعار قطعة التأجير' },
          { id: 'rental_inventory.items.delete', label: 'حذف أو تعطيل قطعة تأجير' },
        ],
      },
    ],
  },
  {
    moduleId: 'inventory',
    modulePerm: 'inventory.access',
    legacyPerm: 'Suppliers.html',
    label: 'المخزون العام والمنتجات',
    description: 'إدارة المنتجات، التوريدات، الأصناف، والتحويلات المخزنية',
    group: 'المخزون والمنتجات',
    tabs: [
      {
        tabId: 'products',
        label: 'دليل المنتجات والأصناف',
        actions: [
          { id: 'inventory.products.view', label: 'عرض قائمة المنتجات والأرصدة' },
          { id: 'inventory.products.create', label: 'إضافة منتجات وأصناف جديدة' },
          { id: 'inventory.products.edit', label: 'تعديل المنتجات والأسعار (محمي بكلمة سر)', sensitive: true, passwordType: 'inventory' },
          { id: 'inventory.products.delete', label: 'حذف منتجات من النظام (محمي بكلمة سر)', sensitive: true, passwordType: 'inventory' },
          { id: 'inventory.products.duplicate', label: 'تكرار أو نسخ منتجات (محمي بكلمة سر)', sensitive: true, passwordType: 'inventory' },
        ],
      },
      {
        tabId: 'transfers',
        label: 'التحويلات بين الفروع',
        actions: [
          { id: 'inventory.transfers.request', label: 'طلب تحويل بضاعة بين الفروع' },
          { id: 'inventory.transfers.approve', label: 'الموافقة على تحويلات المخزون' },
          { id: 'inventory.transfers.receive', label: 'تأكيد استلام شحنة المخزون' },
        ],
      },
      {
        tabId: 'advanced',
        label: 'صلاحيات مخزنية متقدمة',
        actions: [
          { id: 'inventory_admin', label: 'إدارة متقدمة للمخزون (تحويل، تسعير)' },
          { id: 'inventory_view_all_branches', label: 'رؤية مخزون كافة الفروع' },
        ],
      },
    ],
  },
  {
    moduleId: 'suppliers',
    modulePerm: 'suppliers.access',
    legacyPerm: 'Suppliers.html',
    label: 'الموردون والتوريدات',
    description: 'دليل الموردين، التوريدات، الدفعات، وكشوف الحساب',
    group: 'المخزون والمنتجات',
    tabs: [
      {
        tabId: 'suppliers_list',
        label: 'دليل الموردين',
        actions: [
          { id: 'suppliers.list.view', label: 'عرض قائمة الموردين وأرصدتهم' },
          { id: 'suppliers.create', label: 'إضافة مورد جديد' },
          { id: 'suppliers.edit', label: 'تعديل بيانات مورد' },
          { id: 'suppliers.delete', label: 'أرشفة / تعطيل مورد' },
          { id: 'suppliers.purchases.create', label: 'تسجيل فاتورة توريد / شراء' },
        ],
      },
    ],
  },
  {
    moduleId: 'alterations',
    modulePerm: 'alterations.access',
    legacyPerm: 'Alterations.html',
    label: 'التعديلات والبروفات',
    description: 'تسجيل ومتابعة بروفات وتعديلات الفساتين ومواعيد التسليم',
    group: 'الخياطة والتجهيز',
    tabs: [
      {
        tabId: 'list',
        label: 'سجل التعديلات',
        actions: [
          { id: 'alterations.view', label: 'استعراض التعديلات والبروفات' },
          { id: 'alterations.create', label: 'تسجيل تعديل / بروفة جديدة' },
          { id: 'alterations.edit', label: 'تحديث حالة وموعد التعديل' },
        ],
      },
    ],
  },
  {
    moduleId: 'tailoring',
    modulePerm: 'tailoring.access',
    legacyPerm: 'Tailoring.html',
    label: 'التفصيل والخياطة',
    description: 'إدارة طلبات ومراحل تفصيل الملابس الرجالي والحريمي',
    group: 'الخياطة والتجهيز',
    tabs: [
      {
        tabId: 'orders',
        label: 'طلبات التفصيل',
        actions: [
          { id: 'tailoring.view', label: 'عرض طلبات ومقاسات التفصيل' },
          { id: 'tailoring.create', label: 'إدخال طلب تفصيل ومقاسات جديد' },
          { id: 'tailoring.edit', label: 'تعديل الطلب والدفعات ومراحل التنفيذ' },
        ],
      },
    ],
  },
  {
    moduleId: 'customers',
    modulePerm: 'customers.access',
    legacyPerm: 'Customers.html',
    label: 'دليل العملاء والديون',
    description: 'بيانات العملاء، سجلات المشتريات، وكشوف الحساب والمديونيات',
    group: 'العملاء والموظفين',
    tabs: [
      {
        tabId: 'customers_list',
        label: 'سجل العملاء',
        actions: [
          { id: 'customers.list.view', label: 'عرض دليل العملاء ومشترياتهم' },
          { id: 'customers.create', label: 'تسجيل عميل جديد' },
          { id: 'customers.edit', label: 'تعديل بيانات العميل' },
          { id: 'customers.delete', label: 'أرشفة / تعطيل حساب العميل' },
        ],
      },
    ],
  },
  {
    moduleId: 'employees',
    modulePerm: 'employees.access',
    legacyPerm: 'Employees.html',
    label: 'شؤون الموظفين والرواتب',
    description: 'الحضور والانصراف، السلف، ومسير الرواتب الشهرية والخصومات',
    group: 'العملاء والموظفين',
    tabs: [
      {
        tabId: 'staff',
        label: 'بيانات الموظفين',
        actions: [
          { id: 'employees.list.view', label: 'عرض قائمة الموظفين' },
          { id: 'employees.create', label: 'إضافة موظف جديد' },
          { id: 'employees.edit', label: 'تعديل بيانات وراتب الموظف' },
        ],
      },
      {
        tabId: 'attendance',
        label: 'الحضور والانصراف',
        actions: [
          { id: 'employees.attendance.view', label: 'عرض سجلات الحضور والانصراف' },
          { id: 'employees.attendance.edit', label: 'تسجيل وتعديل الحضور والانصراف' },
        ],
      },
      {
        tabId: 'payroll',
        label: 'الرواتب والسلف',
        actions: [
          { id: 'employees.payroll.view', label: 'عرض مسير الرواتب والبدلات (محمي بكلمة سر)', sensitive: true, passwordType: 'salary' },
          { id: 'employees.payroll.execute', label: 'صرف الرواتب الشهرية' },
          { id: 'employees.advances.create', label: 'تسجيل سلفة موظف' },
        ],
      },
    ],
  },
  {
    moduleId: 'expenses',
    modulePerm: 'expenses.access',
    legacyPerm: 'Expenses.html',
    label: 'المصروفات والعهد والدرج',
    description: 'تسجيل المصروفات النقدية، تقفيل الدرج اليومي، وإدارة العهد',
    group: 'المالية والحسابات',
    tabs: [
      {
        tabId: 'expenses_list',
        label: 'المصروفات اليومية',
        actions: [
          { id: 'expenses.list.view', label: 'عرض سجل المصروفات' },
          { id: 'expenses.create', label: 'تسجيل مصروف نقدي' },
          { id: 'expenses.delete', label: 'حذف مصروف' },
        ],
      },
      {
        tabId: 'drawer',
        label: 'تقفيل الدرج والتوريد',
        actions: [
          { id: 'cash_drawer.settlement.view', label: 'معاينة رصيد الدرج النقدي' },
          { id: 'cash_drawer.settlement.close', label: 'اعتماد تقفيل وتوريد الدرج' },
        ],
      },
    ],
  },
  {
    moduleId: 'reports',
    modulePerm: 'reports.access',
    legacyPerm: 'Reports.html',
    label: 'التقارير والأرباح',
    description: 'تقارير الأرباح والمبيعات ومسير الرواتب المعتمد والإكسيل',
    group: 'المالية والحسابات',
    tabs: [
      {
        tabId: 'sales_reports',
        label: 'تقارير المبيعات والتشغيل',
        actions: [
          { id: 'reports.sales.view', label: 'عرض تقارير المبيعات وحركة الفروع' },
          { id: 'reports.daily.view', label: 'عرض التقرير اليومي المفصل' },
          { id: 'reports.monthly.view', label: 'عرض التقارير الشهرية' },
          { id: 'reports.master_sheet.view', label: 'عرض شيت الإكسيل المجمع (Master Sheet)' },
        ],
      },
      {
        tabId: 'profits',
        label: 'تحليلات الأرباح والمصاريف',
        actions: [
          { id: 'reports.profits.view', label: 'عرض صافي الأرباح والتكاليف (محمي بكلمة سر)', sensitive: true, passwordType: 'profit' },
        ],
      },
      {
        tabId: 'exports',
        label: 'التصدير والطباعة',
        actions: [
          { id: 'reports.export.excel', label: 'تصدير شيتات الإكسيل (.xlsx)' },
          { id: 'reports.export.pdf', label: 'تصدير وطباعة تقارير PDF' },
        ],
      },
    ],
  },
  {
    moduleId: 'barcodes',
    modulePerm: 'barcodes.access',
    legacyPerm: 'Barcodes.html',
    label: 'طباعة الباركود',
    description: 'تصميم وطباعة ملصقات الباركود للقطع والأصناف',
    group: 'المخزون والمنتجات',
    tabs: [
      {
        tabId: 'labels',
        label: 'ملصقات الباركود',
        actions: [
          { id: 'barcodes.generate', label: 'توليد أكواد الباركود' },
          { id: 'barcodes.print', label: 'طباعة ملصقات الباركود' },
        ],
      },
    ],
  },
  {
    moduleId: 'worn_products',
    modulePerm: 'worn_products.access',
    legacyPerm: 'WornProducts.html',
    label: 'الهوالك والتوالف',
    description: 'تسجيل المنتجات المهترئة والتالفة واستبعادها من الجرد',
    group: 'المخزون والمنتجات',
    tabs: [
      {
        tabId: 'worn_list',
        label: 'سجل التوالف',
        actions: [
          { id: 'worn_products.view', label: 'عرض سجل المنتجات التالفة' },
          { id: 'worn_products.create', label: 'تسجيل منتج تالف جديد' },
          { id: 'worn_products.delete', label: 'إلغاء أو حذف تسجيل تالف' },
        ],
      },
    ],
  },
  {
    moduleId: 'dashboard',
    modulePerm: 'dashboard.access',
    legacyPerm: 'Dashboard.html',
    label: 'لوحة التحكم والإحصائيات',
    description: 'مؤشرات الأداء السريعة وإحصائيات العمليات اليومية',
    group: 'الإدارة العامة',
    tabs: [
      {
        tabId: 'overview',
        label: 'المؤشرات الرئيسية',
        actions: [
          { id: 'dashboard.stats.view', label: 'عرض إحصائيات ومخططات لوحة التحكم' },
        ],
      },
    ],
  },
  {
    moduleId: 'settings',
    modulePerm: 'settings.access',
    legacyPerm: 'Settings.html',
    label: 'الإعدادات العامة للنظام',
    description: 'إدارة الفروع وبيانات المؤسسة والنسخ الاحتياطي والصلاحيات',
    group: 'الإدارة العامة',
    tabs: [
      {
        tabId: 'general',
        label: 'بيانات المنشأة والطباعة',
        actions: [
          { id: 'settings.store.edit', label: 'تعديل اسم المتجر والشعارات' },
          { id: 'settings.branches.manage', label: 'إدارة الفروع وخيارات التأجير' },
        ],
      },
      {
        tabId: 'security',
        label: 'المستخدمون والأمان',
        actions: [
          { id: 'settings.users.manage', label: 'إدارة حسابات المستخدمين والصلاحيات' },
          { id: 'settings.passwords.manage', label: 'إدارة كلمات سر العمليات الحساسة' },
        ],
      },
      {
        tabId: 'maintenance',
        label: 'النسخ الاحتياطي والصيانة',
        actions: [
          { id: 'settings.backup.export', label: 'تصدير نسخة احتياطية من قاعدة البيانات' },
          { id: 'settings.backup.restore', label: 'استعادة نسخة احتياطية' },
        ],
      },
    ],
  },
];

// Mapping from Legacy page identifier to all granular permissions in that module
const LEGACY_TO_GRANULAR_MAP = {};
const GRANULAR_TO_LEGACY_MAP = {};
const ALL_GRANULAR_PERMISSIONS = [];

HIERARCHICAL_CATALOG.forEach((mod) => {
  const modPerms = [mod.modulePerm];
  if (Array.isArray(mod.tabs)) {
    mod.tabs.forEach((tab) => {
      if (Array.isArray(tab.actions)) {
        tab.actions.forEach((act) => {
          modPerms.push(act.id);
          GRANULAR_TO_LEGACY_MAP[act.id] = mod.legacyPerm;
          ALL_GRANULAR_PERMISSIONS.push(act.id);
        });
      }
    });
  }
  GRANULAR_TO_LEGACY_MAP[mod.modulePerm] = mod.legacyPerm;
  ALL_GRANULAR_PERMISSIONS.push(mod.modulePerm);
  LEGACY_TO_GRANULAR_MAP[mod.legacyPerm] = modPerms;
});

// Explicit additions
LEGACY_TO_GRANULAR_MAP['inventory_admin'] = ['inventory_admin'];
LEGACY_TO_GRANULAR_MAP['inventory_view_all_branches'] = ['inventory_view_all_branches'];
GRANULAR_TO_LEGACY_MAP['inventory_admin'] = 'inventory_admin';
GRANULAR_TO_LEGACY_MAP['inventory_view_all_branches'] = 'inventory_view_all_branches';

/**
 * Rich Permission Definitions for Flat UI fallback
 */
const PERMISSION_DEFINITIONS = HIERARCHICAL_CATALOG.map((mod) => ({
  id: mod.legacyPerm,
  label: mod.label,
  description: mod.description,
  group: mod.group,
})).concat([
  {
    id: INVENTORY_ADMIN_PERMISSION,
    label: 'إدارة متقدمة للمخزون',
    description: 'صلاحية التحويل بين الفروع وتعديل الأصناف والأسعار',
    group: 'صلاحيات متقدمة',
  },
  {
    id: INVENTORY_VIEW_ALL_BRANCHES_PERMISSION,
    label: 'رؤية مخزون كافة الفروع',
    description: 'الاطلاع على أرصدة ومخزون الفروع الأخرى في شاشات الجرد',
    group: 'صلاحيات متقدمة',
  },
]);

const PERMISSION_GROUPS = [
  'المبيعات والتشغيل',
  'الخياطة والتجهيز',
  'المخزون والمنتجات',
  'العملاء والموظفين',
  'المالية والحسابات',
  'الإدارة العامة',
  'صلاحيات متقدمة',
];

const PERMISSION_PRESETS = [
  {
    id: 'all',
    label: 'تحديد الكل',
    permissions: [...ALL_PERMISSIONS, ...EXTRA_PERMISSIONS, ...ALL_GRANULAR_PERMISSIONS],
  },
  {
    id: 'cashier',
    label: 'كاشير ومبيعات فقط',
    permissions: [
      'index.html',
      'pos.access',
      'pos.sales.view',
      'pos.sales.create',
      'pos.invoices.view',
      'pos.invoices.print',
      'Customers.html',
      'customers.access',
      'customers.list.view',
      'customers.create',
      'Expenses.html',
      'expenses.access',
      'expenses.list.view',
      'expenses.create',
    ],
  },
  {
    id: 'rentals_staff',
    label: 'موظف قسم التأجير',
    permissions: [
      'Rentals.html',
      'rentals.access',
      'rentals.contracts.view',
      'rentals.contracts.create',
      'rentals.contracts.edit',
      'rentals.contracts.return',
      'RentalInventory.html',
      'rental_inventory.access',
      'rental_inventory.items.view',
      'Alterations.html',
      'alterations.access',
      'alterations.view',
      'Customers.html',
      'customers.access',
      'customers.list.view',
    ],
  },
  {
    id: 'inventory_staff',
    label: 'مسؤول مخزن',
    permissions: [
      'Suppliers.html',
      'inventory.access',
      'inventory.products.view',
      'inventory.products.create',
      'inventory.transfers.request',
      'RentalInventory.html',
      'rental_inventory.access',
      'rental_inventory.items.view',
      'Barcodes.html',
      'barcodes.access',
      'barcodes.generate',
      'barcodes.print',
      'WornProducts.html',
      'worn_products.access',
      'worn_products.view',
      'worn_products.create',
    ],
  },
  {
    id: 'accountant',
    label: 'محاسب مالي',
    permissions: [
      'Reports.html',
      'reports.access',
      'reports.sales.view',
      'reports.daily.view',
      'reports.monthly.view',
      'reports.master_sheet.view',
      'reports.export.excel',
      'Expenses.html',
      'expenses.access',
      'expenses.list.view',
      'cash_drawer.settlement.view',
      'cash_drawer.settlement.close',
      'Customers.html',
      'Suppliers.html',
    ],
  },
  {
    id: 'clear',
    label: 'إلغاء التحديد',
    permissions: [],
  },
];

function normalizePermissions(permissions) {
  if (Array.isArray(permissions)) return permissions;
  if (!permissions) return [];
  try {
    const parsed = JSON.parse(permissions);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function defaultPermissionsForRole(role) {
  if (role === 'admin') {
    return [...ALL_PERMISSIONS, ...EXTRA_PERMISSIONS, ...ALL_GRANULAR_PERMISSIONS];
  }
  return [...DEFAULT_BRANCH_PERMISSIONS];
}

function getUserPermissions(user) {
  if (!user) return [];
  if (user.role === 'admin') return [...ALL_PERMISSIONS, ...EXTRA_PERMISSIONS, ...ALL_GRANULAR_PERMISSIONS];
  return normalizePermissions(user.permissions);
}

const SENSITIVE_OR_PRIVILEGED_PERMISSIONS = new Set([
  'pos.invoices.edit',
  'pos.invoices.refund',
  'inventory.products.edit',
  'inventory.products.delete',
  'inventory.products.duplicate',
  'inventory_admin',
  'reports.profits.view',
  'employees.payroll.view',
  'employees.payroll.execute',
  'rental_inventory.items.delete',
  'rental_inventory.items.edit',
  'suppliers.delete',
  'customers.delete',
  'expenses.delete',
  'worn_products.delete',
]);

/**
 * Checks whether user has the requested permission.
 * Fully supports both legacy page identifiers (e.g. 'index.html') and granular permissions (e.g. 'pos.sales.create').
 * Sensitive and destructive actions MUST be explicitly assigned and cannot be inherited from broad legacy page permissions.
 */
function hasPermission(user, permission) {
  if (!user) return false;
  if (user.role === 'admin') return true;

  const permissions = getUserPermissions(user);
  if (permissions.includes('*')) return true;
  if (permissions.includes(permission)) return true;

  // Sensitive or destructive actions can NEVER be satisfied by legacy page permissions alone
  if (SENSITIVE_OR_PRIVILEGED_PERMISSIONS.has(permission)) {
    return false;
  }

  // 1. If requested permission is a legacy page identifier (e.g. 'index.html'):
  // User has access if they possess the legacy permission directly, OR module access, OR any non-sensitive granular action in that module
  if (LEGACY_TO_GRANULAR_MAP[permission]) {
    const granularSet = LEGACY_TO_GRANULAR_MAP[permission];
    const hasAnyGranular = granularSet.some((gp) => permissions.includes(gp));
    if (hasAnyGranular) return true;
  }

  // 2. If requested permission is non-sensitive granular (e.g. 'pos.sales.create'):
  // User has access if they hold the granular permission, OR if they have the legacy parent module permission
  const legacyParent = GRANULAR_TO_LEGACY_MAP[permission];
  if (legacyParent && permissions.includes(legacyParent)) {
    return true;
  }

  // 3. If requested permission is module-level access (e.g. 'pos.access'):
  // If user holds any action in that module, grant module access
  if (permission.endsWith('.access')) {
    const prefix = permission.replace(/\.access$/, '');
    const hasAnyInModule = permissions.some((p) => p.startsWith(`${prefix}.`));
    if (hasAnyInModule) return true;
  }

  return false;
}

function hasInventoryAdminAccess(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const permissions = getUserPermissions(user);
  return (
    permissions.includes(INVENTORY_ADMIN_PERMISSION) ||
    permissions.includes('admin') ||
    permissions.includes('manage_inventory') ||
    hasPermission(user, 'inventory.products.edit') ||
    hasPermission(user, 'inventory.transfers.approve')
  );
}

function hasInventoryAllBranchesAccess(user) {
  return Boolean(user && (user.role === 'admin' || user.branch_scope === 'all' || hasPermission(user, INVENTORY_VIEW_ALL_BRANCHES_PERMISSION)));
}

function isBranchScopedUser(user) {
  return Boolean(user && user.role !== 'admin');
}

module.exports = {
  ALL_PERMISSIONS,
  DEFAULT_BRANCH_PERMISSIONS,
  INVENTORY_ADMIN_PERMISSION,
  INVENTORY_VIEW_ALL_BRANCHES_PERMISSION,
  EXTRA_PERMISSIONS,
  HIERARCHICAL_CATALOG,
  LEGACY_TO_GRANULAR_MAP,
  GRANULAR_TO_LEGACY_MAP,
  ALL_GRANULAR_PERMISSIONS,
  PERMISSION_DEFINITIONS,
  PERMISSION_GROUPS,
  PERMISSION_PRESETS,
  normalizePermissions,
  defaultPermissionsForRole,
  getUserPermissions,
  hasPermission,
  hasInventoryAdminAccess,
  hasInventoryAllBranchesAccess,
  isBranchScopedUser,
  SENSITIVE_OR_PRIVILEGED_PERMISSIONS,
};
