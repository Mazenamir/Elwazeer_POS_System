export function formatCurrency(amount, currency = 'ج.م') {
  const num = Number(amount || 0);
  return `${num.toLocaleString('ar-EG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency}`;
}

export function formatNumber(num) {
  const val = Number(num || 0);
  return val.toLocaleString('ar-EG');
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function clampInt(val, min, max, defaultVal = min) {
  const parsed = parseInt(val, 10);
  if (isNaN(parsed)) return defaultVal;
  return Math.min(Math.max(parsed, min), max);
}

export function calculateDiscount(total, discountValue, discountType = 'amount') {
  const numTotal = Number(total || 0);
  const numDisc = Number(discountValue || 0);
  if (discountType === 'percent') {
    return Math.max(0, (numTotal * numDisc) / 100);
  }
  return Math.max(0, Math.min(numDisc, numTotal));
}

export default {
  formatCurrency,
  formatNumber,
  clamp,
  clampInt,
  calculateDiscount,
};
