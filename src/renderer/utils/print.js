export function printHtml(htmlContent, title = 'طباعة') {
  const printWindow = window.open('', '_blank', 'width=800,height=600');
  if (!printWindow) {
    alert('يرجى السماح بالنوافذ المنبثقة للطباعة');
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="utf-8" />
      <title>${title}</title>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet" />
      <style>
        body { font-family: 'Cairo', sans-serif; direction: rtl; margin: 0; padding: 12px; }
        @media print {
          @page { size: 80mm auto; margin: 0mm; }
          body { width: 80mm; margin: 0; padding: 8px; }
        }
      </style>
    </head>
    <body>
      ${htmlContent}
      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
            window.close();
          }, 300);
        };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

export function printReceipt() {
  window.print();
}

export default {
  printHtml,
  printReceipt,
};
