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

  const parsedSplits = Array.isArray(splits)
    ? splits
    : (typeof splits === 'string' ? (() => { try { return JSON.parse(splits); } catch { return null; } })() : null);

  if (norm === 'split' || norm === 'mixed' || (parsedSplits && parsedSplits.length > 1)) {
    if (parsedSplits && parsedSplits.length > 0) {
      const parts = parsedSplits.map((s) => {
        const mLabel = getPaymentMethodArabic(s.method);
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
      return 'نقدي (كاش)';
    case 'card':
    case 'visa':
    case 'credit':
    case 'بطاقة':
    case 'فيزا':
      return 'فيزا / بطاقة';
    case 'bank_transfer':
    case 'bank':
    case 'instapay':
    case 'انستاباي':
    case 'تحويل بنكي':
      return 'تحويل بنكي / انستاباي';
    case 'wallet':
    case 'mobile_wallet':
    case 'فودافون كاش':
    case 'محفظة':
      return 'فودافون كاش / محفظة';
    case 'debt':
    case 'credit_customer':
    case 'آجل':
      return 'آجل / مديونية';
    default:
      return method || 'نقدي (كاش)';
  }
}

export default {
  formatReceiptDate,
  getPaymentMethodArabic,
};
