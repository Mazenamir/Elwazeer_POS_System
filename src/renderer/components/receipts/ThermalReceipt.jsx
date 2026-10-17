import React, { useEffect, useRef } from 'react';
import { Printer, QrCode, ShieldCheck } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import { formatReceiptDate, getPaymentMethodArabic } from '../../utils/receiptHelpers';

export { formatReceiptDate, getPaymentMethodArabic };

/**
 * Premium Thermal Receipt Component
 * Precisely matches the reference receipt design with elegant creative touches
 * and seamless 80mm thermal printing support.
 */
export function ThermalReceipt({
  id = 'printable-receipt',
  type = 'sale', // 'sale' | 'rental' | 'rental-sale' | 'return' | 'tailoring'
  title, // optional custom title, defaults based on type
  orderNumber = '1',
  date,
  customerName = '',
  customerPhone = '',
  sellerName = '',
  paymentMethod = 'cash',
  branchName = '',
  storePhone = '',
  storeAddress = '',
  items = [],
  subtotal = 0,
  discount = 0,
  taxRate = 0,
  taxAmount = 0,
  totalAmount = 0,
  paidAmount = 0,
  changeAmount = 0,
  remainingAmount = 0,
  footerMessage = '',
  // Specific to rentals
  pickupDate = '',
  returnDate = '',
  deposit = 0,
  rentalNotes = '',
  // Specific to returns
  originalOrderId = '',
  totalReturnAmount = 0,
  // Actions
  onPrint,
  onClose,
  showActions = true,
  showBarcode = true,
  showQrCode = true,
  className = '',
}) {
  const barcodeRef = useRef(null);

  // Derive title based on receipt type
  const receiptTitle =
    title ||
    (type === 'return'
      ? 'إيصال مرتجع مبيعات'
      : type === 'rental'
      ? 'إيصال حجز وتأجير'
      : type === 'rental-sale'
      ? 'فاتورة بيع (تحويل تأجير)'
      : type === 'tailoring'
      ? 'إيصال أمر تفصيل'
      : 'فاتورة بيع');

  const formattedDateTime = formatReceiptDate(date);
  const paymentMethodLabel = getPaymentMethodArabic(paymentMethod);

  // Auto-render CODE128 vector barcode safely
  useEffect(() => {
    if (!showBarcode || !barcodeRef.current) return;
    const rawVal = String(orderNumber || '').trim();
    // Sanitize to ASCII characters compatible with CODE128
    const barcodeVal = rawVal.replace(/[^\x00-\x7F]/g, '') || '1';

    try {
      JsBarcode(barcodeRef.current, barcodeVal, {
        format: 'CODE128',
        width: 1.5,
        height: 36,
        displayValue: true,
        fontSize: 10,
        font: "'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif",
        textMargin: 2,
        margin: 4,
        background: '#ffffff',
        lineColor: '#000000',
      });
    } catch (err) {
      console.warn('JsBarcode render error:', err);
    }
  }, [orderNumber, showBarcode]);

  // Financial calculations
  const numSubtotal = Number(subtotal || 0);
  const numDiscount = Number(discount || 0);
  const numTax = Number(taxAmount || (taxRate > 0 ? (numSubtotal * taxRate) / 100 : 0));
  const numTotal = Number(totalAmount || 0);
  const numPaid = Number(paidAmount || 0);
  const numChange = Number(changeAmount || (numPaid > numTotal ? numPaid - numTotal : 0));
  const numRemaining = Number(
    remainingAmount || (numTotal > numPaid ? numTotal - numPaid : 0)
  );

  return (
    <div className={`receipt-wrapper flex flex-col items-center justify-center ${className}`}>
      {/* 80mm THERMAL RECEIPT SLIP */}
      <div
        id={id}
        className="receipt-card bg-white text-black text-xs font-sans w-full max-w-[340px] p-5 sm:p-6 shadow-2xl rounded-3xl border border-slate-200/90 relative select-text"
        style={{
          direction: 'rtl',
          fontFamily: "'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif",
          color: '#000000',
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact',
        }}
      >
        {/* TOP BRAND HEADER */}
        <div className="text-center pb-2 space-y-1">
          <div className="w-full flex justify-center mb-1">
            <img
              src="/logos/app-icon.png"
              alt="BEBYOON"
              className="h-14 sm:h-16 w-auto max-w-[170px] object-contain mx-auto"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          <h2 className="text-sm font-black text-slate-900 tracking-wide mt-1">
            {receiptTitle}
          </h2>
          {(branchName || storeAddress) && (
            <p className="text-[11px] font-bold text-slate-700">
              {branchName || storeAddress}
            </p>
          )}
          {storePhone && (
            <p className="text-[11px] font-medium text-slate-600" dir="ltr">
              للتواصل: {storePhone}
            </p>
          )}
        </div>

        {/* TOP DIVIDER (Solid clean divider matching photo) */}
        <div className="border-b border-slate-200 w-full my-2.5" />

        {/* METADATA 2-COLUMN GRID (Matching User Photo) */}
        <div className="space-y-1.5 text-xs mb-2">
          {/* Row 1: Invoice Number & Date */}
          <div className="flex justify-between items-start py-0.5">
            <div className="text-right">
              <div className="text-[10px] text-slate-500 font-medium mb-0.5">
                {type === 'return' ? 'رقم الإيصال' : 'رقم الفاتورة'}
              </div>
              <div className="font-bold text-slate-900 text-xs sm:text-sm">
                {orderNumber}
              </div>
            </div>
            <div className="text-left" dir="ltr">
              <div
                className="text-[10px] text-slate-500 font-medium mb-0.5 text-left"
                dir="rtl"
              >
                التاريخ
              </div>
              <div className="font-bold text-slate-900 text-xs">
                {formattedDateTime}
              </div>
            </div>
          </div>

          <div className="border-b border-slate-200 w-full" />

          {/* Row 2: Customer & Phone */}
          <div className="flex justify-between items-start py-0.5">
            <div className="text-right">
              <div className="text-[10px] text-slate-500 font-medium mb-0.5">العميل</div>
              <div className="font-bold text-slate-900 text-xs">
                {customerName || 'عميل نقدي'}
              </div>
            </div>
            <div className="text-left" dir="ltr">
              <div
                className="text-[10px] text-slate-500 font-medium mb-0.5 text-left"
                dir="rtl"
              >
                رقم الهاتف
              </div>
              <div className="font-bold text-slate-900 text-xs">
                {customerPhone || '-'}
              </div>
            </div>
          </div>

          <div className="border-b border-slate-200 w-full" />

          {/* Row 3: Cashier/Seller & Payment Method */}
          <div className="flex justify-between items-start py-0.5">
            <div className="text-right">
              <div className="text-[10px] text-slate-500 font-medium mb-0.5">البائع</div>
              <div className="font-bold text-slate-900 text-xs">
                {sellerName || 'الكاشير'}
              </div>
            </div>
            <div className="text-left">
              <div className="text-[10px] text-slate-500 font-medium mb-0.5 text-left">
                طريقة الدفع
              </div>
              <div className="font-bold text-slate-900 text-xs text-left">
                {paymentMethodLabel}
              </div>
            </div>
          </div>

          {/* Optional Row for Return Orders */}
          {type === 'return' && originalOrderId && (
            <>
              <div className="border-b border-slate-200 w-full" />
              <div className="flex justify-between items-start py-0.5">
                <div className="text-right">
                  <div className="text-[10px] text-slate-500 font-medium mb-0.5">
                    الطلب الأصلي
                  </div>
                  <div className="font-bold text-slate-900 text-xs">
                    #{originalOrderId}
                  </div>
                </div>
                <div className="text-left">
                  <div className="text-[10px] text-slate-500 font-medium mb-0.5 text-left">
                    نوع العملية
                  </div>
                  <div className="font-bold text-rose-600 text-xs">مرتجع مبيعات</div>
                </div>
              </div>
            </>
          )}

          {/* Optional Row for Rentals (Pickup & Return Dates) */}
          {type === 'rental' && (pickupDate || returnDate) && (
            <>
              <div className="border-b border-slate-200 w-full" />
              <div className="flex justify-between items-start py-0.5">
                <div className="text-right">
                  <div className="text-[10px] text-slate-500 font-medium mb-0.5">
                    تاريخ الاستلام
                  </div>
                  <div className="font-bold text-slate-900 text-xs">
                    {pickupDate || '-'}
                  </div>
                </div>
                <div className="text-left" dir="ltr">
                  <div
                    className="text-[10px] text-slate-500 font-medium mb-0.5 text-left"
                    dir="rtl"
                  >
                    تاريخ الإرجاع
                  </div>
                  <div className="font-bold text-slate-900 text-xs">
                    {returnDate || '-'}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* DIVIDER BEFORE ITEMS TABLE */}
        <div className="border-b border-slate-200 w-full my-2.5" />

        {/* ITEMS TABLE (Matching Reference Image) */}
        <div className="mb-2">
          {/* Table Header Columns */}
          <div className="flex justify-between items-center text-xs font-semibold text-slate-600 pb-1.5 border-b border-slate-200">
            <div className="w-[52%] text-right font-semibold">الصنف</div>
            <div className="w-[18%] text-center font-semibold">الكمية</div>
            <div className="w-[30%] text-left font-semibold">
              {type === 'return' ? 'المسترد' : 'الإجمالي'}
            </div>
          </div>

          {/* Items Rows */}
          <div className="divide-y divide-slate-100">
            {items && items.length > 0 ? (
              items.map((item, idx) => {
                const qty = Number(item.quantity || 1);
                const unitPrice = Number(item.price_at_time ?? item.price ?? 0);
                const itemDisc = Number(item.discount || 0);
                const isPerc =
                  item.discount_type === 'percent' ||
                  item.discount_type === 'percentage';
                const discAmt =
                  itemDisc > 0
                    ? isPerc
                      ? (unitPrice * qty * itemDisc) / 100
                      : Math.min(unitPrice * qty, itemDisc)
                    : 0;
                const lineTotal = Math.max(0, unitPrice * qty - discAmt);

                // Build secondary details line: Barcode | Color | Size
                const detailsParts = [];
                if (item.barcode) detailsParts.push(`باركود: ${item.barcode}`);
                if (item.color) detailsParts.push(`اللون: ${item.color}`);
                const itemSize = item.size || item.size_cut;
                if (itemSize) detailsParts.push(`المقاس: ${itemSize}`);
                const detailsText = detailsParts.join(' | ');

                // Category tag appended if not already inside name
                const catStr =
                  item.category &&
                  !item.name?.toLowerCase().includes(item.category.toLowerCase())
                    ? ` (${item.category})`
                    : '';
                const fullItemName = `${item.name || 'صنف'}${catStr}`;

                return (
                  <div key={idx} className="py-2">
                    <div className="flex justify-between items-start text-xs font-bold text-slate-900">
                      <div className="w-[52%] text-right font-bold leading-snug break-words">
                        {fullItemName}
                      </div>
                      <div className="w-[18%] text-center font-semibold text-slate-800">
                        {qty}
                      </div>
                      <div
                        className="w-[30%] text-left font-bold text-slate-950"
                        dir="ltr"
                      >
                        {lineTotal.toFixed(2)}
                      </div>
                    </div>

                    {/* Secondary line: Barcode | Color | Size */}
                    {detailsText && (
                      <div className="text-[10px] text-slate-500 font-normal mt-0.5 text-right">
                        {detailsText}
                      </div>
                    )}

                    {/* Discount notice if applied */}
                    {discAmt > 0 && (
                      <div className="text-[10px] text-rose-600 font-bold mt-0.5 text-right">
                        خصم صنف: -{discAmt.toFixed(2)} ج.م
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="py-2 text-center text-slate-400 text-xs">
                لا توجد أصناف
              </div>
            )}
          </div>
        </div>

        {/* DIVIDER UNDER ITEMS */}
        <div className="border-b border-slate-200 w-full my-2" />

        {/* FINANCIAL SUMMARY / SUBTOTALS */}
        <div className="space-y-1.5 text-xs text-slate-700 my-2">
          <div className="flex justify-between items-center font-medium">
            <span>المجموع الفرعي</span>
            <span dir="ltr">{numSubtotal.toFixed(2)}</span>
          </div>

          {numDiscount > 0 && (
            <div className="flex justify-between items-center font-medium text-rose-600">
              <span>الخصم</span>
              <span dir="ltr">- {numDiscount.toFixed(2)}</span>
            </div>
          )}

          <div className="flex justify-between items-center font-medium">
            <span>الضريبة ({taxRate || 0}%)</span>
            <span dir="ltr">{numTax.toFixed(2)}</span>
          </div>

          {/* Deposit for Rentals */}
          {type === 'rental' && deposit > 0 && (
            <div className="flex justify-between items-center font-bold text-emerald-700">
              <span>مبلغ التأمين المسترد</span>
              <span dir="ltr">{Number(deposit).toFixed(2)} ج.م</span>
            </div>
          )}
        </div>

        {/* DIVIDER BEFORE GRAND TOTAL */}
        <div className="border-b border-slate-200 w-full my-2.5" />

        {/* PROMINENT GRAND TOTAL & BALANCES (Matching Photo) */}
        <div className="space-y-1.5 text-xs mb-3">
          {/* Grand Total */}
          <div className="flex justify-between items-center">
            <span className="text-sm font-black text-slate-900">
              {type === 'return' ? 'إجمالي المبلغ المسترد:' : 'الإجمالي الكلي:'}
            </span>
            <span
              className={`text-base sm:text-lg font-black ${
                type === 'return' ? 'text-rose-600' : 'text-slate-950'
              }`}
              dir="ltr"
            >
              {(type === 'return' && totalReturnAmount > 0
                ? Number(totalReturnAmount)
                : numTotal
              ).toFixed(2)}{' '}
              ج.م
            </span>
          </div>

          {/* Amount Paid */}
          {type !== 'return' && (
            <div className="flex justify-between items-center text-slate-700 font-medium">
              <span>المدفوع:</span>
              <span dir="ltr">{numPaid.toFixed(2)} ج.م</span>
            </div>
          )}

          {/* Remaining / Customer Change */}
          {type !== 'return' &&
            (numRemaining > 0 ? (
              <div className="flex justify-between items-center text-rose-700 font-bold">
                <span>المتبقي (على العميل):</span>
                <span dir="ltr">{numRemaining.toFixed(2)} ج.م</span>
              </div>
            ) : (
              <div className="flex justify-between items-center text-slate-700 font-medium">
                <span>المتبقي (الباقي للعميل):</span>
                <span dir="ltr">{numChange.toFixed(2)} ج.م</span>
              </div>
            ))}
        </div>

        {/* CREATIVE TOUCHES: BARCODE, VERIFICATION BADGE & POLICY */}
        <div className="border-t border-dashed border-slate-300 pt-2.5 mt-3 mb-1" />

        {showBarcode && (
          <div className="text-center py-0.5 overflow-hidden">
            <svg
              ref={barcodeRef}
              className="mx-auto max-h-11 w-auto max-w-[90%] object-contain"
            ></svg>
          </div>
        )}

        {showQrCode && (
          <div className="flex items-center justify-center gap-1.5 py-1 px-3 my-1.5 bg-slate-50 rounded-xl border border-slate-200/80 text-[10px] text-slate-600 font-medium">
            <QrCode className="w-3.5 h-3.5 text-slate-800 shrink-0" />
            <span>فاتورة إلكترونية موثقة • BEBYOON POS</span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          </div>
        )}

        {/* STORE POLICY & TERMS FOOTER */}
        <div className="text-center pt-1 space-y-0.5 text-[10px] text-slate-500 font-medium leading-relaxed">
          {footerMessage ? (
            <p className="font-bold text-slate-800 whitespace-pre-line">
              {footerMessage}
            </p>
          ) : (
            <>
              <p className="font-black text-slate-800 text-[11px]">
                شكراً لتعاملكم معنا ✨
              </p>
              <p>البضاعة المباعة تستبدل وتسترجع خلال 14 يوماً وفق الشروط والأحكام</p>
              <p>يشترط إحضار أصل الفاتورة مع بقاء تيكت الصنف الأصلي</p>
            </>
          )}
        </div>

        {/* BOTTOM ACTIONS (Inside card at bottom matching photo, hidden on print) */}
        {showActions && (
          <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-200 mt-4 no-print">
            <button
              type="button"
              onClick={onPrint}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-6 rounded-full bg-slate-900 hover:bg-black text-white font-bold text-xs sm:text-sm shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة</span>
            </button>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-full text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-bold text-xs sm:text-sm transition-all duration-200 cursor-pointer active:scale-95"
              >
                إغلاق
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ThermalReceipt;
