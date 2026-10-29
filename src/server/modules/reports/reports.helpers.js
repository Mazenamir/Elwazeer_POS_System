const { hasInventoryAdminAccess } = require('../../../shared/constants/permissions');
const { getCairoDateTimeParts, addDays, getMonthRange } = require('../../../shared/utils/date');

function getReportBranchId(user, query = {}) {
  if (user && user.role !== 'admin') {
    if (!user.branch_id) {
      const err = new Error('Branch user must have a branch_id');
      err.statusCode = 403;
      err.status = 403;
      throw err;
    }
    if (query.branch_id === 'all') {
      const err = new Error('Forbidden: Only administrators can view consolidated multi-branch reports');
      err.statusCode = 403;
      err.status = 403;
      throw err;
    }
    if (query.branch_id && String(query.branch_id) !== String(user.branch_id)) {
      const err = new Error('Forbidden: Cannot access other branch reports');
      err.statusCode = 403;
      err.status = 403;
      throw err;
    }
    return String(user.branch_id);
  }
  if (query.branch_id && query.branch_id !== 'all') {
    return String(query.branch_id);
  }
  return null;
}

function canViewReportProfit(user) {
  return hasInventoryAdminAccess(user);
}

function stripReportProfit(row) {
  const { net_profit, profit, cogs, total_inventory_value, today_profit, month_profit, ...rest } = row || {};
  return rest;
}

function employeeTransactionReportAmountSql(alias = 'et') {
  return `CASE
    WHEN ${alias}.type IN ('salary_payment', 'advance', 'bonus') THEN COALESCE(${alias}.amount, 0)
    WHEN ${alias}.type = 'deduction' THEN -COALESCE(${alias}.amount, 0)
    ELSE 0
  END`;
}

function employeeTransactionRemainingDeltaSql(alias = 'et') {
  return `CASE
    WHEN ${alias}.type = 'bonus' THEN -COALESCE(${alias}.amount, 0)
    WHEN ${alias}.type IN ('salary_payment', 'advance', 'deduction') THEN COALESCE(${alias}.amount, 0)
    ELSE 0
  END`;
}

function normalizePaymentMethod(raw) {
  const norm = String(raw || 'cash').toLowerCase().trim();
  if (['cash', 'نقدي', 'كاش', 'نقدي (كاش)', 'كاش (بالدرج)'].includes(norm)) return 'cash';
  if (['visa', 'card', 'credit', 'بطاقة', 'فيزا', 'بطاقة (فيزا)', 'فيزا / بطاقة', 'فيزا / بطاقات'].includes(norm)) return 'card';
  if (['bank_transfer', 'bank', 'transfer', 'instapay', 'انستاباي', 'تحويل بنكي', 'تحويل', 'انستاباي / تحويل بنكي', 'تحويل بنكي / انستاباي', 'انستاباي / بنكي'].includes(norm)) return 'bank_transfer';
  if (['wallet', 'mobile_wallet', 'smart_wallet', 'فودافون كاش', 'فودافون', 'vodafone', 'vodafone_cash', 'vodafone cash', 'vodafonecash', 'محفظة', 'محفظه', 'محافظ', 'محافظ إلكترونية', 'محفظة إلكترونية', 'فودافون كاش / محفظة'].includes(norm)) return 'wallet';
  if (['split', 'مجزأ', 'mixed', 'دفع مجزأ'].includes(norm)) return 'split';
  if (['debt', 'credit_customer', 'آجل', 'آجل / مديونية'].includes(norm)) return 'debt';
  if (['customer_credit', 'wallet_credit', 'customer_wallet', 'محفظة العميل', 'رصيد العميل', 'إضافة لرصيد محفظة العميل'].includes(norm)) return 'customer_credit';
  return 'cash';
}

function normalizedPaymentMethodSql(column = 'payment_method') {
  const normCol = `LOWER(TRIM(COALESCE(${column}::text, 'cash')))`;
  return `CASE
    WHEN ${normCol} IN ('cash', 'نقدي', 'كاش', 'نقدي (كاش)', 'كاش (بالدرج)') THEN 'cash'
    WHEN ${normCol} IN ('visa', 'card', 'credit', 'بطاقة', 'فيزا', 'بطاقة (فيزا)', 'فيزا / بطاقة', 'فيزا / بطاقات') THEN 'visa'
    WHEN ${normCol} IN ('wallet', 'mobile_wallet', 'smart_wallet', 'فودافون كاش', 'فودافون', 'vodafone', 'vodafone_cash', 'vodafone cash', 'vodafonecash', 'محفظة', 'محفظه', 'محافظ', 'محافظ إلكترونية', 'محفظة إلكترونية', 'فودافون كاش / محفظة') THEN 'wallet'
    WHEN ${normCol} IN ('bank_transfer', 'bank', 'transfer', 'انستاباي', 'instapay', 'تحويل بنكي', 'تحويل', 'انستاباي / تحويل بنكي', 'تحويل بنكي / انستاباي', 'انستاباي / بنكي') THEN 'bank_transfer'
    WHEN ${normCol} IN ('split', 'مجزأ', 'mixed', 'دفع مجزأ') THEN 'split'
    WHEN ${normCol} IN ('debt', 'credit_customer', 'آجل', 'آجل / مديونية') THEN 'debt'
    WHEN ${normCol} IN ('customer_credit', 'wallet_credit', 'customer_wallet', 'محفظة العميل', 'رصيد العميل') THEN 'customer_credit'
    ELSE 'cash'
  END`;
}

function rowsByBranch(rows, valueMapper = row => row) {
  return new Map((rows || []).map(row => [Number(row.branch_id), valueMapper(row)]));
}

function getDayRange(dateKey) {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || '')) ? dateKey : getCairoDateTimeParts().date;
  return { start: safeDate, end: addDays(safeDate, 1) };
}

function parseReportDateRange(query = {}) {
  const cairoNow = getCairoDateTimeParts();
  const dateFrom = query.date_from || query.from;
  const dateTo = query.date_to || query.to;

  const validFrom = dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom);
  const validTo = dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo);

  if (validFrom || validTo) {
    let start = validFrom ? dateFrom : dateTo;
    let endDay = validTo ? dateTo : dateFrom;
    if (start > endDay) {
      const temp = start;
      start = endDay;
      endDay = temp;
    }
    return {
      start,
      end: addDays(endDay, 1),
      dateFrom: start,
      dateTo: endDay,
      label: start === endDay ? start : `${start} إلى ${endDay}`,
      isCustomRange: true,
    };
  }

  if (query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date)) {
    return {
      date: query.date,
      start: query.date,
      end: addDays(query.date, 1),
      dateFrom: query.date,
      dateTo: query.date,
      label: query.date,
      isCustomRange: false,
    };
  }

  if (query.month && /^\d{4}-\d{2}$/.test(query.month)) {
    const [, mStr] = query.month.split('-');
    const mNum = Number(mStr);
    if (mNum >= 1 && mNum <= 12) {
      const mRange = getMonthRange(query.month);
      return {
        start: mRange.start,
        end: mRange.end,
        month: query.month,
        dateFrom: mRange.start,
        dateTo: addDays(mRange.end, -1),
        label: query.month,
        isCustomRange: false,
      };
    }
  }

  // Default to current month
  const cairoDate = cairoNow?.date || new Date().toISOString().slice(0, 10);
  const currentMonth = cairoDate.slice(0, 7);
  const mRange = getMonthRange(currentMonth);
  return {
    start: mRange.start,
    end: mRange.end,
    month: currentMonth,
    dateFrom: mRange.start,
    dateTo: addDays(mRange.end, -1),
    label: currentMonth,
    isCustomRange: false,
  };
}

function sanitizeFormulaValue(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string' && val.length > 0) {
    const firstChar = val.charAt(0);
    if (['=', '+', '-', '@', '\t', '\r'].includes(firstChar)) {
      return `'${val}`;
    }
  }
  return val;
}

function formatCairoDateTime(date = new Date()) {
  try {
    return new Date(date).toLocaleString('ar-EG', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  } catch {
    return new Date(date).toISOString();
  }
}

function getBranchCleanName(name = '') {
  if (!name) return 'كل الفروع';
  const trimmed = String(name).trim();
  const lower = trimmed.toLowerCase();

  if (
    lower === 'all' ||
    lower === 'all_branches' ||
    trimmed === 'كل الفروع' ||
    trimmed === 'كافة الفروع' ||
    trimmed === 'كافة فروع' ||
    trimmed === 'جميع الفروع'
  ) {
    return 'كل الفروع';
  }

  const BRANCH_NAME_ARABIC = {
    '1': 'المخزن الرئيسي',
    '2': 'انطاليا',
    '3': 'الوزير',
    '4': 'الرمل',
    '5': 'بشر',
    '6': 'محرم بك',
    '7': 'العامرية',
    '8': 'العجمي',
    '9': 'دمنهور رجالي',
    '10': 'دمنهور حريمي',
    'elraml': 'الرمل',
    'el raml': 'الرمل',
    'raml': 'الرمل',
    'beshr': 'بشر',
    'moharm bek': 'محرم بك',
    'el amrya': 'العامرية',
    'al agamy': 'العجمي',
    'el agamy': 'العجمي',
    'damnhor man': 'دمنهور رجالي',
    'damnhor woman': 'دمنهور حريمي',
    'antalya': 'انطاليا',
    'el wazer': 'الوزير',
    'elwazer': 'الوزير',
    'main warehouse': 'المخزن الرئيسي',
  };

  if (BRANCH_NAME_ARABIC[lower]) {
    return BRANCH_NAME_ARABIC[lower];
  }

  // Strip system/branding prefixes first to avoid false-matching on company title
  let cleaned = trimmed
    .replace(/^نظام\s+الوزير(\s+المحاسبي)?(\s+المتكامل)?/gi, '')
    .replace(/^نظام\s+بيبيون(\s+والوزير)?/gi, '')
    .replace(/^بيبيون\s+والوزير(\s+لإدارة\s+الفروع)?/gi, '')
    .replace(/^بيبيون\s+للبدل\s+الرجالي(\s*[-–]\s*)?/gi, '')
    .replace(/^بيبيون\s+ب(ال)?/gi, '')
    .replace(/^بيبيون\s+فرع\s+/gi, '')
    .replace(/^بيبيون\s+/gi, '')
    .replace(/^فرع\s+/gi, '')
    .replace(/\s+الرئيسي$/gi, '')
    .trim();

  if (!cleaned || cleaned === 'كل الفروع' || cleaned === 'كافة الفروع') {
    return 'كل الفروع';
  }

  const cleanedLower = cleaned.toLowerCase();
  if (BRANCH_NAME_ARABIC[cleanedLower]) {
    return BRANCH_NAME_ARABIC[cleanedLower];
  }

  // Match known specific branch identifiers
  if (cleaned.includes('رمل') || lower.includes('raml')) return 'الرمل';
  if (cleaned.includes('بشر') || lower.includes('beshr')) return 'بشر';
  if (cleaned.includes('محرم') || lower.includes('moharm')) return 'محرم بك';
  if (cleaned.includes('عامرية') || cleaned.includes('عامريه') || lower.includes('amrya')) return 'العامرية';
  if (cleaned.includes('عجمي') || lower.includes('agamy')) return 'العجمي';
  if (cleaned.includes('مهندسين')) return 'المهندسين';
  if (cleaned.includes('دمنهور رجالي')) return 'دمنهور رجالي';
  if (cleaned.includes('دمنهور حريمي')) return 'دمنهور حريمي';
  if (cleaned.includes('انطاليا') || lower.includes('antalya')) return 'انطاليا';
  if (cleaned.includes('مخزن') || lower.includes('warehouse')) return 'المخزن الرئيسي';

  // Only return 'الوزير' if the branch name is explicitly and strictly that branch
  if (cleaned === 'الوزير' || cleaned === 'وزير' || lower === 'el wazer' || lower === 'elwazer') {
    return 'الوزير';
  }

  return cleaned;
}

function getReportBranchTitle(nameOrId = '', typeOrName = 'daily') {
  let name = nameOrId;
  let type = typeOrName;
  if (typeof nameOrId === 'number' && typeof typeOrName === 'string' && !['daily', 'master', 'salary', 'ohda', 'kpi'].includes(typeOrName)) {
    name = typeOrName;
    type = 'daily';
  }
  const cleanName = getBranchCleanName(name);
  const isAll = cleanName === 'كل الفروع' || name === 'all' || name === 'all_branches';

  if (isAll) {
    switch (type) {
      case 'daily':
      case 'master':
        return 'كل الفروع';
      case 'salary':
        return 'مرتبات كل الفروع';
      case 'ohda':
        return 'عهدة كل الفروع (حضور وسلف)';
      case 'kpi':
        return 'تقييم وأداء البائعين - كل الفروع';
      default:
        return 'كل الفروع';
    }
  }

  const branchSuffix = cleanName.startsWith('فرع') ? cleanName : `فرع ${cleanName}`;
  switch (type) {
    case 'daily':
    case 'master':
      return branchSuffix;
    case 'salary':
      return `مرتبات ${branchSuffix}`;
    case 'ohda':
      return `عهدة ${branchSuffix} (حضور وسلف)`;
    case 'kpi':
      return `تقييم وأداء البائعين - ${branchSuffix}`;
    default:
      return branchSuffix;
  }
}

function getBranchLogoAsset(logoUrl = null) {
  const fs = require('fs');
  const path = require('path');

  const baseCandidates = [
    path.resolve(__dirname, '../../../renderer/logos'),
    path.resolve(__dirname, '../../../renderer/public/logos'),
    path.resolve(process.cwd(), 'src/renderer/logos'),
    path.resolve(process.cwd(), 'src/renderer/public/logos'),
    path.resolve(process.cwd(), 'dist/renderer/logos'),
  ];

  let resolvedPath = null;
  if (logoUrl) {
    const rawName = path.basename(logoUrl);
    for (const dir of baseCandidates) {
      const p = path.join(dir, rawName);
      if (fs.existsSync(p)) {
        resolvedPath = p;
        break;
      }
    }
  }

  // Fallback preference: tightly cropped reference logo, then original bebyoon, then app-icon
  if (!resolvedPath) {
    for (const dir of baseCandidates) {
      const pBebyoonCropped = path.join(dir, 'bebyoon_cropped.png');
      if (fs.existsSync(pBebyoonCropped)) {
        resolvedPath = pBebyoonCropped;
        break;
      }
      const pBebyoon = path.join(dir, 'bebyoon.png');
      if (fs.existsSync(pBebyoon)) {
        resolvedPath = pBebyoon;
        break;
      }
      const pAppIcon = path.join(dir, 'app-icon.png');
      if (fs.existsSync(pAppIcon)) {
        resolvedPath = pAppIcon;
        break;
      }
      const pMen = path.join(dir, 'men.png');
      if (fs.existsSync(pMen)) {
        resolvedPath = pMen;
        break;
      }
    }
  }

  if (resolvedPath && fs.existsSync(resolvedPath)) {
    try {
      const buffer = fs.readFileSync(resolvedPath);
      const ext = path.extname(resolvedPath).replace('.', '').toLowerCase() || 'png';
      const dataUri = `data:image/${ext === 'svg' ? 'svg+xml' : ext};base64,${buffer.toString('base64')}`;
      return {
        path: resolvedPath,
        buffer,
        dataUri,
        extension: ext,
        exists: true
      };
    } catch {
      // return default null
    }
  }

  return {
    path: null,
    buffer: null,
    dataUri: '',
    extension: 'png',
    exists: false
  };
}

async function getBranchBranding(arg1, arg2) {
  let db = null;
  let branchId = null;
  let branchName = null;
  let logoUrl = '/logos/bebyoon_cropped.png';

  if (arg1 && typeof arg1.query === 'function') {
    db = arg1;
    branchId = arg2;
  } else if (typeof arg1 === 'object' && arg1 !== null && !arg1.query) {
    db = arg1.db || null;
    branchId = arg1.branchId || arg1.branch_id || null;
    branchName = arg1.branchName || arg1.branch_name || null;
  } else {
    branchId = arg1;
    if (typeof arg2 === 'string') {
      branchName = arg2;
    }
  }

  const isAll = !branchId || branchId === 'all' || branchId === 'all_branches' || branchName === 'كل الفروع' || branchName === 'all';

  if (!isAll && db && branchId) {
    try {
      const res = await db.query('SELECT id, name, location, type, logo_url FROM branches WHERE id = $1', [branchId]);
      if (res.rows && res.rows.length > 0) {
        branchName = res.rows[0].name || branchName;
        logoUrl = res.rows[0].logo_url || logoUrl;
      }
    } catch {
      // fallback
    }
  }

  const cleanName = isAll ? 'كل الفروع' : getBranchCleanName(branchName || branchId);
  const effectiveBranchName = isAll
    ? 'كل الفروع'
    : (cleanName.startsWith('فرع') ? cleanName : `فرع ${cleanName}`);
  const logoAsset = getBranchLogoAsset(logoUrl);

  const titles = {
    daily: isAll ? 'كل الفروع' : effectiveBranchName,
    master: isAll ? 'كل الفروع' : effectiveBranchName,
    salary: isAll ? 'مرتبات كل الفروع' : `مرتبات ${effectiveBranchName}`,
    ohda: isAll ? 'عهدة كل الفروع (حضور وسلف)' : `عهدة ${effectiveBranchName} (حضور وسلف)`,
    kpi: isAll ? 'تقييم وأداء البائعين - كل الفروع' : `تقييم وأداء البائعين - ${effectiveBranchName}`,
  };

  return {
    isAll: Boolean(isAll),
    branchId: isAll ? 'all' : String(branchId),
    branchName: effectiveBranchName,
    cleanName,
    title: titles.master,
    titles,
    logo: logoAsset,
    logoPath: logoAsset.path,
    logoDataUri: logoAsset.dataUri,
  };
}

function formatPaymentMethodLabel(item) {
  if (!item) return '-';
  const splits = Array.isArray(item.payment_splits)
    ? item.payment_splits
    : (typeof item.payment_splits === 'string' ? (() => { try { return JSON.parse(item.payment_splits); } catch { return null; } })() : null);

  const normMethod = String(item.payment_method || '').toLowerCase().trim();
  const isSplit = ['split', 'مجزأ', 'mixed', 'دفع مجزأ'].includes(normMethod);
  if (isSplit || (splits && splits.length > 1) || (Number(item.cash_amount) > 0 && (Number(item.card_amount) > 0 || Number(item.bank_transfer_amount) > 0 || Number(item.wallet_amount) > 0))) {
    if (splits && splits.length > 0) {
      const parts = splits.map(s => {
        const m = String(s.method || s.payment_method || s.id || '').toLowerCase().trim();
        let mName = 'نقدي';
        if (['visa', 'card', 'credit', 'بطاقة', 'فيزا', 'بطاقة (فيزا)', 'فيزا / بطاقة'].includes(m)) mName = 'فيزا';
        else if (['bank_transfer', 'instapay', 'bank', 'انستاباي', 'تحويل بنكي', 'transfer', 'انستاباي / تحويل بنكي', 'تحويل بنكي / انستاباي', 'انستاباي / بنكي'].includes(m)) mName = 'انستاباي';
        else if (['wallet', 'mobile_wallet', 'smart_wallet', 'فودافون كاش', 'فودافون', 'vodafone', 'vodafone_cash', 'vodafone cash', 'vodafonecash', 'محفظة', 'محفظه', 'محافظ', 'محافظ إلكترونية', 'محفظة إلكترونية', 'فودافون كاش / محفظة'].includes(m)) mName = 'فودافون كاش';
        else if (['debt', 'آجل', 'credit_customer'].includes(m)) mName = 'آجل';
        return `${mName}: ${Number(s.amount || 0)}`;
      });
      return `مجزأ (${parts.join(' + ')})`;
    }
    const parts = [];
    if (Number(item.cash_amount) > 0) parts.push(`نقدي: ${item.cash_amount}`);
    if (Number(item.bank_transfer_amount) > 0) parts.push(`انستاباي: ${item.bank_transfer_amount}`);
    if (Number(item.card_amount) > 0) parts.push(`فيزا: ${item.card_amount}`);
    if (Number(item.wallet_amount) > 0) parts.push(`فودافون كاش: ${item.wallet_amount}`);
    return parts.length > 0 ? `مجزأ (${parts.join(' + ')})` : 'مجزأ';
  }

  const m = String(item.payment_method || '').toLowerCase().trim();
  if (['cash', 'نقدي', 'كاش', 'نقدي (كاش)', 'كاش (بالدرج)'].includes(m)) return 'نقدي';
  if (['visa', 'card', 'credit', 'فيزا', 'بطاقة', 'بطاقة (فيزا)', 'فيزا / بطاقة', 'فيزا / بطاقات'].includes(m)) return 'فيزا';
  if (['bank_transfer', 'bank', 'transfer', 'instapay', 'انستاباي', 'تحويل بنكي', 'انستاباي / تحويل بنكي', 'تحويل بنكي / انستاباي', 'انستاباي / بنكي'].includes(m)) return 'تحويل بنكي / انستاباي';
  if (['wallet', 'mobile_wallet', 'smart_wallet', 'فودافون كاش', 'فودافون', 'vodafone', 'vodafone_cash', 'vodafone cash', 'vodafonecash', 'محفظة', 'محفظه', 'محافظ', 'محافظ إلكترونية', 'محفظة إلكترونية', 'فودافون كاش / محفظة'].includes(m)) return 'فودافون كاش';
  if (['debt', 'آجل', 'credit_customer', 'آجل / مديونية'].includes(m)) return 'آجل';
  return item.payment_method || '-';
}

/**
 * Aligns the 4 parallel operational tracks of a single day into the exact 20 columns (A to T)
 * matching reference workbook "مجمع بيبيون الرمل نوفمبر2026.xlsm":
 * A: التاريخ (invoice_date)
 * B: رقم الفاتورة (invoice_number)
 * C: البيان  (description)
 * D: الأجمالي (total_amount)
 * E: المدفوع  (paid_amount)
 * F: الباقي (remaining_amount)
 * G: أسم البائع (seller_name)
 * H: تاريخ الأستلام (delivery_date)
 * I: الموظف (advance employee name)
 * J: السلف (advance amount)
 * K: مصروفات آخرى (expense description)
 * L: المبلغ (expense amount)
 * M: نوع الدفع الإلكتروني (electronic payment type)
 * N: رقم المرجع / الفاتورة (electronic ref)
 * O: المبلغ الإلكتروني (electronic amount)
 * P: أسماء الموظفين  (attendance employee name)
 * Q: وقت الحضور  (check-in time)
 * R: وقت الانصراف (check-out time)
 * S: عداد الساعات (worked hours)
 * T: ملاحظات (attendance notes)
 */
function buildDaily20ColumnRows(d, options = {}) {
  const staffList = [...(d?.attendance || [])];
  const staffNames = new Set(staffList.map(s => s.employee_name));
  const staffIds = new Set(staffList.map(s => String(s.employee_id)));
  (d?.advances || []).forEach(adv => {
    if (!staffNames.has(adv.employee_name) && (!adv.employee_id || !staffIds.has(String(adv.employee_id)))) {
      staffList.push({
        employee_id: adv.employee_id,
        employee_name: adv.employee_name,
        total_hours: 0,
        status: 'absent',
        notes: 'سلفة',
      });
      staffNames.add(adv.employee_name);
      if (adv.employee_id) staffIds.add(String(adv.employee_id));
    }
  });

  const advanceByEmp = new Map();
  (d?.advances || []).forEach(adv => {
    const keyName = adv.employee_name;
    const keyId = adv.employee_id ? String(adv.employee_id) : null;
    const current = (advanceByEmp.get(keyName)?.amount || 0) + Number(adv.amount || 0);
    const combined = { employee_name: keyName, employee_id: adv.employee_id, amount: current };
    advanceByEmp.set(keyName, combined);
    if (keyId) advanceByEmp.set(keyId, combined);
  });

  const deductionItems = [];
  (d?.expenses || []).forEach(exp => {
    const expMethod = formatPaymentMethodLabel(exp);
    const desc = exp.payment_method && exp.payment_method !== 'cash'
      ? `${exp.description} (${expMethod})`
      : exp.description;
    deductionItems.push({
      description: desc,
      amount: Number(exp.amount || 0),
    });
  });
  (d?.supplier_payments || []).forEach(sp => {
    deductionItems.push({
      description: `سداد مورد (كاش): ${sp.supplier_name}${sp.notes ? ` - ${sp.notes}` : ''}`,
      amount: Number(sp.amount || 0),
    });
  });

  const electronicPayments = [];
  (d?.sales_invoices || []).forEach(inv => {
    if (inv.payment_splits && Array.isArray(inv.payment_splits) && inv.payment_splits.length > 0) {
      inv.payment_splits.forEach(s => {
        const m = (s.method || '').toLowerCase();
        const a = Number(s.amount || 0);
        if (a > 0 && m !== 'cash') {
          let label = 'إلكتروني';
          if (m === 'card' || m === 'visa') label = 'فيزا';
          else if (m === 'bank_transfer' || m === 'bank' || m === 'instapay') label = 'انستاباي';
          else if (m === 'wallet') label = 'فودافون كاش';
          electronicPayments.push({
            type: label,
            ref: inv.invoice_number || inv.id,
            amount: a,
            notes: inv.seller_name || '',
          });
        }
      });
    } else {
      const pm = (inv.payment_method || '').toLowerCase();
      const cardAmt = Number(inv.card_amount || 0);
      const bankAmt = Number(inv.bank_transfer_amount || 0);
      const walletAmt = Number(inv.wallet_amount || 0);
      if (cardAmt > 0) electronicPayments.push({ type: 'فيزا', ref: inv.invoice_number, amount: cardAmt });
      if (bankAmt > 0) electronicPayments.push({ type: 'انستاباي', ref: inv.invoice_number, amount: bankAmt });
      if (walletAmt > 0) electronicPayments.push({ type: 'فودافون كاش', ref: inv.invoice_number, amount: walletAmt });
      if (cardAmt === 0 && bankAmt === 0 && walletAmt === 0 && pm !== 'cash' && Number(inv.paid_amount || 0) > 0) {
        let label = 'إلكتروني';
        if (pm === 'visa' || pm === 'card') label = 'فيزا';
        else if (pm === 'bank_transfer' || pm === 'instapay') label = 'انستاباي';
        else if (pm === 'wallet') label = 'فودافون كاش';
        electronicPayments.push({ type: label, ref: inv.invoice_number || inv.id, amount: Number(inv.paid_amount || 0) });
      }
    }
  });

  const rawCount = Math.max(
    (d?.sales_invoices || []).length,
    deductionItems.length,
    staffList.length,
    electronicPayments.length
  );
  const minRows = options.minRows !== undefined ? options.minRows : (rawCount > 0 ? rawCount : 0);
  const rowCount = Math.max(rawCount, minRows);

  const rows = [];
  for (let i = 0; i < rowCount; i++) {
    const inv = (d?.sales_invoices || [])[i] || null;
    const staff = staffList[i] || null;
    const ded = deductionItems[i] || null;
    const ep = electronicPayments[i] || null;

    let advAmount = null;
    if (staff) {
      const adv = advanceByEmp.get(staff.employee_name) || (staff.employee_id ? advanceByEmp.get(String(staff.employee_id)) : null);
      if (adv && adv.amount > 0) advAmount = adv.amount;
    }

    const rowObj = {
      col_a_date: inv?.invoice_date || options.date || (inv ? d?.date : '') || '',
      col_b_invoice_number: inv ? (inv.invoice_number || '') : '',
      col_c_description: inv ? (inv.description || '') : '',
      col_d_total: inv ? Number(inv.total_amount || 0) : null,
      col_e_paid: inv ? Number(inv.paid_amount || 0) : null,
      col_f_remaining: inv ? Math.max(0, Number(inv.total_amount || 0) - Number(inv.paid_amount || 0)) : null,
      col_g_seller: inv ? (inv.seller_name || '') : '',
      col_h_delivery_date: inv ? (inv.delivery_date || inv.invoice_date || '') : '',
      col_i_advance_emp: staff ? staff.employee_name : '',
      col_j_advance_amount: advAmount,
      col_k_expense_desc: ded ? ded.description : '',
      col_l_expense_amount: ded ? ded.amount : null,
      col_m_electronic_type: ep ? ep.type : '',
      col_n_electronic_ref: ep ? ep.ref : '',
      col_o_electronic_amount: ep ? ep.amount : null,
      col_p_attendance_emp: staff ? staff.employee_name : '',
      col_q_check_in: staff ? (staff.check_in_24 || staff.check_in || '') : '',
      col_r_check_out: staff ? (staff.check_out_24 || staff.check_out || '') : '',
      col_s_hours: staff ? (staff.total_hours > 0 ? staff.total_hours : '') : '',
      col_t_notes: staff ? (staff.notes || (staff.status === 'absent' ? 'غياب' : '')) : '',

      // Legacy field aliases
      a_customer_name: inv ? (inv.description || inv.invoice_number || '') : '',
      b_seller_name: inv ? (inv.seller_name || '') : '',
      c_deposit: inv ? Number(inv.paid_amount || 0) : null,
      d_total_order: inv ? Number(inv.total_amount || 0) : null,
      e_paid_cash: inv ? Number(inv.paid_amount || 0) : null,
      f_remaining: inv ? Math.max(0, Number(inv.total_amount || 0) - Number(inv.paid_amount || 0)) : null,
      g_seller_tracker: inv ? (inv.seller_name || '') : '',
      h_advance_collector: staff ? staff.employee_name : '',
      i_advance_emp_name: staff ? staff.employee_name : '',
      j_advance_amount: advAmount,
      k_receipt_num: ded ? ded.description : '',
      l_expense_amount: ded ? ded.amount : null,
      m_expense_notes: ded ? ded.description : '',
      n_expense_category: ep ? ep.type : '',
      o_tailor_amount: ep ? ep.amount : null,
      p_emp_name: staff ? staff.employee_name : '',
      q_check_in: staff ? (staff.check_in_24 || staff.check_in || '') : '',
      r_check_out: staff ? (staff.check_out_24 || staff.check_out || '') : '',
      s_att_hours: staff ? (staff.total_hours > 0 ? staff.total_hours : '') : '',
      t_notes: staff ? (staff.notes || (staff.status === 'absent' ? 'غياب' : '')) : '',
    };
    rows.push(rowObj);
  }

  const totalD76 = d?.summary?.total_sales || 0;
  const totalE76 = d?.summary?.total_paid || 0;
  const totalJ76 = d?.summary?.total_advances || 0;
  const totalL76 = (d?.summary?.total_expenses || 0) + (d?.summary?.total_supplier_cash_payments || 0);
  const totalO76 = Number(d?.summary?.electronic_collections || 0);
  const totalK77 = totalJ76 + totalL76 + totalO76;
  const totalD77 = totalE76 - totalK77;

  return {
    rows,
    summary: {
      total_sales: totalD76,
      total_paid: totalE76,
      total_paid_cash: totalE76,
      total_advances: totalJ76,
      total_expenses: totalL76,
      total_electronic: totalO76,
      total_drawer_deductions: totalK77,
      net_cash_drawer: totalD77,
      cash_in_drawer: totalD77,
      k77: totalK77,
      d77: totalD77,
      e76: totalE76,
      j76: totalJ76,
      l76: totalL76,
      o76: totalO76,
    }
  };
}

module.exports = {
  getReportBranchId,
  canViewReportProfit,
  stripReportProfit,
  employeeTransactionReportAmountSql,
  employeeTransactionRemainingDeltaSql,
  normalizePaymentMethod,
  normalizedPaymentMethodSql,
  rowsByBranch,
  getDayRange,
  parseReportDateRange,
  sanitizeFormulaValue,
  formatCairoDateTime,
  getBranchCleanName,
  cleanBranchName: getBranchCleanName,
  getReportBranchTitle,
  generateBranchReportTitle: getReportBranchTitle,
  getBranchLogoAsset,
  getBranchBranding,
  generateReportBrandingMetadata: getBranchBranding,
  formatPaymentMethodLabel,
  buildDaily20ColumnRows,
};


