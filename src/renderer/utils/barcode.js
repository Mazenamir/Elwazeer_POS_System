import JsBarcode from 'jsbarcode';

export function renderBarcodeToElement(element, text, options = {}) {
  if (!element || !text) return;
  try {
    JsBarcode(element, text, {
      format: 'CODE128',
      width: 2,
      height: 48,
      displayValue: true,
      fontSize: 14,
      font: 'Cairo',
      textMargin: 4,
      margin: 8,
      ...options,
    });
  } catch (err) {
    console.error('JsBarcode rendering error:', err);
  }
}

export default {
  renderBarcodeToElement,
};
