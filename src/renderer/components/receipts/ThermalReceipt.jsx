import React, { useEffect, useRef } from 'react';
import { Printer, QrCode, ShieldCheck } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import { formatReceiptDate, getPaymentMethodArabic } from '../../utils/receiptHelpers';
import { useBranch } from '../../context/BranchContext';
import { useAuth } from '../../context/AuthContext';

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
  paymentSplits = null,
  cashAmount = 0,
  bankTransferAmount = 0,
  cardAmount = 0,
  walletAmount = 0,
  branchName = '',
  branchId = null,
  branchLogo = '',
  logoUrl = '',
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

  // Dynamic branch logo resolution with automatic fallback
  let branchContextData = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    branchContextData = useBranch();
  } catch {}
  const { branches: ctxBranches = [], activeBranch = null } = branchContextData || {};

  let authContextData = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    authContextData = useAuth?.();
  } catch {}
  const { user = null } = authContextData || {};

  const userBranchId = user?.branch_id;
  const targetBranchId = branchId && branchId !== 'all' ? branchId : userBranchId;

  const branchObj =
    (targetBranchId && ctxBranches?.find((b) => b.id?.toString() === targetBranchId?.toString())) ||
    (branchName && ctxBranches?.find((b) => b.name?.trim().toLowerCase() === branchName?.trim().toLowerCase())) ||
    activeBranch ||
    (userBranchId && ctxBranches?.find((b) => b.id?.toString() === userBranchId?.toString())) ||
    ctxBranches?.find((b) => b.is_main_warehouse) ||
    ctxBranches?.[0] ||
    null;

  // Prioritize specific branch logo
  const effectiveLogo =
    logoUrl ||
    (branchObj?.logo_url && branchObj.logo_url !== '/logos/app-icon.png' ? branchObj.logo_url : null) ||
    (branchLogo && branchLogo !== '/logos/app-icon.png' ? branchLogo : null) ||
    branchObj?.logo_url ||
    branchLogo ||
    '/logos/app-icon.png';

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
  const normalizedSplits = Array.isArray(paymentSplits)
    ? paymentSplits
    : (typeof paymentSplits === 'string' ? (() => { try { return JSON.parse(paymentSplits); } catch { return []; } })() : []);
  const isSplit = paymentMethod === 'split' || (normalizedSplits && normalizedSplits.length > 1);
  const paymentMethodLabel = isSplit ? 'دفع مجزأ' : getPaymentMethodArabic(paymentMethod);

  // Auto-render CODE128 vector barcode safely
  useEffect(() => {
    if (!showBarcode || !barcodeRef.current) return;
    const rawVal = String(orderNumber || '').trim();
    // Sanitize to ASCII characters compatible with CODE128
    const barcodeVal = rawVal.replace(/[^\x00-\x7F]/g, '') || '1';

    try {
      JsBarcode(barcodeRef.current, barcodeVal, {
        format: 'CODE128',
        width: 1.35, fontOptions: "bold",
        height: 20,
        displayValue: true,
        fontSize: 8.5,
        font: "'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif",
        textMargin: 1,
        margin: 0,
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
        className="receipt-card bg-white text-black text-xs font-sans w-full max-w-[340px] p-2 sm:p-3 shadow-xl rounded-2xl border border-slate-200/90 relative select-text"
        style={{
          direction: 'rtl',
          fontFamily: "'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif", fontWeight: '800',
          color: '#000000',
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact',
        }}
      >
        {/* TOP BRAND HEADER */}
        <div className="text-center pb-0 space-y-0.5">
          <div className="w-full flex justify-center mb-0.5">
            <img
              src={effectiveLogo}
              alt={branchName || branchObj?.name || 'BEBYOON'}
              className="receipt-logo h-9 sm:h-10 w-auto max-w-[125px] object-contain mx-auto"
              style={{ maxHeight: '36px' }}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          <h2 className="text-xs font-black text-slate-900 tracking-tight leading-none mt-0.5">
            {receiptTitle}
          </h2>
          {(branchName || branchObj?.name || storeAddress) && (
            <p className="text-[10px] font-bold text-slate-700 leading-tight">
              {branchName || branchObj?.name || storeAddress}
            </p>
          )}
          {storePhone && (
            <p className="text-[9.5px] font-bold text-slate-600 leading-tight" dir="ltr">
              للتواصل: {storePhone}
            </p>
          )}
        </div>

        {/* TOP DIVIDER */}
        <div className="border-b border-slate-300/80 w-full my-0.5" />

        {/* METADATA 2-COLUMN GRID */}
        <div className="space-y-0.5 text-xs mb-0.5">
          {/* Row 1: Invoice Number & Date */}
          <div className="flex justify-between items-baseline py-0">
            <div className="text-right">
              <span className="text-[9px] text-black font-extrabold ml-1">
                {type === 'return' ? 'رقم الإيصال:' : 'رقم الفاتورة:'}
              </span>
              <span className="font-black text-slate-900 text-xs sm:text-[13px]">
                {orderNumber}
              </span>
            </div>
            <div className="text-left pl-1 flex items-baseline gap-1" dir="ltr">
              <span className="text-[9px] text-black font-extrabold">التاريخ:</span>
              <span className="font-bold text-slate-900 text-[10px]">
                {formattedDateTime}
              </span>
            </div>
          </div>

          {/* Row 2: Customer & Phone */}
          <div className="flex justify-between items-baseline py-0">
            <div className="text-right">
              <span className="text-[9px] text-black font-extrabold ml-1">العميل:</span>
              <span className="font-bold text-slate-900 text-xs">
                {customerName || 'عميل نقدي'}
              </span>
            </div>
            <div className="text-left pl-1 flex items-baseline gap-1" dir="ltr">
              <span className="text-[9px] text-black font-extrabold">الهاتف:</span>
              <span className="font-bold text-slate-900 text-[10px]">
                {customerPhone || '-'}
              </span>
            </div>
          </div>

          {/* Row 3: Cashier/Seller & Payment Method */}
          <div className="flex justify-between items-baseline py-0">
            <div className="text-right">
              <span className="text-[9px] text-black font-extrabold ml-1">
                {type === 'rental' ? 'مسؤول الحجز:' : 'البائع:'}
              </span>
              <span className="font-bold text-slate-900 text-xs">
                {sellerName || (type === 'rental' ? 'مسؤول التأجير' : 'الكاشير')}
              </span>
            </div>
            <div className="text-left pl-1 flex items-baseline gap-1">
              <span className="text-[9px] text-black font-extrabold">الدفع:</span>
              <span className="font-bold text-slate-900 text-xs text-left">
                {paymentMethodLabel}
              </span>
            </div>
          </div>

          {/* Optional Row for Return Orders */}
          {type === 'return' && originalOrderId && (
            <div className="flex justify-between items-baseline py-0">
              <div className="text-right">
                <span className="text-[9px] text-black font-extrabold ml-1">الطلب الأصلي:</span>
                <span className="font-bold text-slate-900 text-xs">#{originalOrderId}</span>
              </div>
              <div className="text-left pl-1">
                <span className="font-bold text-rose-600 text-[10px]">مرتجع مبيعات</span>
              </div>
            </div>
          )}

          {/* Optional Row for Rentals */}
          {type === 'rental' && (pickupDate || returnDate) && (
            <div className="flex justify-between items-baseline py-0">
              <div className="text-right">
                <span className="text-[9px] text-black font-extrabold ml-1">الاستلام:</span>
                <span className="font-bold text-slate-900 text-[10px]">{pickupDate || '-'}</span>
              </div>
              <div className="text-left pl-1 flex items-baseline gap-1" dir="ltr">
                <span className="text-[9px] text-black font-extrabold">الإرجاع:</span>
                <span className="font-bold text-slate-900 text-[10px]">{returnDate || '-'}</span>
              </div>
            </div>
          )}
        </div>

        {/* DIVIDER BEFORE ITEMS TABLE */}
        <div className="border-b border-slate-300/80 w-full my-0.5" />

        {/* ITEMS TABLE */}
        <div className="mb-0.5">
          {/* Table Header Columns */}
          <div className="flex justify-between items-center text-[10px] font-bold text-slate-600 pb-0.5 border-b border-slate-200">
            <div className="w-[50%] text-right font-bold">الصنف</div>
            <div className="w-[18%] text-center font-bold">الكمية</div>
            <div className="w-[32%] text-left font-bold pl-1">
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
                  <div key={idx} className="py-0.5">
                    <div className="flex justify-between items-start text-xs font-bold text-slate-900">
                      <div className="w-[50%] text-right font-bold leading-tight break-words">
                        {fullItemName}
                      </div>
                      <div className="w-[18%] text-center font-black text-black">
                        {qty}
                      </div>
                      <div
                        className="w-[32%] text-left font-bold text-slate-950 pl-1"
                        dir="ltr"
                      >
                        {lineTotal.toFixed(2)}
                      </div>
                    </div>

                    {/* Secondary line: Barcode | Color | Size */}
                    {detailsText && (
                      <div className="text-[8.5px] text-slate-900 font-bold mt-0 text-right leading-tight">
                        {detailsText}
                      </div>
                    )}

                    {/* Discount notice if applied */}
                    {discAmt > 0 && (
                      <div className="text-[8.5px] text-rose-600 font-bold mt-0 text-right leading-tight">
                        خصم صنف: -{discAmt.toFixed(2)} ج.م
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="py-0.5 text-center text-slate-400 text-xs">
                لا توجد أصناف
              </div>
            )}
          </div>
        </div>

        {/* DIVIDER UNDER ITEMS */}
        <div className="border-b border-slate-300/80 w-full my-0.5" />

        {/* FINANCIAL SUMMARY / SUBTOTALS */}
        <div className="space-y-0.5 text-xs text-slate-700 my-0.5">
          <div className="flex justify-between items-center font-bold">
            <span>المجموع الفرعي</span>
            <span dir="ltr" className="pl-1">{numSubtotal.toFixed(2)}</span>
          </div>

          {numDiscount > 0 && (
            <div className="flex justify-between items-center font-bold text-rose-600">
              <span>الخصم</span>
              <span dir="ltr" className="pl-1">- {numDiscount.toFixed(2)}</span>
            </div>
          )}

          <div className="flex justify-between items-center font-bold">
            <span>الضريبة ({taxRate || 0}%)</span>
            <span dir="ltr" className="pl-1">{numTax.toFixed(2)}</span>
          </div>

          {/* Deposit for Rentals */}
          {type === 'rental' && deposit > 0 && (
            <div className="flex justify-between items-center font-bold text-emerald-700">
              <span>مبلغ التأمين المسترد</span>
              <span dir="ltr" className="pl-1">{Number(deposit).toFixed(2)} ج.م</span>
            </div>
          )}
        </div>

        {/* DIVIDER BEFORE GRAND TOTAL */}
        <div className="border-b border-slate-300/80 w-full my-0.5" />

        {/* PROMINENT GRAND TOTAL & BALANCES */}
        <div className="space-y-0.5 text-xs mb-1">
          {/* Grand Total */}
          <div className="flex justify-between items-center py-0.5">
            <span className="text-xs sm:text-[13px] font-black text-slate-900">
              {type === 'return' ? 'إجمالي المبلغ المسترد:' : 'الإجمالي الكلي:'}
            </span>
            <span
              className={`text-sm sm:text-base font-black pl-1 ${
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

          {type !== 'return' && (
            <div className="flex justify-between items-center text-black font-black">
              <span>المدفوع:</span>
              <span dir="ltr" className="pl-1">{numPaid.toFixed(2)} ج.م</span>
            </div>
          )}

          {/* Split Payment Breakdown */}
          {type !== 'return' && isSplit && (
            <div className="bg-slate-50 border border-slate-200 rounded p-1 my-0.5 text-[9.5px] space-y-0.5">
              <div className="text-[9px] font-bold text-slate-600 border-b border-slate-200 pb-0.5">
                تفاصيل طرق الدفع (دفع مجزأ):
              </div>
              {normalizedSplits && normalizedSplits.length > 0 ? (
                normalizedSplits.map((s, idx) => (
                  <div key={idx} className="flex justify-between items-center text-slate-700">
                    <span>{getPaymentMethodArabic(s.method || s.payment_method)}:</span>
                    <span dir="ltr" className="font-black text-black pl-1">{Number(s.amount || 0).toFixed(2)} ج.م</span>
                  </div>
                ))
              ) : (
                <>
                  {Number(cashAmount) > 0 && (
                    <div className="flex justify-between items-center text-slate-700">
                      <span>نقداً (بالدرج):</span>
                      <span dir="ltr" className="font-black text-black pl-1">{Number(cashAmount).toFixed(2)} ج.م</span>
                    </div>
                  )}
                  {Number(bankTransferAmount) > 0 && (
                    <div className="flex justify-between items-center text-slate-700">
                      <span>انستاباي / تحويل بنكي:</span>
                      <span dir="ltr" className="font-black text-black pl-1">{Number(bankTransferAmount).toFixed(2)} ج.م</span>
                    </div>
                  )}
                  {Number(cardAmount) > 0 && (
                    <div className="flex justify-between items-center text-slate-700">
                      <span>بطاقة بنكية (فيزا):</span>
                      <span dir="ltr" className="font-black text-black pl-1">{Number(cardAmount).toFixed(2)} ج.م</span>
                    </div>
                  )}
                  {Number(walletAmount) > 0 && (
                    <div className="flex justify-between items-center text-slate-700">
                      <span>فودافون كاش:</span>
                      <span dir="ltr" className="font-black text-black pl-1">{Number(walletAmount).toFixed(2)} ج.م</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Remaining / Customer Change */}
          {type !== 'return' &&
            (numRemaining > 0 ? (
              <div className="flex justify-between items-center text-rose-700 font-bold">
                <span>المتبقي (على العميل):</span>
                <span dir="ltr" className="pl-1">{numRemaining.toFixed(2)} ج.م</span>
              </div>
            ) : (
              <div className="flex justify-between items-center text-black font-black">
                <span>المتبقي (الباقي للعميل):</span>
                <span dir="ltr" className="pl-1">{numChange.toFixed(2)} ج.م</span>
              </div>
            ))}
        </div>

        {/* BARCODE, VERIFICATION BADGE & POLICY */}
        <div className="border-t border-dashed border-slate-300 pt-0.5 mt-0.5 mb-0" />

        {showBarcode && (
          <div className="text-center py-0 overflow-hidden">
            <svg
              ref={barcodeRef}
              className="receipt-barcode mx-auto max-h-7 w-auto max-w-[80%] object-contain"
            ></svg>
          </div>
        )}

        {showQrCode && (
          <div className="flex items-center justify-center gap-1 py-0.5 px-2 my-0.5 bg-slate-50 rounded border border-slate-200/80 text-[8.5px] text-black font-extrabold">
            <QrCode className="w-2.5 h-2.5 text-slate-800 shrink-0" />
            <span>فاتورة إلكترونية موثقة • {branchObj?.name || 'BEBYOON'} POS</span>
            <ShieldCheck className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
          </div>
        )}

        {/* STORE POLICY & TERMS FOOTER */}
        <div className="text-center pt-0.5 space-y-0 text-[8px] text-black font-extrabold leading-tight">
          {footerMessage ? (
            <p className="font-bold text-slate-800 whitespace-pre-line">
              {footerMessage}
            </p>
          ) : (
            <>
              <p className="font-black text-slate-800 text-[9px]">
                شكراً لتعاملكم معنا ✨
              </p>
              <p>البضاعة المباعة تستبدل وتسترجع خلال 14 يوماً وفق الشروط والأحكام</p>
              <p>يشترط إحضار أصل الفاتورة مع بقاء تيكت الصنف الأصلي</p>
            </>
          )}
        </div>

        {/* BOTTOM ACTIONS (Inside card at bottom matching photo, hidden on print) */}
        {showActions && (
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-200 mt-3 no-print">
            <button
              type="button"
              onClick={onPrint}
              className="flex-1 flex items-center justify-center gap-2 py-2 px-5 rounded-full bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer active:scale-95"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة</span>
            </button>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-full text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-bold text-xs transition-all duration-200 cursor-pointer active:scale-95"
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
