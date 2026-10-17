// src/renderer/utils/print.js
// Rock-solid unblockable printing mechanism for web browsers and Electron

/**
 * Print arbitrary HTML content using an unblockable invisible iframe.
 * Never blocked by browser popup blockers (unlike window.open) and works reliably in Chrome, Opera, and Edge.
 *
 * @param {string} htmlContent - Full HTML document string or an HTML fragment
 * @param {string} title - Window/Document title for the print job
 * @param {object} options - Optional configuration (iframeId, etc.)
 * @returns {Promise<{ success: boolean }>}
 */
export function printHtml(htmlContent, title = 'طباعة', options = {}) {
  return new Promise((resolve, reject) => {
    if (!htmlContent || typeof htmlContent !== 'string' || !htmlContent.trim()) {
      const err = new Error('لا يوجد محتوى صالح للطباعة');
      console.error(err);
      return reject(err);
    }

    const iframeId = options.iframeId || 'report-print-frame';

    // Remove any previously created print iframe
    const existing = document.getElementById(iframeId);
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }

    const iframe = document.createElement('iframe');
    iframe.id = iframeId;
    iframe.style.position = 'fixed';
    iframe.style.right = '-9999px';
    iframe.style.bottom = '-9999px';
    iframe.style.width = '10px';
    iframe.style.height = '10px';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    // Extract active styles from document head (Tailwind, fonts, custom rules)
    let parentHeadStyles = '';
    try {
      const styleNodes = document.querySelectorAll('link[rel="stylesheet"], style');
      styleNodes.forEach((node) => {
        parentHeadStyles += node.outerHTML + '\n';
      });
    } catch {}

    const isA4 = options.isA4 === true || options.format === 'A4';

    const printStyles = isA4
      ? `
      @page {
        size: A4 portrait;
        margin: 10mm;
      }
      body {
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 !important;
        padding: 10px !important;
      }
    `
      : `
      @page {
        size: 80mm auto;
        margin: 0mm;
      }
      body {
        width: 78mm !important;
        max-width: 78mm !important;
        margin: 0 auto !important;
        padding: 3mm 1mm !important;
      }
      .receipt-card, #printable-receipt, #printable-return-receipt, #printable-rental-receipt, #printable-sale-receipt, #tailoring-receipt-ticket {
        max-width: 78mm !important;
        width: 78mm !important;
        margin: 0 auto !important;
        padding: 2mm 1mm !important;
        border: none !important;
        box-shadow: none !important;
      }
    `;

    const baseHref = typeof window !== 'undefined' ? window.location.href.split('?')[0].split('#')[0] : '';
    const fullHtml = htmlContent.includes('<html') || htmlContent.includes('<!DOCTYPE')
      ? htmlContent
      : `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  ${baseHref ? `<base href="${baseHref}" />` : ''}
  <title>${title}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
  ${parentHeadStyles}
  <style>
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      font-family: 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif;
      direction: rtl;
      margin: 0;
      padding: 0;
      color: #000000 !important;
      background: #ffffff !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    img, svg {
      max-width: 100% !important;
      height: auto !important;
      display: block;
      margin-left: auto;
      margin-right: auto;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .no-print, button {
      display: none !important;
    }
    @media print {
      ${printStyles}
      * {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
    }
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>`;

    try {
      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (!doc) {
        throw new Error('تعذر الوصول إلى مستند إطار الطباعة');
      }

      doc.open();
      doc.write(fullHtml);
      doc.close();

      let printed = false;
      const doPrint = () => {
        if (printed) return;
        printed = true;
        try {
          if (iframe.contentWindow) {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            resolve({ success: true });
          } else {
            throw new Error('تعذر العثور على نافذة إطار الطباعة');
          }
        } catch (e) {
          console.error('Print iframe execution error:', e);
          reject(e);
        } finally {
          setTimeout(() => {
            if (iframe.parentNode) {
              iframe.parentNode.removeChild(iframe);
            }
          }, 60000);
        }
      };

      const fallbackTimer = setTimeout(doPrint, 500);

      // Wait for fonts and images
      const readyPromises = [];
      if (doc.fonts && doc.fonts.ready) {
        readyPromises.push(doc.fonts.ready);
      }
      const imgs = Array.from(doc.images || []);
      const pendingImgs = imgs.filter((i) => !i.complete);
      if (pendingImgs.length > 0) {
        readyPromises.push(
          new Promise((res) => {
            let done = 0;
            const onDone = () => {
              done++;
              if (done >= pendingImgs.length) res();
            };
            pendingImgs.forEach((i) => {
              i.onload = onDone;
              i.onerror = onDone;
            });
          })
        );
      }

      if (readyPromises.length > 0) {
        Promise.all(readyPromises)
          .then(() => {
            clearTimeout(fallbackTimer);
            setTimeout(doPrint, 150);
          })
          .catch(() => {});
      }
    } catch (err) {
      console.error('Failed to initialize print via iframe:', err);
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
      reject(err);
    }
  });
}

/**
 * Print a DOM element by its ID or DOM element reference (e.g. thermal receipts, tickets).
 *
 * @param {string|HTMLElement} elementOrId - The element or ID of the element to print
 * @param {string} title - Document title for the print job
 * @param {object} options - Optional configuration
 * @returns {Promise<{ success: boolean }>}
 */
export function printElement(elementOrId, title = 'طباعة', options = {}) {
  const el = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
  if (!el) {
    console.warn(`[printElement] Element not found: ${elementOrId}`);
    return Promise.reject(new Error(`العنصر المراد طباعته غير موجود: ${elementOrId}`));
  }

  // Clone node to safely remove any elements with .no-print
  const clone = el.cloneNode(true);
  const noPrintElements = clone.querySelectorAll('.no-print, button');
  noPrintElements.forEach((btn) => btn.parentNode?.removeChild(btn));

  // Fix image src attributes to use absolute URLs so they resolve properly in the iframe
  const cloneImages = clone.querySelectorAll('img');
  cloneImages.forEach((cloneImg) => {
    const origImg =
      el.querySelector(`img[src="${cloneImg.getAttribute('src')}"]`) ||
      el.querySelector(`img[alt="${cloneImg.getAttribute('alt')}"]`);
    if (origImg && origImg.src) {
      cloneImg.src = origImg.src;
    }
  });

  const elId = typeof elementOrId === 'string' ? elementOrId : el.id || '';
  const isA4 =
    options.format === 'A4' ||
    options.isA4 === true ||
    elId.includes('payslip') ||
    elId.includes('statement') ||
    elId.includes('report');

  const contentHtml = clone.outerHTML || clone.innerHTML;
  return printHtml(contentHtml, title, { isA4, ...options });
}

/**
 * Helper to print a receipt (from HTML string or element ID)
 */
export function printReceipt(contentOrElementId, title = 'إيصال') {
  if (typeof contentOrElementId === 'string' && document.getElementById(contentOrElementId)) {
    return printElement(contentOrElementId, title);
  }
  if (contentOrElementId instanceof HTMLElement) {
    return printElement(contentOrElementId, title);
  }
  if (typeof contentOrElementId === 'string') {
    return printHtml(contentOrElementId, title);
  }
  // Fallback
  window.print();
  return Promise.resolve({ success: true });
}

export default {
  printHtml,
  printElement,
  printReceipt,
};
