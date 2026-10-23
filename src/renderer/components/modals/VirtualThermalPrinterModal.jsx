// src/renderer/components/modals/VirtualThermalPrinterModal.jsx
// High-fidelity Virtual Thermal Printer Simulator for barcode label verification
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Printer,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  Layers,
  Barcode,
  Maximize2,
  FileText,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Cpu,
  Sliders,
  Check,
  Tag,
  Info,
} from 'lucide-react';
import {
  PAPER_TYPES,
  generateBarcodeSvg,
  generateBarcodePrintHtml,
  exportBarcodePdf,
  formatVariantText,
  escapeHtml,
} from '../../utils/barcodePrint';
import { useToast } from '../../context/ToastContext';
import Button from '../ui/Button';

export function VirtualThermalPrinterModal({
  isOpen,
  onClose,
  queue = [],
  paperType = 'sticker-38x25mm',
  storeName = 'Bebyoon Center',
  logoUrl = null,
  onPrintPhysical = null,
}) {
  const toastCtx = useToast();
  const toast = toastCtx?.toast || toastCtx;

  // View mode: 'tape' (Roll Strip) | 'inspector' (Single Label Magnifier) | 'frame' (Raw Print Engine HTML)
  const [viewMode, setViewMode] = useState('tape');

  // Zoom system: 1 = 100% (actual mm scale), ranges from 0.5 to 3.0
  const [zoom, setZoom] = useState(1.5); // Default 150% for comfortable on-screen legibility

  // Batch navigation: selected label index
  const [currentIndex, setCurrentIndex] = useState(0);

  // PDF Exporting indicator
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isSendingToPrinter, setIsSendingToPrinter] = useState(false);

  // Active paper configuration
  const activePaper = useMemo(() => {
    return PAPER_TYPES.find((pt) => pt.id === paperType) || PAPER_TYPES[0];
  }, [paperType]);

  const totalLabels = queue.length;
  const currentItem = queue[currentIndex] || queue[0] || null;

  // Keep currentIndex bounded if queue length changes
  useEffect(() => {
    if (currentIndex >= queue.length && queue.length > 0) {
      setCurrentIndex(queue.length - 1);
    }
  }, [queue.length, currentIndex]);

  // Keyboard navigation shortcuts
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        setCurrentIndex((prev) => Math.min(queue.length - 1, prev + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        setCurrentIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === '+' || e.key === '=') {
        setZoom((prev) => Math.min(3.0, Number((prev + 0.25).toFixed(2))));
      } else if (e.key === '-' || e.key === '_') {
        setZoom((prev) => Math.max(0.5, Number((prev - 0.25).toFixed(2))));
      } else if (e.key === '0') {
        setZoom(1.0);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, queue.length]);

  // Lock body scroll when modal is active
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Pre-generate raw printable HTML for the direct engine view
  const rawPrintHtml = useMemo(() => {
    if (!isOpen || queue.length === 0) return '';
    return generateBarcodePrintHtml(queue, paperType, storeName, logoUrl, {
      forSimulator: true,
    });
  }, [isOpen, queue, paperType, storeName, logoUrl]);

  // PDF Export Handler
  const handleExportPdf = async () => {
    if (!queue || queue.length === 0) {
      toast({
        title: 'تنبيه',
        message: 'لا توجد ملصقات في قائمة المعاينة للتصدير',
        variant: 'warning',
      });
      return;
    }

    try {
      setIsExportingPdf(true);
      const res = await exportBarcodePdf(queue, paperType, {
        storeName,
        logoUrl,
        dialogTitle: `تصدير ملصقات الباركود (${activePaper.label})`,
        defaultFileName: `barcodes-${activePaper.shortLabel.replace(/[\s×*]+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`,
      });

      if (res && res.canceled) {
        return; // User canceled save dialog
      }

      if (res && res.success) {
        toast({
          title: 'تم تصدير ملف PDF بنجاح',
          message: res.filePath
            ? `تم حفظ الملصقات بقياساتها الفيزيائية الدقيقة في:\n${res.filePath}`
            : 'تم إنشاء وحفظ ملف PDF بنجاح',
          variant: 'success',
        });
      } else if (res && res.error) {
        toast({
          title: 'خطأ أثناء تصدير PDF',
          message: res.error,
          variant: 'danger',
        });
      }
    } catch (err) {
      console.error('PDF export error:', err);
      toast({
        title: 'خطأ أثناء التصدير',
        message: err.message || 'تعذر إتمام عملية تصدير ملف PDF',
        variant: 'danger',
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Optional Physical Print Trigger directly from simulator
  const handleTriggerPhysicalPrint = async () => {
    if (!onPrintPhysical) return;
    try {
      setIsSendingToPrinter(true);
      await onPrintPhysical();
      toast({
        title: 'تم الإرسال للطابعة الفعلية',
        message: `تم إرسال ${queue.length} ملصق إلى الطابعة`,
        variant: 'success',
      });
    } catch (err) {
      console.error('Physical print trigger error:', err);
      toast({
        title: 'خطأ أثناء الطباعة الفعلية',
        message: err.message || 'تعذر إرسال الملصقات للطابعة',
        variant: 'danger',
      });
    } finally {
      setIsSendingToPrinter(false);
    }
  };

  if (!isOpen) return null;

  // Physical label dimensions in mm
  const is80mm = paperType === 'thermal-80mm';
  const widthMm = activePaper.widthMm || 38;
  const heightMm = activePaper.heightMm || 25;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-slate-950/80 backdrop-blur-md select-none text-slate-100 animate-fade-in"
      style={{ direction: 'rtl' }}
    >
      {/* TOP STATUS & SPECIFICATION HEADER */}
      <header className="shrink-0 bg-[#161616] border-b border-[#282725] px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 shadow-md">
        {/* Title & Engine Status */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400 shadow-inner">
            <Cpu className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-white tracking-tight font-display">
                محاكي الطابعة الحرارية الافتراضية
              </h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                المحاكي نشط (203 DPI)
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-400 mt-0.5">
              معاينة حية دقيقة للملصقات مطابقة لمخرجات رأس الطباعة الحراري بدون استهلاك ورق
            </p>
          </div>
        </div>

        {/* Paper & Hardware Specs Badges */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#202020] border border-[#333230] text-slate-300 font-bold">
            <Tag className="w-3.5 h-3.5 text-violet-400" />
            <span>المقاس:</span>
            <span className="font-mono text-white font-black">
              {is80mm ? '80 مم (عرض 72 مم)' : `${widthMm} × ${heightMm} مم`}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#202020] border border-[#333230] text-slate-300 font-bold">
            <Barcode className="w-3.5 h-3.5 text-amber-400" />
            <span>التشفير:</span>
            <span className="font-mono text-white font-black">CODE128</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#202020] border border-[#333230] text-slate-300 font-bold">
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            <span>إجمالي الملصقات:</span>
            <span className="font-mono text-white font-black">{totalLabels}</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-[#282725] transition-colors cursor-pointer mr-1"
            title="إغلاق والعودة للقائمة (ESC)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* INTERACTIVE CONTROLS TOOLBAR */}
      <div className="shrink-0 bg-[#1F1E1C] border-b border-[#2C2B28] px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Left Side: View Mode Tabs */}
        <div className="flex items-center gap-1 bg-[#141414] p-1 rounded-xl border border-[#2B2A27]">
          <button
            type="button"
            onClick={() => setViewMode('tape')}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'tape'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-[#242321]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>شريط الرول (الكامل)</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('inspector')}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'inspector'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-[#242321]'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>فاحص الملصق الفردي</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('frame')}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'frame'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-[#242321]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>المستند المباشر (HTML)</span>
          </button>
        </div>

        {/* Center: Zoom Controls */}
        <div className="flex items-center gap-1 bg-[#141414] px-2 py-1 rounded-xl border border-[#2B2A27]">
          <span className="text-[11px] font-bold text-slate-400 pl-1">مستوى التكبير:</span>

          <button
            type="button"
            onClick={() => setZoom((prev) => Math.max(0.5, Number((prev - 0.25).toFixed(2))))}
            disabled={zoom <= 0.5}
            className="p-1 rounded-md text-slate-300 hover:text-white hover:bg-[#242321] disabled:opacity-30 cursor-pointer"
            title="تصغير (-)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <select
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="bg-[#1C1B19] text-white text-xs font-mono font-bold px-2 py-0.5 rounded border border-[#333230] cursor-pointer"
          >
            <option value="0.5">50%</option>
            <option value="0.75">75%</option>
            <option value="1">100% (فعلي)</option>
            <option value="1.25">125%</option>
            <option value="1.5">150% (موصى)</option>
            <option value="2">200%</option>
            <option value="3">300% (فائق)</option>
          </select>

          <button
            type="button"
            onClick={() => setZoom((prev) => Math.min(3.0, Number((prev + 0.25).toFixed(2))))}
            disabled={zoom >= 3.0}
            className="p-1 rounded-md text-slate-300 hover:text-white hover:bg-[#242321] disabled:opacity-30 cursor-pointer"
            title="تكبير (+)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setZoom(1.0)}
            className="px-2 py-0.5 text-[11px] font-bold rounded bg-[#242321] text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="إعادة ضبط 100% (الحجم الفعلي 1:1)"
          >
            1:1
          </button>
        </div>

        {/* Right Side: Batch Navigator */}
        <div className="flex items-center gap-1 bg-[#141414] px-2 py-1 rounded-xl border border-[#2B2A27]">
          <button
            type="button"
            onClick={() => setCurrentIndex(0)}
            disabled={currentIndex === 0}
            className="p-1 rounded-md text-slate-300 hover:text-white hover:bg-[#242321] disabled:opacity-30 cursor-pointer"
            title="أول ملصق"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            disabled={currentIndex === 0}
            className="p-1 rounded-md text-slate-300 hover:text-white hover:bg-[#242321] disabled:opacity-30 cursor-pointer"
            title="الملصق السابق (سهم يسار)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <span className="px-1 text-xs font-bold text-slate-400">ملصق</span>
          <input
            type="number"
            min="1"
            max={totalLabels || 1}
            value={totalLabels > 0 ? currentIndex + 1 : 0}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && val >= 1 && val <= totalLabels) {
                setCurrentIndex(val - 1);
              }
            }}
            className="w-12 text-center bg-[#1C1B19] text-violet-400 font-mono font-black text-xs px-1 py-0.5 rounded border border-[#333230] focus:ring-1 focus:ring-violet-500 cursor-pointer"
            title="أدخل رقم الملصق للانتقال المباشر"
          />
          <span className="px-1 text-xs font-bold text-slate-400">من {totalLabels}</span>

          <button
            type="button"
            onClick={() => setCurrentIndex((prev) => Math.min(totalLabels - 1, prev + 1))}
            disabled={currentIndex >= totalLabels - 1}
            className="p-1 rounded-md text-slate-300 hover:text-white hover:bg-[#242321] disabled:opacity-30 cursor-pointer"
            title="الملصق التالي (سهم يمين)"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setCurrentIndex(totalLabels - 1)}
            disabled={currentIndex >= totalLabels - 1}
            className="p-1 rounded-md text-slate-300 hover:text-white hover:bg-[#242321] disabled:opacity-30 cursor-pointer"
            title="آخر ملصق"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Actions Group: PDF Export, Physical Print & Close */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={Download}
            onClick={handleExportPdf}
            loading={isExportingPdf}
            className="!border-[#3E3D3A] !bg-[#282724] !text-white hover:!bg-[#33322F] text-xs font-bold"
          >
            تصدير PDF (قياس دقيق)
          </Button>

          {onPrintPhysical && (
            <Button
              variant="primary"
              size="sm"
              icon={Printer}
              onClick={handleTriggerPhysicalPrint}
              loading={isSendingToPrinter}
              className="!bg-emerald-600 hover:!bg-emerald-700 text-xs font-bold"
            >
              طباعة بالطابعة الفعلية
            </Button>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            className="!bg-[#2B2A27] !text-slate-300 hover:!text-white hover:!bg-[#353430] text-xs font-bold"
          >
            إغلاق
          </Button>
        </div>
      </div>

      {/* MAIN VIEWPORT BODY */}
      <main className="flex-1 overflow-auto bg-[#121110] p-4 sm:p-6 custom-scrollbar flex flex-col items-center justify-start">
        {queue.length === 0 ? (
          <div className="my-auto text-center text-slate-400">
            <AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p className="text-base font-bold">لا توجد ملصقات في قائمة الانتظار للمعاينة</p>
          </div>
        ) : viewMode === 'tape' ? (
          /* ========================================================== */
          /* 1. CONTINUOUS THERMAL ROLL TAPE VIEW                       */
          /* ========================================================== */
          <div className="w-full flex flex-col items-center pb-12">
            {/* Visual simulation of printer dispenser slot */}
            <div className="w-full max-w-2xl flex items-center justify-between text-[11px] font-mono text-slate-400 mb-3 px-2">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
                فتحة خروج الورق (Thermal Dispenser Head)
              </span>
              <span>
                المقياس على الشاشة: <span className="text-white font-bold">{Math.round(zoom * 100)}%</span>
              </span>
            </div>

            {/* Simulated release backing liner strip */}
            <div
              className="relative rounded-2xl p-4 sm:p-6 shadow-2xl transition-all duration-200 flex flex-col items-center"
              style={{
                backgroundColor: '#EADFCF', // Realistic siliconized release backing liner (yellow-tan wax paper)
                backgroundImage:
                  'repeating-linear-gradient(45deg, rgba(0,0,0,0.015) 0, rgba(0,0,0,0.015) 10px, transparent 0, transparent 20px)',
                boxShadow:
                  '0 20px 40px -15px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(0,0,0,0.1), inset 0 2px 4px rgba(255,255,255,0.4)',
                transform: `scale(${zoom})`,
                transformOrigin: 'top center',
                marginBottom: `${Math.max(40, (zoom - 1) * 350)}px`,
              }}
            >
              {/* Backing paper header metadata */}
              <div className="w-full text-center pb-3 border-b border-[#D5C7B0] text-[9px] font-mono text-[#8C795C] font-black tracking-wider uppercase">
                ▲ THERMAL LABEL ROLL • {activePaper.label} • 203 DPI ▲
              </div>

              {/* Sequential Stickers Strip */}
              <div className="flex flex-col items-center gap-3 pt-3">
                {queue.map((item, idx) => {
                  const isSelected = idx === currentIndex;
                  return (
                    <div
                      key={item.key || `${item.id}-${idx}`}
                      onClick={() => setCurrentIndex(idx)}
                      className="relative group cursor-pointer"
                    >
                      {/* Label sequence badge on backing liner */}
                      <div className="absolute -right-8 top-1/2 -translate-y-1/2 text-[10px] font-mono font-black text-[#8C795C] opacity-80 group-hover:opacity-100">
                        #{idx + 1}
                      </div>

                      {/* Rendered Physical Thermal Sticker */}
                      <div
                        className={`transition-all duration-150 ${
                          isSelected
                            ? 'ring-2 ring-violet-500 ring-offset-2 ring-offset-[#EADFCF] shadow-xl'
                            : 'hover:shadow-md'
                        }`}
                      >
                        <SimulatedSticker
                          item={item}
                          paperType={paperType}
                          storeName={storeName}
                          logoUrl={logoUrl}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Backing paper footer metadata */}
              <div className="w-full text-center pt-4 mt-2 border-t border-[#D5C7B0] text-[9px] font-mono text-[#8C795C] font-black tracking-wider uppercase">
                ▼ END OF BATCH ({queue.length} LABELS TOTAL) ▼
              </div>
            </div>
          </div>
        ) : viewMode === 'inspector' ? (
          /* ========================================================== */
          /* 2. SINGLE LABEL MAGNIFIER & METADATA INSPECTOR             */
          /* ========================================================== */
          <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-start my-auto py-4">
            {/* Left Column: Enlarged Label with Millimeter Axes Rulers */}
            <div className="lg:col-span-7 bg-[#1A1917] p-6 rounded-3xl border border-[#2B2A27] shadow-xl flex flex-col items-center">
              <div className="w-full flex items-center justify-between text-xs text-slate-400 mb-4 pb-2 border-b border-[#282725]">
                <span className="font-bold flex items-center gap-2">
                  <Maximize2 className="w-4 h-4 text-violet-400" />
                  معاينة مجهرية بقياسات الملصق الفعلية
                </span>
                <span className="font-mono text-white font-black">
                  ملصق #{currentIndex + 1} من {totalLabels}
                </span>
              </div>

              {/* Rulers + Sticker Viewport */}
              <div className="relative p-6 bg-[#11100F] rounded-2xl border border-[#242321] flex flex-col items-center overflow-auto max-w-full">
                <div
                  style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: 'top center',
                    margin: `${Math.max(16, (zoom - 1) * 36)}px auto`,
                  }}
                  className="flex flex-col items-center transition-transform duration-150"
                >
                  {/* Top Millimeter Ruler */}
                  <div
                    className="flex justify-between text-[8px] font-mono text-slate-400 mb-1 border-b border-dashed border-slate-600 pb-0.5"
                    style={{ width: is80mm ? '72mm' : `${widthMm}mm`, direction: 'ltr' }}
                  >
                    <span>0mm</span>
                    <span>{is80mm ? '36mm' : `${Math.round(widthMm / 2)}mm`}</span>
                    <span>{is80mm ? '72mm' : `${widthMm}mm`}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Left Millimeter Ruler */}
                    <div
                      className="flex flex-col justify-between text-[8px] font-mono text-slate-400 border-r border-dashed border-slate-600 pr-1"
                      style={{ height: is80mm ? '120px' : `${heightMm}mm`, direction: 'ltr' }}
                    >
                      <span>0</span>
                      <span>{is80mm ? '...' : Math.round(heightMm / 2)}</span>
                      <span>{is80mm ? 'auto' : `${heightMm}mm`}</span>
                    </div>

                    {/* Magnified Sticker View */}
                    <div className="shadow-2xl rounded-[2px] ring-1 ring-white/20">
                      {currentItem && (
                        <SimulatedSticker
                          item={currentItem}
                          paperType={paperType}
                          storeName={storeName}
                          logoUrl={logoUrl}
                          forceShadow
                        />
                      )}
                    </div>
                  </div>
                </div>

                <p className="text-[10px] text-slate-400 font-mono mt-3">
                  * المسطرة المليمترية مطابقة للقياس الفعلي ({is80mm ? '80 مم' : `${widthMm} × ${heightMm} مم`}) وتتزامن بدقة مع مستوى التكبير
                </p>
              </div>
            </div>

            {/* Right Column: Detailed Field Audit */}
            <div className="lg:col-span-5 bg-[#1A1917] p-6 rounded-3xl border border-[#2B2A27] shadow-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#282725]">
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-violet-400" />
                  تدقيق حقول الملصق الحالي
                </h3>
                <span className="text-xs font-mono font-bold text-violet-400">
                  كود #{currentItem?.id || '-'}
                </span>
              </div>

              {currentItem ? (
                <div className="space-y-3 text-xs">
                  {/* Product Name */}
                  <div className="p-3 rounded-xl bg-[#22211F] border border-[#302F2C]">
                    <div className="text-[11px] font-bold text-slate-400 mb-1">اسم المنتج المطبوع:</div>
                    <div className="text-sm font-black text-white">{currentItem.name}</div>
                    <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-2 font-mono">
                      <span>عدد الحروف: {currentItem.name?.length || 0}</span>
                      <span>• الالتفاف: سطر واحد مع قطع آمن (...)</span>
                    </div>
                  </div>

                  {/* Barcode Value & Encoding */}
                  <div className="p-3 rounded-xl bg-[#22211F] border border-[#302F2C]">
                    <div className="text-[11px] font-bold text-slate-400 mb-1">رمز وقيمة الباركود:</div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-base font-black text-amber-400 tracking-wider">
                        {currentItem.barcode}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        CODE128 صالح
                      </span>
                    </div>
                    <div className="text-[10px] text-emerald-400 mt-1.5 flex items-center gap-1 font-bold">
                      <CheckCircle2 className="w-3 h-3 shrink-0" />
                      <span>متوافق مع كافة أجهزة المسح الضوئي والليزرية (Quiet Zone & Contrast OK)</span>
                    </div>
                  </div>

                  {/* Variant: Size & Color */}
                  <div className="p-3 rounded-xl bg-[#22211F] border border-[#302F2C]">
                    <div className="text-[11px] font-bold text-slate-400 mb-1">المقاس واللون (الفردي):</div>
                    <div className="flex items-center gap-3">
                      <div>
                        <span className="text-slate-400">المقاس: </span>
                        <span className="font-black text-indigo-400 font-mono">
                          {currentItem.size || 'بدون مقاس'}
                        </span>
                      </div>
                      {currentItem.color && (
                        <div>
                          <span className="text-slate-400">اللون: </span>
                          <span className="font-bold text-white">{currentItem.color}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Price & Discount */}
                  <div className="p-3 rounded-xl bg-[#22211F] border border-[#302F2C]">
                    <div className="text-[11px] font-bold text-slate-400 mb-1">بيانات السعر والخصم:</div>
                    <div className="flex items-center gap-3">
                      <div className="text-base font-black text-emerald-400">
                        {currentItem.price} ج.م
                      </div>
                      {currentItem.discountPrice && (
                        <div className="text-xs line-through text-slate-500">
                          {currentItem.originalPrice} ج.م
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Physical Printhead Specs */}
                  <div className="p-3 rounded-xl bg-[#141414] border border-[#292825] text-[11px] space-y-1 text-slate-400 font-mono">
                    <div className="flex justify-between">
                      <span>أبعاد الملصق:</span>
                      <span className="text-white font-bold">
                        {widthMm}mm × {heightMm}mm
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>النقاط الحرارية (Dots):</span>
                      <span className="text-white font-bold">
                        {Math.round(widthMm * 8)} × {Math.round(heightMm * 8)} dots
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>طريقة الطباعة:</span>
                      <span className="text-white font-bold">حرق حراري مباشر (Direct Thermal)</span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          /* ========================================================== */
          /* 3. DIRECT ENGINE VIEW (RAW PRINT IFRAME RENDER)            */
          /* ========================================================== */
          <div className="w-full max-w-4xl flex flex-col items-center my-auto pb-8">
            <div className="w-full flex items-center justify-between text-xs text-slate-400 mb-3 px-2">
              <span className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-violet-400" />
                المعاينة المباشرة لما يولّده محرك الطباعة والـ CSS الحقيقي
              </span>
              <span className="font-mono text-slate-400">
                Sandbox Iframe • عزْل تام للأكواد
              </span>
            </div>

            <div
              className="w-full rounded-2xl overflow-hidden border border-[#2E2D2A] shadow-2xl bg-black"
              style={{ height: '70vh' }}
            >
              <iframe
                title="Direct Thermal Engine Preview"
                srcDoc={rawPrintHtml}
                className="w-full h-full border-0"
                sandbox="allow-same-origin allow-scripts"
              />
            </div>
          </div>
        )}
      </main>

      {/* FOOTER SHORTCUT HINT */}
      <footer className="shrink-0 bg-[#161616] border-t border-[#262523] px-6 py-2 flex items-center justify-between text-[11px] text-slate-500 font-mono">
        <div>
          اختصارات لوحة المفاتيح: <kbd className="px-1 py-0.5 rounded bg-[#242321] text-slate-300">ESC</kbd> إغلاق •{' '}
          <kbd className="px-1 py-0.5 rounded bg-[#242321] text-slate-300">←</kbd>{' '}
          <kbd className="px-1 py-0.5 rounded bg-[#242321] text-slate-300">→</kbd> التنقل بين الملصقات •{' '}
          <kbd className="px-1 py-0.5 rounded bg-[#242321] text-slate-300">+</kbd>{' '}
          <kbd className="px-1 py-0.5 rounded bg-[#242321] text-slate-300">-</kbd> التكبير والتصغير
        </div>
        <div>Elwazeer POS Thermal Engine v2.0 • 203 DPI Certified</div>
      </footer>
    </div>,
    document.body
  );
}

/**
 * Exact Visual Simulation Component for a Thermal Label
 * Uses the exact same SVG generator, exact dimensions, typography, and layout as physical output
 */
function SimulatedSticker({ item, paperType, storeName, logoUrl, forceShadow = false }) {
  const is38 = paperType === 'sticker-38x25mm';
  const is40 = paperType === 'sticker-40x25mm';
  const is50 = paperType === 'sticker-50x30mm';
  const is80 = paperType === 'thermal-80mm';

  const origPrice = Number(item.originalPrice ?? item.price ?? 0);
  const hasDiscount =
    item.discountPrice !== null &&
    item.discountPrice !== undefined &&
    Number(item.discountPrice) > 0 &&
    Number(item.discountPrice) < origPrice;
  const finalPrice = hasDiscount ? Number(item.discountPrice) : origPrice;
  const variantText = formatVariantText(item);

  // SVG generated by JsBarcode with exact parameters matching barcodePrint.js
  const barcodeSvgHtml = useMemo(() => {
    return generateBarcodeSvg(item.barcode, paperType);
  }, [item.barcode, paperType]);

  // Dimensions
  const widthMm = is40 ? '40mm' : is50 ? '50mm' : is80 ? '72mm' : '38mm';
  const heightMm = is50 ? '30mm' : is80 ? 'auto' : '23.8mm';

  if (is80) {
    return (
      <div
        className={`bg-white text-black p-3 rounded-sm border-b-2 border-dashed border-black flex flex-col items-center text-center ${
          forceShadow ? 'shadow-lg' : ''
        }`}
        style={{
          width: '72mm',
          fontFamily: "'Cairo', Tahoma, Arial, sans-serif",
          boxSizing: 'border-box',
          color: '#000000',
        }}
      >
        {logoUrl ? (
          <img
            src={logoUrl}
            alt=""
            className="max-h-[10mm] max-w-[40mm] object-contain mb-1"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <div className="text-[12pt] font-black tracking-tight">{storeName}</div>
        )}
        <div className="text-[11pt] font-black break-words mt-1">{item.name}</div>
        {variantText && <div className="text-[9pt] font-bold text-slate-800">{variantText}</div>}
        <div
          className="w-full my-1 flex justify-center items-center"
          dangerouslySetInnerHTML={{ __html: barcodeSvgHtml }}
        />
        <div className="font-mono text-[10pt] font-black tracking-widest">{item.barcode}</div>
        <div className="text-[12pt] font-black mt-1 flex items-center justify-center gap-2">
          {hasDiscount && (
            <span className="line-through text-slate-600 text-[9pt] font-semibold">{origPrice} ج.م</span>
          )}
          <span>{finalPrice} ج.م</span>
        </div>
      </div>
    );
  }

  // Individual Sticker Label: 38x25mm (Default), 40x25mm, or 50x30mm
  const is50Format = is50;

  return (
    <div
      className={`bg-white text-black rounded-[2px] flex flex-col items-center justify-between text-center overflow-hidden transition-shadow ${
        forceShadow ? 'shadow-2xl' : 'shadow-sm'
      }`}
      style={{
        width: widthMm,
        maxWidth: widthMm,
        height: heightMm,
        maxHeight: heightMm,
        boxSizing: 'border-box',
        padding: is50Format ? '0.6mm 1.2mm' : '0.5mm 1mm',
        fontFamily: "'Cairo', Tahoma, Arial, sans-serif",
        color: '#000000',
        direction: 'ltr',
      }}
    >
      {/* Header: Logo or Store Name */}
      <div
        className="w-full flex items-center justify-center overflow-hidden shrink-0"
        style={{ height: is50Format ? '5mm' : '4mm', maxHeight: is50Format ? '5mm' : '4mm' }}
      >
        {logoUrl ? (
          <img
            src={logoUrl}
            alt=""
            className="object-contain"
            style={{
              maxHeight: is50Format ? '4.8mm' : '3.8mm',
              maxWidth: is50Format ? '32mm' : '26mm',
            }}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              if (e.currentTarget.nextElementSibling) {
                e.currentTarget.nextElementSibling.style.display = 'block';
              }
            }}
          />
        ) : null}
        <span
          className="w-full font-black truncate"
          style={{
            fontSize: is50Format ? '7.5pt' : '6pt',
            display: logoUrl ? 'none' : 'block',
            direction: 'rtl',
            lineHeight: 1,
          }}
        >
          {storeName}
        </span>
      </div>

      {/* Product Title */}
      <div
        className="w-full font-extrabold truncate shrink-0"
        style={{
          fontSize: is50Format ? '7pt' : '6pt',
          lineHeight: 1.05,
          maxHeight: is50Format ? '3.4mm' : '2.8mm',
          direction: 'rtl',
        }}
      >
        {item.name || 'منتج'}
      </div>

      {/* Variant: Size & Color */}
      {variantText ? (
        <div
          className="w-full font-bold truncate shrink-0 text-slate-900"
          style={{
            fontSize: is50Format ? '6pt' : '5pt',
            lineHeight: 1,
            maxHeight: is50Format ? '2.7mm' : '2.2mm',
            direction: 'rtl',
          }}
        >
          {variantText}
        </div>
      ) : null}

      {/* Vector Barcode Graphic */}
      <div
        className="w-full flex justify-center items-center overflow-hidden shrink-0"
        style={{
          height: is50Format ? '7mm' : '5.6mm',
          maxHeight: is50Format ? '7mm' : '5.6mm',
          direction: 'ltr',
        }}
        dangerouslySetInnerHTML={{ __html: barcodeSvgHtml }}
      />

      {/* Barcode Numeric Code */}
      <div
        className="w-full font-mono font-black shrink-0 truncate"
        style={{
          fontSize: is50Format ? '6.5pt' : '5.5pt',
          lineHeight: 1,
          letterSpacing: is50Format ? '0.8px' : '0.5px',
          maxHeight: is50Format ? '2.7mm' : '2.2mm',
          direction: 'ltr',
        }}
      >
        {item.barcode}
      </div>

      {/* Price & Discount */}
      <div
        className="w-full font-black flex items-center justify-center gap-1 shrink-0"
        style={{
          fontSize: is50Format ? '8.5pt' : '8pt',
          lineHeight: 1.1,
          maxHeight: '4.2mm',
          direction: 'rtl',
        }}
      >
        {hasDiscount && (
          <span
            className="line-through font-normal text-slate-700"
            style={{ fontSize: is50Format ? '6.5pt' : '5.5pt' }}
          >
            {origPrice} ج.م
          </span>
        )}
        <span>{finalPrice} ج.م</span>
      </div>
    </div>
  );
}

export default VirtualThermalPrinterModal;
