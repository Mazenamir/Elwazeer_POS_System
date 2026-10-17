// src/renderer/utils/barcodePrint.js
// Dedicated thermal barcode generator and printer utility supporting 80mm rolls & sticker formats
import JsBarcode from 'jsbarcode';
import { printHtml } from './print';

export const PAPER_TYPES = [
  {
    id: 'thermal-80mm',
    label: 'ورق حراري 80 مم (طابعة فواتير)',
    shortLabel: 'حراري 80 مم',
    description: 'عرض 72 مم يناسب طابعات الإيصالات الحرارية القياسية مع خط فاصل بين الملصقات',
    isDefault: true,
  },
  {
    id: 'sticker-38x25mm',
    label: 'ملصقات ستيكر 38×25 مم',
    shortLabel: 'ستيكر 38×25',
    description: 'ملصق لاصق صغير مقاس 38×25 مم للملابس والمنتجات الفردية',
  },
  {
    id: 'sticker-50x30mm',
    label: 'ملصقات ستيكر 50×30 مم',
    shortLabel: 'ستيكر 50×30',
    description: 'ملصق لاصق متوسط مقاس 50×30 مم للأحذية والقطع الكبيرة',
  },
];

/**
 * Escape HTML special characters for safe template rendering
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generate a crisp vector SVG string for CODE128 barcode
 *
 * @param {string|number} barcodeValue - The barcode number or code
 * @param {string} paperType - 'thermal-80mm' | 'sticker-38x25mm' | 'sticker-50x30mm'
 * @returns {string} SVG HTML string or fallback text representation
 */
export function generateBarcodeSvg(barcodeValue, paperType = 'thermal-80mm') {
  const is38 = paperType === 'sticker-38x25mm';
  const is50 = paperType === 'sticker-50x30mm';

  // Crisp line widths and heights tailored for 203 DPI thermal printheads
  const barWidth = is38 ? 1.05 : is50 ? 1.3 : 1.55;
  const barHeight = is38 ? 24 : is50 ? 30 : 42;

  const raw = String(barcodeValue ?? '').trim() || '000000';

  if (typeof document !== 'undefined') {
    try {
      const svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      JsBarcode(svgNode, raw, {
        format: 'CODE128',
        width: barWidth,
        height: barHeight,
        displayValue: false,
        margin: 0,
        lineColor: '#000000',
        background: '#ffffff',
      });
      if (!svgNode.getAttribute('xmlns')) {
        svgNode.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      }
      svgNode.setAttribute('style', 'max-width: 100%; height: auto; display: block; margin: 0 auto;');
      return svgNode.outerHTML;
    } catch (err) {
      console.warn(`JsBarcode CODE128 failed for "${raw}", attempting sanitized fallback:`, err);
      try {
        const sanitized = raw.replace(/[^a-zA-Z0-9]/g, '') || '000000';
        const svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        JsBarcode(svgNode, sanitized, {
          format: 'CODE128',
          width: barWidth,
          height: barHeight,
          displayValue: false,
          margin: 0,
          lineColor: '#000000',
          background: '#ffffff',
        });
        if (!svgNode.getAttribute('xmlns')) {
          svgNode.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        }
        svgNode.setAttribute('style', 'max-width: 100%; height: auto; display: block; margin: 0 auto;');
        return svgNode.outerHTML;
      } catch (err2) {
        console.error('JsBarcode fallback failed:', err2);
      }
    }
  }

  return `<div style="font-family: monospace; font-size: 11px; font-weight: bold; padding: 2px 6px; border: 1px dashed #000; text-align: center;">${escapeHtml(raw)}</div>`;
}

/**
 * Generate full self-contained printable HTML document for barcodes
 *
 * @param {Array<object>} queue - Array of barcode items to print
 * @param {string} paperType - 'thermal-80mm' | 'sticker-38x25mm' | 'sticker-50x30mm'
 * @param {string} storeName - Store name to print at top (default: 'Bebyoon Center')
 * @returns {string} Full HTML document string ready for isolated iframe printing
 */
export function generateBarcodePrintHtml(queue, paperType = 'thermal-80mm', storeName = 'Bebyoon Center') {
  const is38 = paperType === 'sticker-38x25mm';
  const is50 = paperType === 'sticker-50x30mm';
  const is80 = !is38 && !is50;

  const activeStore = storeName || 'Bebyoon Center';

  if (is80) {
    // 80mm continuous thermal roll (active printable width 72mm)
    const itemsHtml = queue
      .map((item) => {
        const svgHtml = generateBarcodeSvg(item.barcode, 'thermal-80mm');
        const origPrice = Number(item.originalPrice ?? item.price ?? 0);
        const hasDiscount =
          item.discountPrice !== null &&
          item.discountPrice !== undefined &&
          Number(item.discountPrice) > 0 &&
          Number(item.discountPrice) < origPrice;
        const finalPrice = hasDiscount ? Number(item.discountPrice) : origPrice;

        const variantParts = [];
        if (item.color) variantParts.push(`لون: ${item.color}`);
        if (item.size) variantParts.push(`مقاس: ${item.size}`);
        const variantText = variantParts.join(' - ');

        return `
        <div class="barcode-ticket-80">
          <div class="barcode-store">${escapeHtml(activeStore)}</div>
          <div class="barcode-title">${escapeHtml(item.name || 'منتج')}</div>
          ${variantText ? `<div class="barcode-variant">${escapeHtml(variantText)}</div>` : ''}
          <div class="barcode-graphic">
            ${svgHtml}
          </div>
          <div class="barcode-code">${escapeHtml(item.barcode)}</div>
          <div class="barcode-price">
            ${
              hasDiscount
                ? `<span class="barcode-price-orig">${origPrice} ج.م</span>
                   <span class="barcode-price-final">${finalPrice} ج.م</span>`
                : `<span class="barcode-price-final">${finalPrice} ج.م</span>`
            }
          </div>
        </div>`;
      })
      .join('\n');

    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>طباعة باركود - ورق حراري 80 مم</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    @page {
      size: 80mm auto;
      margin: 0;
    }
    html, body {
      width: 80mm;
      margin: 0 auto;
      padding: 0;
      background: #ffffff;
      font-family: 'Cairo', Tahoma, Arial, sans-serif;
      direction: rtl;
      color: #000000;
    }
    .thermal-container {
      width: 72mm;
      margin: 0 auto;
      padding: 2mm 0;
    }
    .barcode-ticket-80 {
      padding: 5mm 1mm;
      border-bottom: 2px dashed #000000;
      page-break-inside: avoid;
      break-inside: avoid;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      box-sizing: border-box;
    }
    .barcode-store {
      font-size: 13pt;
      font-weight: 900;
      letter-spacing: -0.3px;
      line-height: 1.1;
      margin-bottom: 2px;
    }
    .barcode-title {
      font-size: 11pt;
      font-weight: 800;
      line-height: 1.25;
      word-break: break-word;
      max-width: 70mm;
      margin-bottom: 2px;
    }
    .barcode-variant {
      font-size: 9pt;
      font-weight: 700;
      color: #222222;
      line-height: 1.2;
      margin-bottom: 3px;
    }
    .barcode-graphic {
      margin: 3px 0 2px 0;
      max-width: 66mm;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .barcode-graphic svg {
      max-width: 66mm;
      height: auto;
    }
    .barcode-code {
      font-family: 'Courier New', Courier, monospace;
      font-size: 10.5pt;
      font-weight: 900;
      letter-spacing: 2px;
      line-height: 1.1;
      margin-top: 1px;
    }
    .barcode-price {
      font-size: 12.5pt;
      font-weight: 900;
      line-height: 1.2;
      margin-top: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .barcode-price-orig {
      text-decoration: line-through;
      font-size: 9pt;
      font-weight: 600;
      color: #555555;
    }
    .barcode-price-final {
      font-weight: 900;
    }
  </style>
</head>
<body>
  <div class="thermal-container">
    ${itemsHtml}
  </div>
</body>
</html>`;
  }

  if (is38) {
    // 38x25mm individual stickers
    const itemsHtml = queue
      .map((item) => {
        const svgHtml = generateBarcodeSvg(item.barcode, 'sticker-38x25mm');
        const origPrice = Number(item.originalPrice ?? item.price ?? 0);
        const hasDiscount =
          item.discountPrice !== null &&
          item.discountPrice !== undefined &&
          Number(item.discountPrice) > 0 &&
          Number(item.discountPrice) < origPrice;
        const finalPrice = hasDiscount ? Number(item.discountPrice) : origPrice;

        const variantParts = [];
        if (item.color) variantParts.push(item.color);
        if (item.size) variantParts.push(`مقاس ${item.size}`);
        const variantText = variantParts.join(' - ');

        return `
        <div class="sticker-ticket-38">
          <div class="sticker-store-38">${escapeHtml(activeStore)}</div>
          <div class="sticker-title-38">${escapeHtml(item.name || 'منتج')}</div>
          ${variantText ? `<div class="sticker-variant-38">${escapeHtml(variantText)}</div>` : ''}
          <div class="sticker-graphic-38">
            ${svgHtml}
          </div>
          <div class="sticker-code-38">${escapeHtml(item.barcode)}</div>
          <div class="sticker-price-38">
            ${
              hasDiscount
                ? `<span class="sticker-price-orig-38">${origPrice} ج.م</span>
                   <span class="sticker-price-final-38">${finalPrice} ج.م</span>`
                : `<span class="sticker-price-final-38">${finalPrice} ج.م</span>`
            }
          </div>
        </div>`;
      })
      .join('\n');

    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>طباعة باركود - ستيكر 38×25 مم</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    @page {
      size: 38mm 25mm;
      margin: 0;
    }
    html, body {
      width: 38mm;
      height: 25mm;
      margin: 0;
      padding: 0;
      background: #ffffff;
      font-family: 'Cairo', Tahoma, Arial, sans-serif;
      direction: rtl;
      color: #000000;
    }
    .sticker-ticket-38 {
      width: 38mm;
      height: 25mm;
      max-height: 25mm;
      overflow: hidden;
      page-break-after: always;
      break-after: page;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      padding: 1.2mm 1mm;
      text-align: center;
      box-sizing: border-box;
    }
    .sticker-ticket-38:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .sticker-store-38 {
      font-size: 6.5pt;
      font-weight: 900;
      line-height: 1;
      letter-spacing: -0.2px;
    }
    .sticker-title-38 {
      font-size: 6.5pt;
      font-weight: 800;
      line-height: 1.1;
      max-width: 36mm;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sticker-variant-38 {
      font-size: 5pt;
      font-weight: 700;
      line-height: 1;
      color: #333333;
      max-width: 36mm;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sticker-graphic-38 {
      max-width: 34mm;
      max-height: 7.5mm;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: hidden;
    }
    .sticker-graphic-38 svg {
      max-width: 34mm;
      height: 7.5mm;
    }
    .sticker-code-38 {
      font-family: 'Courier New', Courier, monospace;
      font-size: 6pt;
      font-weight: 900;
      line-height: 1;
      letter-spacing: 0.5px;
    }
    .sticker-price-38 {
      font-size: 7.5pt;
      font-weight: 900;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 3px;
    }
    .sticker-price-orig-38 {
      text-decoration: line-through;
      font-size: 5.5pt;
      font-weight: normal;
      color: #555555;
    }
    .sticker-price-final-38 {
      font-weight: 900;
    }
  </style>
</head>
<body>
  ${itemsHtml}
</body>
</html>`;
  }

  // 50x30mm individual stickers
  const itemsHtml = queue
    .map((item) => {
      const svgHtml = generateBarcodeSvg(item.barcode, 'sticker-50x30mm');
      const origPrice = Number(item.originalPrice ?? item.price ?? 0);
      const hasDiscount =
        item.discountPrice !== null &&
        item.discountPrice !== undefined &&
        Number(item.discountPrice) > 0 &&
        Number(item.discountPrice) < origPrice;
      const finalPrice = hasDiscount ? Number(item.discountPrice) : origPrice;

      const variantParts = [];
      if (item.color) variantParts.push(item.color);
      if (item.size) variantParts.push(`مقاس ${item.size}`);
      const variantText = variantParts.join(' - ');

      return `
      <div class="sticker-ticket-50">
        <div class="sticker-store-50">${escapeHtml(activeStore)}</div>
        <div class="sticker-title-50">${escapeHtml(item.name || 'منتج')}</div>
        ${variantText ? `<div class="sticker-variant-50">${escapeHtml(variantText)}</div>` : ''}
        <div class="sticker-graphic-50">
          ${svgHtml}
        </div>
        <div class="sticker-code-50">${escapeHtml(item.barcode)}</div>
        <div class="sticker-price-50">
          ${
            hasDiscount
              ? `<span class="sticker-price-orig-50">${origPrice} ج.م</span>
                 <span class="sticker-price-final-50">${finalPrice} ج.م</span>`
              : `<span class="sticker-price-final-50">${finalPrice} ج.م</span>`
          }
        </div>
      </div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>طباعة باركود - ستيكر 50×30 مم</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    @page {
      size: 50mm 30mm;
      margin: 0;
    }
    html, body {
      width: 50mm;
      height: 30mm;
      margin: 0;
      padding: 0;
      background: #ffffff;
      font-family: 'Cairo', Tahoma, Arial, sans-serif;
      direction: rtl;
      color: #000000;
    }
    .sticker-ticket-50 {
      width: 50mm;
      height: 30mm;
      max-height: 30mm;
      overflow: hidden;
      page-break-after: always;
      break-after: page;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      padding: 1.8mm 1.5mm;
      text-align: center;
      box-sizing: border-box;
    }
    .sticker-ticket-50:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .sticker-store-50 {
      font-size: 8pt;
      font-weight: 900;
      line-height: 1;
      letter-spacing: -0.2px;
    }
    .sticker-title-50 {
      font-size: 7.5pt;
      font-weight: 800;
      line-height: 1.15;
      max-width: 47mm;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sticker-variant-50 {
      font-size: 6pt;
      font-weight: 700;
      line-height: 1;
      color: #333333;
      max-width: 47mm;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sticker-graphic-50 {
      max-width: 45mm;
      max-height: 9.5mm;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: hidden;
    }
    .sticker-graphic-50 svg {
      max-width: 45mm;
      height: 9.5mm;
    }
    .sticker-code-50 {
      font-family: 'Courier New', Courier, monospace;
      font-size: 7.5pt;
      font-weight: 900;
      line-height: 1;
      letter-spacing: 1px;
    }
    .sticker-price-50 {
      font-size: 8.5pt;
      font-weight: 900;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
    }
    .sticker-price-orig-50 {
      text-decoration: line-through;
      font-size: 6.5pt;
      font-weight: normal;
      color: #555555;
    }
    .sticker-price-final-50 {
      font-weight: 900;
    }
  </style>
</head>
<body>
  ${itemsHtml}
</body>
</html>`;
}

/**
 * Print barcode queue using isolated hidden iframe
 *
 * @param {Array<object>} items - Items with barcode, name, price, etc.
 * @param {string} paperType - 'thermal-80mm' | 'sticker-38x25mm' | 'sticker-50x30mm'
 * @param {object} options - Additional options (storeName, iframeId, etc.)
 * @returns {Promise<{ success: boolean }>}
 */
export async function printBarcodes(items, paperType = 'thermal-80mm', options = {}) {
  const queue = Array.isArray(items) ? items : [items];
  if (!queue || queue.length === 0) {
    throw new Error('لا توجد ملصقات صالحة للطباعة');
  }

  const html = generateBarcodePrintHtml(queue, paperType, options.storeName || 'Bebyoon Center');
  const paper = PAPER_TYPES.find((p) => p.id === paperType) || PAPER_TYPES[0];

  return await printHtml(html, `طباعة باركود (${paper.shortLabel})`, {
    iframeId: options.iframeId || 'barcode-print-frame',
    ...options,
  });
}

export default {
  PAPER_TYPES,
  escapeHtml,
  generateBarcodeSvg,
  generateBarcodePrintHtml,
  printBarcodes,
};
