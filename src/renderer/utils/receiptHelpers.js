/**
 * Helper utilities for thermal receipts and invoices
 */

/**
 * Format date & time matching reference receipt styling:
 * Example: "8:28:13 , 2026/10/10 م"
 *
 * @param {string|Date} dateInput
 * @returns {string}
 */
export function formatReceiptDate(dateInput) {
  try {
    const d = dateInput ? new Date(dateInput) : new Date();
    if (isNaN(d.getTime())) return '';

    let hours = d.getHours();
    const ampm = hours >= 12 ? 'م' : 'ص';
    hours = hours % 12 || 12;
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');

    return `${ampm} ${hours}:${minutes}:${seconds} , ${year}/${month}/${day}`;
  } catch {
    return '';
  }
}

/**
 * Translate payment method code to clean Arabic label
 *
 * @param {string} method
 * @param {Array} splits
 * @returns {string}
 */
export function getPaymentMethodArabic(method, splits = null) {
  const norm = String(method || '').toLowerCase().trim();

  let parsedSplits = null;
  if (Array.isArray(splits)) {
    parsedSplits = splits;
  } else if (typeof splits === 'string') {
    try { parsedSplits = JSON.parse(splits); } catch { parsedSplits = null; }
  } else if (splits && typeof splits === 'object') {
    if (Array.isArray(splits.payment_splits)) {
      parsedSplits = splits.payment_splits;
    } else if (typeof splits.payment_splits === 'string') {
      try { parsedSplits = JSON.parse(splits.payment_splits); } catch { parsedSplits = null; }
    }
    if (!parsedSplits || parsedSplits.length === 0) {
      const generated = [];
      if (Number(splits.cash_amount) > 0) generated.push({ method: 'cash', amount: Number(splits.cash_amount) });
      if (Number(splits.bank_transfer_amount) > 0) generated.push({ method: 'bank_transfer', amount: Number(splits.bank_transfer_amount) });
      if (Number(splits.card_amount) > 0) generated.push({ method: 'card', amount: Number(splits.card_amount) });
      if (Number(splits.wallet_amount) > 0) generated.push({ method: 'wallet', amount: Number(splits.wallet_amount) });
      if (generated.length > 0) parsedSplits = generated;
    }
  }

  const isSplitMethod = ['split', 'مجزأ', 'mixed', 'دفع مجزأ'].includes(norm);

  if (isSplitMethod || (parsedSplits && parsedSplits.length > 1)) {
    if (parsedSplits && parsedSplits.length > 0) {
      const parts = parsedSplits.map((s) => {
        const rawM = String(s.method || s.payment_method || s.id || '').toLowerCase().trim();
        let mLabel = 'نقدي';
        if (['visa', 'card', 'credit', 'بطاقة', 'فيزا', 'بطاقة (فيزا)', 'فيزا / بطاقة', 'فيزا / بطاقات'].includes(rawM)) mLabel = 'فيزا';
        else if (['bank_transfer', 'instapay', 'bank', 'انستاباي', 'تحويل بنكي', 'transfer', 'انستاباي / تحويل بنكي', 'تحويل بنكي / انستاباي', 'انستاباي / بنكي'].includes(rawM)) mLabel = 'انستاباي';
        else if (['wallet', 'mobile_wallet', 'smart_wallet', 'فودافون كاش', 'فودافون', 'vodafone', 'vodafone_cash', 'vodafone cash', 'vodafonecash', 'محفظة', 'محفظه', 'محافظ', 'محافظ إلكترونية', 'محفظة إلكترونية', 'فودافون كاش / محفظة'].includes(rawM)) mLabel = 'فودافون كاش';
        else if (['debt', 'آجل', 'credit_customer', 'آجل / مديونية'].includes(rawM)) mLabel = 'آجل';
        const amt = Number(s.amount || 0).toLocaleString('ar-EG');
        return `${mLabel}: ${amt} ج.م`;
      });
      return `مجزأ (${parts.join(' + ')})`;
    }
    return 'دفع مجزأ';
  }

  switch (norm) {
    case 'cash':
    case 'نقدي':
    case 'كاش':
    case 'نقدي (كاش)':
    case 'كاش (بالدرج)':
      return 'نقدي (كاش)';
    case 'card':
    case 'visa':
    case 'credit':
    case 'بطاقة':
    case 'فيزا':
    case 'بطاقة (فيزا)':
    case 'فيزا / بطاقة':
    case 'فيزا / بطاقات':
      return 'فيزا / بطاقة';
    case 'bank_transfer':
    case 'bank':
    case 'instapay':
    case 'transfer':
    case 'انستاباي':
    case 'تحويل بنكي':
    case 'تحويل':
    case 'انستاباي / تحويل بنكي':
    case 'تحويل بنكي / انستاباي':
    case 'انستاباي / بنكي':
      return 'تحويل بنكي / انستاباي';
    case 'wallet':
    case 'mobile_wallet':
    case 'smart_wallet':
    case 'فودافون كاش':
    case 'فودافون':
    case 'vodafone':
    case 'vodafone_cash':
    case 'vodafone cash':
    case 'vodafonecash':
    case 'محفظة':
    case 'محفظه':
    case 'محافظ':
    case 'محافظ إلكترونية':
    case 'محفظة إلكترونية':
    case 'فودافون كاش / محفظة':
      return 'فودافون كاش';
    case 'debt':
    case 'credit_customer':
    case 'آجل':
    case 'آجل / مديونية':
      return 'آجل / مديونية';
    default:
      return method || 'نقدي (كاش)';
  }
}

export default {
  formatReceiptDate,
  getPaymentMethodArabic,
};
