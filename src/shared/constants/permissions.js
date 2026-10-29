/**
 * System Permissions & Role Definitions
 * Extracted from legacy server.js - 100% Preserved Business Logic
 */

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
 * Rich Permission Definitions for Customizable Manual RBAC UI
 */
const PERMISSION_DEFINITIONS = [
  {
    id: 'index.html',
    label: 'الكاشير والفواتير (POS)',
    description: 'تسجيل فواتير المبيعات، البحث، الاسترجاع، وسداد المتبقي',
    group: 'المبيعات والتشغيل',
  },
  {
    id: 'Rentals.html',
    label: 'عقود التأجير',
    description: 'حجز وتسليم واسترجاع فساتين وبدل التأجير وسداد الحسابات',
    group: 'المبيعات والتشغيل',
  },
  {
    id: 'RentalInventory.html',
    label: 'مخزون التأجير',
    description: 'إدارة قطع ومقاسات مخزون التأجير والتحقق من التوفر',
    group: 'المخزون والمنتجات',
  },
  {
    id: 'Suppliers.html',
    label: 'المخزون والموردين',
    description: 'إدارة المنتجات والتوريدات وحسابات الموردين والشراء',
    group: 'المخزون والمنتجات',
  },
  {
    id: 'Alterations.html',
    label: 'التعديلات والبروفات',
    description: 'تسجيل ومتابعة بروفات وتعديلات الفساتين ومواعيد التسليم',
    group: 'الخياطة والتجهيز',
  },
  {
    id: 'Tailoring.html',
    label: 'التفصيل والخياطة',
    description: 'إدارة طلبات ومراحل تفصيل الملابس الرجالي والحريمي',
    group: 'الخياطة والتجهيز',
  },
  {
    id: 'Customers.html',
    label: 'دليل العملاء والديون',
    description: 'بيانات العملاء، سجلات المشتريات، وكشوف الحساب والمديونيات',
    group: 'العملاء والموظفين',
  },
  {
    id: 'Employees.html',
    label: 'شؤون الموظفين والرواتب',
    description: 'الحضور والانصراف، السلف، ومسير الرواتب الشهرية والخصومات',
    group: 'العملاء والموظفين',
  },
  {
    id: 'Expenses.html',
    label: 'المصروفات والعهد والدرج',
    description: 'تسجيل المصروفات النقدية، تقفيل الدرج اليومي، وإدارة العهد',
    group: 'المالية والحسابات',
  },
  {
    id: 'Reports.html',
    label: 'التقارير والأرباح',
    description: 'تقارير الأرباح والمبيعات ومسير الرواتب المعتمد والإكسيل',
    group: 'المالية والحسابات',
  },
  {
    id: 'Barcodes.html',
    label: 'طباعة الباركود',
    description: 'تصميم وطباعة ملصقات الباركود للقطع والأصناف',
    group: 'المخزون والمنتجات',
  },
  {
    id: 'WornProducts.html',
    label: 'الهوالك والتوالف',
    description: 'تسجيل المنتجات المهترئة والتالفة واستبعادها من الجرد',
    group: 'المخزون والمنتجات',
  },
  {
    id: 'Dashboard.html',
    label: 'لوحة التحكم والإحصائيات',
    description: 'مؤشرات الأداء السريعة وإحصائيات العمليات اليومية',
    group: 'الإدارة العامة',
  },
  {
    id: 'Settings.html',
    label: 'الإعدادات العامة للنظام',
    description: 'إدارة الفروع وبيانات المؤسسة والنسخ الاحتياطي',
    group: 'الإدارة العامة',
  },
  {
    id: 'inventory_admin',
    label: 'إدارة متقدمة للمخزون',
    description: 'صلاحية التحويل بين الفروع وتعديل الأصناف والأسعار',
    group: 'صلاحيات متقدمة',
  },
  {
    id: 'inventory_view_all_branches',
    label: 'رؤية مخزون كافة الفروع',
    description: 'الاطلاع على أرصدة ومخزون الفروع الأخرى في شاشات الجرد',
    group: 'صلاحيات متقدمة',
  },
];

function normalizePermissions(permissions) {
  if (Array.isArray(permissions)) return permissions;
  if (!permissions) return [];
  try {
    return JSON.parse(permissions);
  } catch {
    return [];
  }
}

function defaultPermissionsForRole(role) {
  if (role === 'admin') {
    return [...ALL_PERMISSIONS, ...EXTRA_PERMISSIONS];
  }
  return [...DEFAULT_BRANCH_PERMISSIONS];
}

function getUserPermissions(user) {
  if (!user) return [];
  if (user.role === 'admin') return [...ALL_PERMISSIONS, ...EXTRA_PERMISSIONS];
  return normalizePermissions(user.permissions);
}

function hasPermission(user, permission) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const permissions = getUserPermissions(user);
  return permissions.includes(permission);
}

function hasInventoryAdminAccess(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const permissions = getUserPermissions(user);
  return permissions.includes(INVENTORY_ADMIN_PERMISSION) ||
    permissions.includes('admin') ||
    permissions.includes('manage_inventory');
}

function hasInventoryAllBranchesAccess(user) {
  return Boolean(user && (user.role === 'admin' || hasPermission(user, INVENTORY_VIEW_ALL_BRANCHES_PERMISSION)));
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
  PERMISSION_DEFINITIONS,
  normalizePermissions,
  defaultPermissionsForRole,
  getUserPermissions,
  hasPermission,
  hasInventoryAdminAccess,
  hasInventoryAllBranchesAccess,
  isBranchScopedUser,
};

