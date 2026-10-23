// src/renderer/utils/barcodePrint.js
// Dedicated thermal barcode generator and printer utility supporting standard sticker formats & 80mm rolls
import JsBarcode from 'jsbarcode';
import { printHtml } from './print.js';

export const PAPER_TYPES = [
  {
    id: 'sticker-38x25mm',
    label: 'ملصقات ستيكر 38×25 مم (الافتراضي للملابس)',
    shortLabel: 'ستيكر 38×25',
    description: 'ملصق لاصق مقاس 38×25 مم (المقاس القياسي الأكثر استخداماً لمحلات الملابس)',
    isDefault: true,
    widthMm: 38,
    heightMm: 25,
    dpi: 203,
  },
  {
    id: 'sticker-40x25mm',
    label: 'ملصقات ستيكر 40×25 مم',
    shortLabel: 'ستيكر 40×25',
    description: 'ملصق لاصق مقاس 40×25 مم متوافق مع معظم طابعات الباركود الحرارية',
    widthMm: 40,
    heightMm: 25,
    dpi: 203,
  },
  {
    id: 'sticker-50x30mm',
    label: 'ملصقات ستيكر 50×30 مم (للبدل والأحذية)',
    shortLabel: 'ستيكر 50×30',
    description: 'ملصق لاصق متوسط مقاس 50×30 مم للبدل والقطع الكبيرة والأحذية',
    widthMm: 50,
    heightMm: 30,
    dpi: 203,
  },
  {
    id: 'thermal-80mm',
    label: 'بون ورق حراري 80 مم (طابعة فواتير)',
    shortLabel: 'حراري 80 مم',
    description: 'عرض 72 مم يناسب طابعات الإيصالات الحرارية القياسية مع خط فاصل بين الملصقات',
    widthMm: 80,
    heightMm: null,
    printableWidthMm: 72,
    dpi: 203,
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
 * Format variant text for a barcode sticker (size, color)
 * Ensures single specific size is clearly shown without bloating
 */
export function formatVariantText(item) {
  const parts = [];
  if (item.color) {
    const c = String(item.color).trim();
    if (c) parts.push(`لون: ${c}`);
  }
  if (item.size) {
    let s = String(item.size).trim();
    // If a concatenated comma string was passed, take only the first size to fit sticker
    if (s.includes(',') || s.includes('،')) {
      s = s.split(/[,،]+/)[0].trim();
    }
    if (s) {
      const displaySize = s.length > 20 ? `${s.slice(0, 18)}..` : s;
      parts.push(`مقاس: ${displaySize}`);
    }
  }
  return parts.join(' - ');
}

/**
 * Extract an array of distinct sizes from a product object.
 * Handles both `product.sizes` (array of objects) and `product.size_cut` / `product.size` (comma-separated string).
 * Preserves slashes in size names like '42/44' or 'S/M'.
 *
 * @param {object} product
 * @returns {Array<{ id: string|number, variantKey: string, size_name: string, color_name: string, stock_level: number }>}
 */
export function extractProductSizes(product) {
  if (!product) return [];

  // Case 1: product.sizes array from database
  if (Array.isArray(product.sizes) && product.sizes.length > 0) {
    const list = product.sizes
      .filter((s) => s && (s.size_name || s.size))
      .map((s, idx) => {
        const sizeName = String(s.size_name || s.size || '').trim();
        const colorName = String(s.color_name || s.color || product.color || '').trim();
        const key = s.id ? String(s.id) : `sz-${idx}-${sizeName}-${colorName}`;
        return {
          id: key,
          variantKey: key,
          size_name: sizeName,
          color_name: colorName,
          stock_level: Math.max(0, Number(s.stock_level ?? s.stock ?? 0) || 0),
        };
      })
      .filter((s) => s.size_name.length > 0);

    if (list.length > 0) return list;
  }

  // Case 2: product.size_cut or product.size string (split on commas/Arabic commas/semicolons/newlines, but NOT on '/')
  const rawSize = String(product.size_cut || product.size || '').trim();
  if (rawSize) {
    const parts = rawSize.split(/[,،;\u061B|\n\r]+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      const totalStock = Math.max(0, Number(product.stock_level ?? product.stock ?? 0) || 0);
      const perSize = parts.length > 0 ? Math.floor(totalStock / parts.length) : 0;
      return parts.map((name, idx) => ({
        id: `parsed-${idx}-${name}`,
        variantKey: `parsed-${idx}-${name}`,
        size_name: name,
        color_name: String(product.color || '').trim(),
        stock_level: perSize,
      }));
    } else if (parts.length === 1 && parts[0]) {
      return [
        {
          id: 'single-1',
          variantKey: 'single-1',
          size_name: parts[0],
          color_name: String(product.color || '').trim(),
          stock_level: Math.max(0, Number(product.stock_level ?? product.stock ?? 0) || 0),
        },
      ];
    }
  }

  return [];
}

/**
 * Resolve relative asset URLs to absolute URLs so isolated print iframes can always load them
 */
export function resolveAssetUrl(url) {
  if (!url) return null;
  const str = String(url).trim();
  if (!str) return null;
  if (str.startsWith('data:') || str.startsWith('http://') || str.startsWith('https://') || str.startsWith('file://')) {
    return str;
  }
  if (typeof window !== 'undefined') {
    if (window.location?.origin && window.location.origin !== 'null' && !window.location.origin.startsWith('file:')) {
      const clean = str.startsWith('/') ? str : `/${str}`;
      return `${window.location.origin}${clean}`;
    }
    if (window.location?.href && window.location.href.startsWith('file:')) {
      const baseDir = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
      const clean = str.startsWith('/') ? str.substring(1) : str;
      return `${baseDir}/${clean}`;
    }
  }
  return str;
}

/**
 * Generate a crisp vector SVG string for CODE128 barcode
 * Strictly centered and sized for thermal printers with exact aspect ratio
 *
 * @param {string|number} barcodeValue - The barcode number or code
 * @param {string} paperType - 'sticker-38x25mm' | 'sticker-40x25mm' | 'sticker-50x30mm' | 'thermal-80mm'
 * @returns {string} SVG HTML string or fallback text representation
 */
export function generateBarcodeSvg(barcodeValue, paperType = 'sticker-38x25mm') {
  const is38 = paperType === 'sticker-38x25mm' || paperType === 'sticker-40x25mm';
  const is50 = paperType === 'sticker-50x30mm';

  // Crisp line widths and heights tailored for 203 DPI thermal printheads
  // Height 20 for 25mm labels fits cleanly inside label boundary with dedicated price space
  const barWidth = is38 ? 1.0 : is50 ? 1.2 : 1.4;
  const barHeight = is38 ? 20 : is50 ? 24 : 36;

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
      svgNode.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      // Symmetrical center layout with LTR direction and fluid width
      svgNode.setAttribute(
        'style',
        'max-width: 95%; width: auto; height: 100%; display: block; margin: 0 auto; direction: ltr;'
      );
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
        svgNode.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svgNode.setAttribute(
          'style',
          'max-width: 95%; width: auto; height: 100%; display: block; margin: 0 auto; direction: ltr;'
        );
        return svgNode.outerHTML;
      } catch (err2) {
        console.error('JsBarcode fallback failed:', err2);
      }
    }
  }

  return `<div style="font-family: monospace; font-size: 11px; font-weight: bold; padding: 2px 6px; border: 1px dashed #000; text-align: center; margin: 0 auto; direction: ltr;">${escapeHtml(
    raw
  )}</div>`;
}

/**
 * Generate full self-contained printable HTML document for barcodes
 *
 * @param {Array<object>} queue - Array of barcode items to print
 * @param {string} paperType - 'sticker-38x25mm' | 'sticker-40x25mm' | 'sticker-50x30mm' | 'thermal-80mm'
 * @param {string} storeName - Store name to print at top (default: 'Bebyoon Center')
 * @returns {string} Full HTML document string ready for isolated iframe printing
 */
export function generateBarcodePrintHtml(queue, paperType = 'sticker-38x25mm', storeName = 'Bebyoon Center', logoUrl = null, options = {}) {
  const is38 = paperType === 'sticker-38x25mm';
  const is40 = paperType === 'sticker-40x25mm';
  const is50 = paperType === 'sticker-50x30mm';
  const is80 = paperType === 'thermal-80mm';

  const activeStore = storeName || 'Bebyoon Center';
  const resolvedLogo = resolveAssetUrl(logoUrl);
  let baseHref = '';
  if (typeof window !== 'undefined') {
    if (window.location?.origin && window.location.origin !== 'null' && !window.location.origin.startsWith('file:')) {
      baseHref = `${window.location.origin}/`;
    } else if (window.location?.href) {
      baseHref = window.location.href.split('?')[0].split('#')[0];
    }
  }

  // 1. Continuous 80mm Roll (Thermal Bill Receipt Printer)
  if (is80) {
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
        const variantText = formatVariantText(item);

        return `
        <div class="barcode-ticket-80">
          ${resolvedLogo ? `
          <div class="barcode-logo-wrap-80">
            <img src="${escapeHtml(resolvedLogo)}" class="barcode-logo-80" alt="" onerror="this.style.display='none';if(this.nextElementSibling){this.nextElementSibling.style.display='block';}" />
            <div class="barcode-store" style="display:none;">${escapeHtml(activeStore)}</div>
          </div>` : `
          <div class="barcode-store">${escapeHtml(activeStore)}</div>`}
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
      .join('');

    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  ${baseHref ? `<base href="${baseHref}" />` : ''}
  <title>طباعة باركود - ورق حراري 80 مم</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
  <style>
    * {
      box-sizing: border-box !important;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    @page {
      size: 80mm auto;
      margin: 0mm !important;
    }
    html, body {
      width: 80mm;
      margin: 0 auto !important;
      padding: 0 !important;
      background: #ffffff !important;
      font-family: 'Cairo', Tahoma, Arial, sans-serif;
      direction: rtl;
      color: #000000 !important;
      text-align: center !important;
    }
    .thermal-container {
      width: 72mm;
      margin: 0 auto !important;
      padding: 2mm 0;
      text-align: center !important;
    }
    .barcode-ticket-80 {
      width: 100%;
      padding: 3mm 1mm;
      border-bottom: 2px dashed #000000;
      page-break-inside: avoid;
      break-inside: avoid;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      box-sizing: border-box;
      margin: 0 auto;
    }
    .barcode-logo-wrap-80 {
      width: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      margin-bottom: 1.5mm;
    }
    .barcode-logo-80 {
      max-height: 10mm;
      max-width: 40mm;
      object-fit: contain;
      display: block;
      margin: 0 auto;
    }
    .barcode-store {
      width: 100%;
      font-size: 12pt;
      font-weight: 900;
      letter-spacing: -0.3px;
      line-height: 1.1;
      margin-bottom: 2px;
      text-align: center;
    }
    .barcode-title {
      width: 100%;
      font-size: 11pt;
      font-weight: 800;
      line-height: 1.2;
      word-break: break-word;
      margin-bottom: 2px;
      text-align: center;
    }
    .barcode-variant {
      width: 100%;
      font-size: 9pt;
      font-weight: 700;
      color: #222222;
      line-height: 1.2;
      margin-bottom: 3px;
      text-align: center;
    }
    .barcode-graphic {
      width: 100%;
      margin: 2px auto;
      display: flex;
      justify-content: center;
      align-items: center;
      direction: ltr !important;
    }
    .barcode-graphic svg {
      display: block !important;
      margin: 0 auto !important;
      max-width: 90% !important;
      width: auto !important;
      height: auto;
    }
    .barcode-code {
      width: 100%;
      font-family: 'Courier New', Courier, monospace;
      font-size: 10pt;
      font-weight: 900;
      letter-spacing: 2px;
      line-height: 1.1;
      margin-top: 1px;
      text-align: center;
      direction: ltr !important;
    }
    .barcode-price {
      width: 100%;
      font-size: 12pt;
      font-weight: 900;
      line-height: 1.2;
      margin-top: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      text-align: center;
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
    ${options.forSimulator ? `
    body {
      background: #18181b !important;
      padding: 16px 0 !important;
      overflow-y: auto !important;
    }
    .thermal-container {
      background: #ffffff !important;
      border-radius: 4px !important;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4) !important;
      padding: 4mm 2mm !important;
    }
    ` : ''}
  </style>
</head>
<body>
  <div class="thermal-container">
    ${itemsHtml}
  </div>
</body>
</html>`;
  }

  // 2. Individual Labels: 38x25mm (Default) or 40x25mm
  if (is38 || is40) {
    const labelWidthMm = is40 ? '40mm' : '38mm';
    const itemsHtml = queue
      .map((item) => {
        const svgHtml = generateBarcodeSvg(item.barcode, is40 ? 'sticker-40x25mm' : 'sticker-38x25mm');
        const origPrice = Number(item.originalPrice ?? item.price ?? 0);
        const hasDiscount =
          item.discountPrice !== null &&
          item.discountPrice !== undefined &&
          Number(item.discountPrice) > 0 &&
          Number(item.discountPrice) < origPrice;
        const finalPrice = hasDiscount ? Number(item.discountPrice) : origPrice;
        const variantText = formatVariantText(item);

        return `<div class="sticker-ticket-38">${
          resolvedLogo
            ? `<div class="sticker-header-38"><img src="${escapeHtml(resolvedLogo)}" class="sticker-logo-38" alt="" onerror="this.style.display='none';if(this.nextElementSibling){this.nextElementSibling.style.display='block';}" /><span class="sticker-store-38" style="display:none;">${escapeHtml(activeStore)}</span></div>`
            : `<div class="sticker-store-38">${escapeHtml(activeStore)}</div>`
        }<div class="sticker-title-38">${escapeHtml(item.name || 'منتج')}</div>${
          variantText ? `<div class="sticker-variant-38">${escapeHtml(variantText)}</div>` : ''
        }<div class="sticker-graphic-38">${svgHtml}</div><div class="sticker-code-38">${escapeHtml(item.barcode)}</div><div class="sticker-price-38">${
          hasDiscount
            ? `<span class="sticker-price-orig-38">${origPrice} ج.م</span><span class="sticker-price-final-38">${finalPrice} ج.م</span>`
            : `<span class="sticker-price-final-38">${finalPrice} ج.م</span>`
        }</div></div>`;
      })
      .join('');

    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  ${baseHref ? `<base href="${baseHref}" />` : ''}
  <title>طباعة باركود - ستيكر ${labelWidthMm}×25 مم</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
  <style>
    * {
      box-sizing: border-box !important;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    @page {
      size: ${labelWidthMm} 25mm;
      margin: 0mm !important;
    }
    @media print {
      @page {
        size: ${labelWidthMm} 25mm;
        margin: 0mm !important;
      }
      body, html {
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        width: ${labelWidthMm} !important;
      }
      .sticker-ticket-38 {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        page-break-after: always !important;
        break-after: page !important;
      }
      .sticker-ticket-38:last-child {
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
    }
    html, body {
      width: ${labelWidthMm} !important;
      max-width: ${labelWidthMm} !important;
      margin: 0 auto !important;
      padding: 0 !important;
      background: #ffffff !important;
      font-family: 'Cairo', Tahoma, Arial, sans-serif;
      direction: ltr !important;
      color: #000000 !important;
      text-align: center !important;
      overflow: hidden !important;
    }
    .sticker-ticket-38 {
      width: ${labelWidthMm} !important;
      max-width: ${labelWidthMm} !important;
      height: 23.8mm !important;
      max-height: 23.8mm !important;
      overflow: hidden !important;
      box-sizing: border-box !important;
      margin: 0 auto !important;
      padding: 0.5mm 1mm !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      page-break-after: always !important;
      break-after: page !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: space-between !important;
      text-align: center !important;
    }
    .sticker-ticket-38:last-child {
      page-break-after: avoid !important;
      break-after: avoid !important;
    }
    .sticker-header-38 {
      width: 100% !important;
      height: 4.0mm !important;
      max-height: 4.0mm !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      overflow: hidden !important;
      margin: 0 auto !important;
    }
    .sticker-logo-38 {
      max-height: 3.8mm !important;
      max-width: 26mm !important;
      width: auto !important;
      height: auto !important;
      object-fit: contain !important;
      display: block !important;
      margin: 0 auto !important;
      font-size: 0 !important;
      color: transparent !important;
    }
    .sticker-store-38 {
      width: 100% !important;
      font-size: 6pt !important;
      font-weight: 900 !important;
      line-height: 1 !important;
      letter-spacing: -0.2px !important;
      text-align: center !important;
      direction: rtl !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      margin: 0 auto !important;
    }
    .sticker-title-38 {
      width: 100% !important;
      font-size: 6pt !important;
      font-weight: 800 !important;
      line-height: 1.05 !important;
      max-height: 2.8mm !important;
      text-align: center !important;
      direction: rtl !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      margin: 0 auto !important;
    }
    .sticker-variant-38 {
      width: 100% !important;
      font-size: 5pt !important;
      font-weight: 700 !important;
      line-height: 1 !important;
      max-height: 2.2mm !important;
      color: #111111 !important;
      text-align: center !important;
      direction: rtl !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      margin: 0 auto !important;
    }
    .sticker-graphic-38 {
      width: 100% !important;
      height: 5.6mm !important;
      max-height: 5.6mm !important;
      display: flex !important;
      justify-content: center !important;
      align-items: center !important;
      margin: 0 auto !important;
      overflow: hidden !important;
      direction: ltr !important;
      text-align: center !important;
    }
    .sticker-graphic-38 svg {
      display: block !important;
      margin: 0 auto !important;
      max-width: 95% !important;
      width: auto !important;
      height: 5.4mm !important;
    }
    .sticker-code-38 {
      width: 100% !important;
      font-family: 'Courier New', Courier, monospace !important;
      font-size: 5.5pt !important;
      font-weight: 900 !important;
      line-height: 1 !important;
      letter-spacing: 0.5px !important;
      max-height: 2.2mm !important;
      text-align: center !important;
      direction: ltr !important;
      margin: 0 auto !important;
    }
    .sticker-price-38 {
      width: 100% !important;
      font-size: 8pt !important;
      font-weight: 900 !important;
      line-height: 1.1 !important;
      max-height: 4.2mm !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 3px !important;
      text-align: center !important;
      direction: rtl !important;
      margin: 0 auto !important;
    }
    .sticker-price-orig-38 {
      text-decoration: line-through !important;
      font-size: 5.5pt !important;
      font-weight: normal !important;
      color: #555555 !important;
    }
    .sticker-price-final-38 {
      font-weight: 900 !important;
      font-size: 8pt !important;
    }
    ${options.forSimulator ? `
    html, body {
      overflow-y: auto !important;
      background: #18181b !important;
      padding: 16px 0 !important;
      min-height: 100vh;
    }
    .sticker-ticket-38 {
      background: #ffffff !important;
      border-radius: 3px !important;
      box-shadow: 0 4px 12px rgba(0,0,0,0.35) !important;
      margin: 10px auto !important;
      outline: 1px solid rgba(255,255,255,0.2) !important;
    }
    ` : ''}
  </style>
</head>
<body>${itemsHtml}</body>
</html>`;
  }

  // 3. Medium Labels: 50x30mm
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
      const variantText = formatVariantText(item);

      return `<div class="sticker-ticket-50">${
        resolvedLogo
          ? `<div class="sticker-header-50"><img src="${escapeHtml(resolvedLogo)}" class="sticker-logo-50" alt="" onerror="this.style.display='none';if(this.nextElementSibling){this.nextElementSibling.style.display='block';}" /><span class="sticker-store-50" style="display:none;">${escapeHtml(activeStore)}</span></div>`
          : `<div class="sticker-store-50">${escapeHtml(activeStore)}</div>`
      }<div class="sticker-title-50">${escapeHtml(item.name || 'منتج')}</div>${
        variantText ? `<div class="sticker-variant-50">${escapeHtml(variantText)}</div>` : ''
      }<div class="sticker-graphic-50">${svgHtml}</div><div class="sticker-code-50">${escapeHtml(item.barcode)}</div><div class="sticker-price-50">${
        hasDiscount
          ? `<span class="sticker-price-orig-50">${origPrice} ج.م</span><span class="sticker-price-final-50">${finalPrice} ج.م</span>`
          : `<span class="sticker-price-final-50">${finalPrice} ج.م</span>`
      }</div></div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  ${baseHref ? `<base href="${baseHref}" />` : ''}
  <title>طباعة باركود - ستيكر 50×30 مم</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
  <style>
    * {
      box-sizing: border-box !important;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    @page {
      size: 50mm 30mm;
      margin: 0mm !important;
    }
    @media print {
      @page {
        size: 50mm 30mm;
        margin: 0mm !important;
      }
      body, html {
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        width: 50mm !important;
      }
      .sticker-ticket-50 {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        page-break-after: always !important;
        break-after: page !important;
      }
      .sticker-ticket-50:last-child {
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
    }
    html, body {
      width: 50mm !important;
      max-width: 50mm !important;
      margin: 0 auto !important;
      padding: 0 !important;
      background: #ffffff !important;
      font-family: 'Cairo', Tahoma, Arial, sans-serif;
      direction: ltr !important;
      color: #000000 !important;
      text-align: center !important;
      overflow: hidden !important;
    }
    .sticker-ticket-50 {
      width: 50mm !important;
      height: 30mm !important;
      max-height: 30mm !important;
      overflow: hidden !important;
      box-sizing: border-box !important;
      margin: 0 auto !important;
      padding: 0.6mm 1.2mm !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      page-break-after: always !important;
      break-after: page !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: space-between !important;
      text-align: center !important;
    }
    .sticker-ticket-50:last-child {
      page-break-after: avoid !important;
      break-after: avoid !important;
    }
    .sticker-header-50 {
      width: 100% !important;
      height: 5mm !important;
      max-height: 5mm !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      overflow: hidden !important;
      margin: 0 auto !important;
    }
    .sticker-logo-50 {
      max-height: 4.8mm !important;
      max-width: 32mm !important;
      width: auto !important;
      height: auto !important;
      object-fit: contain !important;
      display: block !important;
      margin: 0 auto !important;
      font-size: 0 !important;
      color: transparent !important;
    }
    .sticker-store-50 {
      width: 100% !important;
      font-size: 7.5pt !important;
      font-weight: 900 !important;
      line-height: 1 !important;
      letter-spacing: -0.2px !important;
      text-align: center !important;
      direction: rtl !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      margin: 0 auto !important;
    }
    .sticker-title-50 {
      width: 100% !important;
      font-size: 7pt !important;
      font-weight: 800 !important;
      line-height: 1.15 !important;
      max-height: 3.4mm !important;
      text-align: center !important;
      direction: rtl !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      margin: 0 auto !important;
    }
    .sticker-variant-50 {
      width: 100% !important;
      font-size: 6pt !important;
      font-weight: 700 !important;
      line-height: 1 !important;
      max-height: 2.7mm !important;
      color: #222222 !important;
      text-align: center !important;
      direction: rtl !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      margin: 0 auto !important;
    }
    .sticker-graphic-50 {
      width: 100% !important;
      height: 7mm !important;
      max-height: 7mm !important;
      display: flex !important;
      justify-content: center !important;
      align-items: center !important;
      margin: 0 auto !important;
      overflow: hidden !important;
      direction: ltr !important;
      text-align: center !important;
    }
    .sticker-graphic-50 svg {
      display: block !important;
      margin: 0 auto !important;
      max-width: 95% !important;
      width: auto !important;
      height: 6.8mm !important;
    }
    .sticker-code-50 {
      width: 100% !important;
      font-family: 'Courier New', Courier, monospace !important;
      font-size: 6.5pt !important;
      font-weight: 900 !important;
      line-height: 1 !important;
      letter-spacing: 0.8px !important;
      max-height: 2.7mm !important;
      text-align: center !important;
      direction: ltr !important;
      margin: 0 auto !important;
    }
    .sticker-price-50 {
      width: 100% !important;
      font-size: 8.5pt !important;
      font-weight: 900 !important;
      line-height: 1.1 !important;
      max-height: 4.2mm !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 4px !important;
      text-align: center !important;
      direction: rtl !important;
      margin: 0 auto !important;
    }
    .sticker-price-orig-50 {
      text-decoration: line-through !important;
      font-size: 6.5pt !important;
      font-weight: normal !important;
      color: #555555 !important;
    }
    .sticker-price-final-50 {
      font-weight: 900 !important;
      font-size: 8.5pt !important;
    }
    ${options.forSimulator ? `
    html, body {
      overflow-y: auto !important;
      background: #18181b !important;
      padding: 16px 0 !important;
      min-height: 100vh;
    }
    .sticker-ticket-50 {
      background: #ffffff !important;
      border-radius: 3px !important;
      box-shadow: 0 4px 12px rgba(0,0,0,0.35) !important;
      margin: 10px auto !important;
      outline: 1px solid rgba(255,255,255,0.2) !important;
    }
    ` : ''}
  </style>
</head>
<body>${itemsHtml}</body>
</html>`;
}

/**
 * Print barcode queue using isolated hidden iframe
 *
 * @param {Array<object>} items - Items with barcode, name, price, size, color, etc.
 * @param {string} paperType - 'sticker-38x25mm' | 'sticker-40x25mm' | 'sticker-50x30mm' | 'thermal-80mm'
 * @param {object} options - Additional options (storeName, logoUrl, iframeId, etc.)
 * @returns {Promise<{ success: boolean }>}
 */
export async function printBarcodes(items, paperType = 'sticker-38x25mm', options = {}) {
  const queue = Array.isArray(items) ? items : [items];
  if (!queue || queue.length === 0) {
    throw new Error('لا توجد ملصقات صالحة للطباعة');
  }

  const logo = options.logoUrl || options.storeLogo || options.branchLogo || null;
  const html = generateBarcodePrintHtml(queue, paperType, options.storeName || 'Bebyoon Center', logo);
  const paper = PAPER_TYPES.find((p) => p.id === paperType) || PAPER_TYPES[0];

  return await printHtml(html, `طباعة باركود (${paper.shortLabel})`, {
    iframeId: options.iframeId || 'barcode-print-frame',
    ...options,
  });
}

/**
 * Export barcode stickers or roll as high-precision PDF matching physical label dimensions
 *
 * @param {Array<object>} items - Items queue
 * @param {string} paperType - 'sticker-38x25mm' | 'sticker-40x25mm' | 'sticker-50x30mm' | 'thermal-80mm'
 * @param {object} options - Options (storeName, logoUrl, defaultFileName, dialogTitle)
 * @returns {Promise<{ success: boolean, filePath?: string, canceled?: boolean, error?: string }>}
 */
export async function exportBarcodePdf(items, paperType = 'sticker-38x25mm', options = {}) {
  const queue = Array.isArray(items) ? items : [items];
  if (!queue || queue.length === 0) {
    throw new Error('لا توجد ملصقات صالحة للتصدير');
  }

  const logo = options.logoUrl || options.storeLogo || options.branchLogo || null;
  const storeName = options.storeName || 'Bebyoon Center';
  const html = generateBarcodePrintHtml(queue, paperType, storeName, logo, { forSimulator: false });
  const paper = PAPER_TYPES.find((p) => p.id === paperType) || PAPER_TYPES[0];

  const defaultFileName =
    options.defaultFileName ||
    `barcodes-${paper.shortLabel.replace(/[\s×*]+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`;
  const dialogTitle = options.dialogTitle || `تصدير ملصقات الباركود كملف PDF (${paper.label})`;

  let pageSize = 'A4';
  if (paper.widthMm && paper.heightMm) {
    pageSize = {
      width: paper.widthMm * 1000,
      height: paper.heightMm * 1000,
    };
  } else if (paper.id === 'thermal-80mm') {
    pageSize = {
      width: 80000,
      height: Math.max(120000, queue.length * 60000),
    };
  }

  if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.exportPdf === 'function') {
    return await window.electronAPI.exportPdf({
      html,
      defaultFileName,
      dialogTitle,
      pageSize,
      preferCSSPageSize: true,
      marginsType: 1, // no margins
    });
  }

  // Fallback for browser mode: iframe print to PDF
  return await printHtml(html, `تصدير باركود (${paper.shortLabel})`, {
    iframeId: 'barcode-pdf-fallback-frame',
    ...options,
  });
}

export default {
  PAPER_TYPES,
  escapeHtml,
  resolveAssetUrl,
  formatVariantText,
  extractProductSizes,
  generateBarcodeSvg,
  generateBarcodePrintHtml,
  printBarcodes,
  exportBarcodePdf,
};
