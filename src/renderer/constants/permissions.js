/**
 * Granular Permissions Definitions & Presets for Frontend
 */

export const PERMISSION_DEFINITIONS = [
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

export const PERMISSION_GROUPS = [
  'المبيعات والتشغيل',
  'الخياطة والتجهيز',
  'المخزون والمنتجات',
  'العملاء والموظفين',
  'المالية والحسابات',
  'الإدارة العامة',
  'صلاحيات متقدمة',
];

export const PERMISSION_PRESETS = [
  {
    id: 'all',
    label: 'تحديد الكل',
    permissions: PERMISSION_DEFINITIONS.map((p) => p.id),
  },
  {
    id: 'cashier',
    label: 'كاشير ومبيعات',
    permissions: ['index.html', 'Customers.html', 'Expenses.html'],
  },
  {
    id: 'rentals',
    label: 'قسم التأجير',
    permissions: ['Rentals.html', 'RentalInventory.html', 'Alterations.html', 'Customers.html'],
  },
  {
    id: 'tailoring',
    label: 'تفصيل وخياطة',
    permissions: ['Tailoring.html', 'Alterations.html', 'Customers.html'],
  },
  {
    id: 'inventory',
    label: 'مسؤول مخزن',
    permissions: ['RentalInventory.html', 'Suppliers.html', 'Barcodes.html', 'WornProducts.html'],
  },
  {
    id: 'accountant',
    label: 'محاسب مالي',
    permissions: ['Expenses.html', 'Reports.html', 'Customers.html', 'Suppliers.html'],
  },
  {
    id: 'clear',
    label: 'إلغاء التحديد',
    permissions: [],
  },
];

export function normalizePermissions(perms) {
  if (Array.isArray(perms)) return perms;
  if (!perms) return [];
  try {
    return JSON.parse(perms);
  } catch {
    return [];
  }
}
