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
 * @returns {string}
 */
export function getPaymentMethodArabic(method) {
  switch (String(method || '').toLowerCase()) {
    case 'cash':
      return 'كاش';
    case 'card':
    case 'visa':
    case 'credit':
      return 'فيزا / بطاقة';
    case 'wallet':
      return 'محفظة إلكترونية';
    case 'debt':
    case 'credit_customer':
      return 'آجل';
    case 'mixed':
      return 'دفع متعدد';
    default:
      return method || 'كاش';
  }
}

export default {
  formatReceiptDate,
  getPaymentMethodArabic,
};
