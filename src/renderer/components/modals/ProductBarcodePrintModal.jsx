// src/renderer/components/modals/ProductBarcodePrintModal.jsx
// Dedicated modal for printing product barcodes with individual size selection & copy counts
import React, { useState, useEffect, useMemo } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Badge from '../ui/Badge';
import {
  Printer,
  Barcode,
  Check,
  CheckSquare,
  Square,
  Sparkles,
  Layers,
  Tag,
  Hash,
  X,
  Plus,
  Minus,
  Eye,
  Cpu,
} from 'lucide-react';
import {
  PAPER_TYPES,
  printBarcodes,
  extractProductSizes,
} from '../../utils/barcodePrint';
import VirtualThermalPrinterModal from './VirtualThermalPrinterModal';
import { useToast } from '../../context/ToastContext';
import { useBranch } from '../../context/BranchContext';
import { useAuth } from '../../context/AuthContext';

export function ProductBarcodePrintModal({
  isOpen,
  onClose,
  product,
  storeName,
  logoUrl,
  branchLogo,
  branchId,
  isNewlyCreated = false,
  title,
}) {
  const toastCtx = useToast();
  const toast = toastCtx?.toast || toastCtx;
  const { user } = useAuth?.() || {};
  const branchContext = useBranch?.() || {};
  const { activeBranch, branches, currentBranchId } = branchContext;

  const activeBranchObj = useMemo(() => {
    const targetId = branchId || (currentBranchId && currentBranchId !== 'all' ? currentBranchId : null) || user?.branch_id;
    if (targetId && targetId !== 'all') {
      const found = branches?.find((b) => b.id?.toString() === targetId.toString());
      if (found) return found;
    }
    return (
      activeBranch ||
      (user?.branch_id ? branches?.find((b) => b.id?.toString() === user.branch_id.toString()) : null) ||
      branches?.find((b) => b.is_main_warehouse) ||
      branches?.[0] ||
      null
    );
  }, [branches, branchId, currentBranchId, activeBranch, user?.branch_id]);

  const resolvedStoreName =
    storeName && storeName !== 'Bebyoon Center'
      ? storeName
      : activeBranchObj?.name || storeName || 'Bebyoon Center';

  const resolvedLogoUrl =
    logoUrl ||
    (activeBranchObj?.logo_url && activeBranchObj.logo_url !== '/logos/app-icon.png' ? activeBranchObj.logo_url : null) ||
    branchLogo ||
    activeBranchObj?.logo_url ||
    '/logos/app-icon.png';

  const [paperType, setPaperType] = useState(() => {
    try {
      const saved = localStorage.getItem('barcode_paper_type');
      if (saved && saved !== 'thermal-80mm' && PAPER_TYPES.some((pt) => pt.id === saved)) {
        return saved;
      }
      return 'sticker-38x25mm';
    } catch {
      return 'sticker-38x25mm';
    }
  });

  const handlePaperTypeChange = (newType) => {
    setPaperType(newType);
    try {
      localStorage.setItem('barcode_paper_type', newType);
    } catch {}
  };

  // Extracted distinct sizes from product
  const availableSizes = useMemo(() => {
    return extractProductSizes(product);
  }, [product]);

  const hasMultipleSizes = availableSizes.length > 0;

  // State: selected sizes with individual print copy counts
  const [sizeSettings, setSizeSettings] = useState({});
  const [generalCount, setGeneralCount] = useState(1);
  const [discountPrice, setDiscountPrice] = useState('');
  const [isPrinting, setIsPrinting] = useState(false);

  // Virtual Thermal Printer Simulator State
  const [isVirtualMode, setIsVirtualMode] = useState(() => {
    try {
      const saved = localStorage.getItem('barcode_virtual_mode');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const [showSimulator, setShowSimulator] = useState(false);
  const [simulatorQueue, setSimulatorQueue] = useState([]);

  // Initialize or reset settings when product opens
  useEffect(() => {
    if (isOpen && product) {
      setDiscountPrice('');
      if (hasMultipleSizes) {
        const initial = {};
        availableSizes.forEach((s) => {
          const key = s.variantKey || s.id || s.size_name;
          initial[key] = {
            selected: true,
            count: 1,
            size_name: s.size_name,
            color_name: s.color_name || product.color || '',
            stock: s.stock_level || 0,
          };
        });
        setSizeSettings(initial);
      } else {
        setGeneralCount(1);
      }
    }
  }, [isOpen, product, hasMultipleSizes, availableSizes]);

  // Toggle single size checkbox
  const toggleSizeSelect = (key) => {
    setSizeSettings((prev) => {
      const curr = prev[key] || { selected: false, count: 1 };
      return {
        ...prev,
        [key]: {
          ...curr,
          selected: !curr.selected,
        },
      };
    });
  };

  // Select ONLY one specific size (exclusive selection by size_name)
  const selectOnlySize = (sizeName) => {
    setSizeSettings((prev) => {
      const next = {};
      availableSizes.forEach((s) => {
        const key = s.variantKey || s.id || s.size_name;
        const curr = prev[key] || { count: 1 };
        next[key] = {
          ...curr,
          selected: s.size_name === sizeName,
        };
      });
      return next;
    });
  };

  // Select all sizes
  const selectAllSizes = () => {
    setSizeSettings((prev) => {
      const next = {};
      availableSizes.forEach((s) => {
        const key = s.variantKey || s.id || s.size_name;
        const curr = prev[key] || { count: 1 };
        next[key] = { ...curr, selected: true };
      });
      return next;
    });
  };

  // Deselect all sizes
  const deselectAllSizes = () => {
    setSizeSettings((prev) => {
      const next = {};
      availableSizes.forEach((s) => {
        const key = s.variantKey || s.id || s.size_name;
        const curr = prev[key] || { count: 1 };
        next[key] = { ...curr, selected: false };
      });
      return next;
    });
  };

  // Set 1 copy for all selected sizes
  const setOneCopyAll = () => {
    setSizeSettings((prev) => {
      const next = { ...prev };
      availableSizes.forEach((s) => {
        const key = s.variantKey || s.id || s.size_name;
        if (next[key]) {
          next[key].count = 1;
        }
      });
      return next;
    });
  };

  // Set copy counts equal to current stock for each size
  const setCopiesToStock = () => {
    setSizeSettings((prev) => {
      const next = { ...prev };
      availableSizes.forEach((s) => {
        const key = s.variantKey || s.id || s.size_name;
        if (next[key]) {
          next[key].count = Math.max(1, s.stock_level || 1);
        }
      });
      return next;
    });
  };

  // Update size copy count
  const updateSizeCount = (key, newCount) => {
    const valid = Math.max(1, Math.min(500, Number(newCount) || 1));
    setSizeSettings((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || { selected: true }),
        count: valid,
      },
    }));
  };

  // Calculate total stickers to print
  const totalStickersToPrint = useMemo(() => {
    if (!hasMultipleSizes) {
      return Math.max(1, Number(generalCount) || 1);
    }
    return Object.values(sizeSettings)
      .filter((s) => s.selected)
      .reduce((sum, s) => sum + (Number(s.count) || 0), 0);
  }, [hasMultipleSizes, sizeSettings, generalCount]);

  // Execute printing
  const handlePrint = async () => {
    if (!product) return;

    const basePrice = Number(product.price) > 0 ? Number(product.price) : (Number(product.rental_price) || 0);
    const hasDiscount =
      discountPrice &&
      Number(discountPrice) > 0 &&
      Number(discountPrice) < basePrice;
    const finalDiscountPrice = hasDiscount ? Number(discountPrice) : null;
    const effectivePrice = hasDiscount ? Number(discountPrice) : basePrice;
    const barcodeValue = String(
      product.barcode || String(product.id).padStart(6, '0')
    ).trim();

    const queue = [];

    if (hasMultipleSizes) {
      const selectedSizesList = availableSizes.filter((s) => {
        const key = s.variantKey || s.id || s.size_name;
        return sizeSettings[key]?.selected;
      });

      if (selectedSizesList.length === 0) {
        if (toast?.warning) {
          toast.warning('يرجى تحديد مقاس واحد على الأقل للطباعة');
        } else if (toast?.error) {
          toast.error('يرجى تحديد مقاس واحد على الأقل للطباعة');
        }
        return;
      }

      selectedSizesList.forEach((s) => {
        const key = s.variantKey || s.id || s.size_name;
        const conf = sizeSettings[key];
        const copies = Math.max(1, Number(conf?.count) || 1);
        const sizeColor = conf?.color_name || s.color_name || product.color || '';

        for (let i = 0; i < copies; i++) {
          queue.push({
            key: `${product.id}-${key}-${i}-${Date.now()}`,
            id: product.id,
            name: product.name || 'منتج بدون اسم',
            barcode: String(s.barcode || conf?.barcode || barcodeValue).trim(),
            color: sizeColor,
            size: s.size_name, // SINGLE SPECIFIC SIZE!
            category: product.category || '',
            originalPrice: basePrice,
            discountPrice: finalDiscountPrice,
            price: effectivePrice,
          });
        }
      });
    } else {
      const copies = Math.max(1, Number(generalCount) || 1);
      const rawSize = String(product.size_cut || product.size || '').trim();

      for (let i = 0; i < copies; i++) {
        queue.push({
          key: `${product.id}-${i}-${Date.now()}`,
          id: product.id,
          name: product.name || 'منتج بدون اسم',
          barcode: barcodeValue,
          color: product.color || '',
          size: rawSize,
          category: product.category || '',
          originalPrice: basePrice,
          discountPrice: finalDiscountPrice,
          price: effectivePrice,
        });
      }
    }

    if (queue.length === 0) {
      if (toast?.warning) {
        toast.warning('لا توجد ملصقات محددة للطباعة');
      } else if (toast?.error) {
        toast.error('لا توجد ملصقات محددة للطباعة');
      }
      return;
    }

    if (isVirtualMode) {
      setSimulatorQueue(queue);
      setShowSimulator(true);
      return;
    }

    try {
      setIsPrinting(true);
      const activePaper =
        PAPER_TYPES.find((pt) => pt.id === paperType) || PAPER_TYPES[0];

      await printBarcodes(queue, paperType, {
        storeName: resolvedStoreName,
        logoUrl: resolvedLogoUrl,
        iframeId: 'barcode-print-modal-frame',
      });

      toast.success?.(
        `تم إرسال ${queue.length} ملصق باركود للطابعة بنجاح (${activePaper.shortLabel})`
      );
      onClose();
    } catch (err) {
      console.error('Barcode print error from modal:', err);
      toast.error?.(err.message || 'تعذر إتمام عملية طباعة الباركود');
    } finally {
      setIsPrinting(false);
    }
  };

  if (!isOpen || !product) return null;

  const currentPrice = Number(product.price ?? product.rental_price ?? 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        title ||
        (isNewlyCreated
          ? '🎉 تم إضافة المنتج بنجاح - طباعة الباركود'
          : 'طباعة باركود المنتج 🖨️')
      }
      maxWidth="max-w-2xl"
    >
      <div className="space-y-5 text-right select-none" style={{ direction: 'rtl' }}>
        {/* Newly Added Banner */}
        {isNewlyCreated && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-emerald-800">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-black">
                تم حفظ وإضافة المنتج إلى المخزون بنجاح!
              </div>
              <div className="text-xs font-semibold text-emerald-700 mt-0.5">
                يمكنك الآن طباعة ملصقات الباركود للمقاسات التي تريدها مباشرة قبل إغلاق النافذة.
              </div>
            </div>
          </div>
        )}

        {/* Product Information Card */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-base font-black text-slate-900">
                {product.name}
              </span>
              {product.category && (
                <Badge variant="neutral" size="sm">
                  {product.category}
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 font-bold">
              <span className="font-mono bg-white px-2 py-0.5 rounded-lg border border-slate-200 text-indigo-700">
                باركود: {product.barcode || `#${product.id}`}
              </span>
              {product.color && <span>اللون: {product.color}</span>}
              <span>
                السعر الأساسي:{' '}
                <strong className="text-slate-900">{currentPrice} ج.م</strong>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-indigo-50/80 border border-indigo-200/60 text-indigo-900 text-[11px] font-bold">
                <img
                  src={resolvedLogoUrl}
                  alt=""
                  className="w-3.5 h-3.5 object-contain rounded"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <span>شعار: {resolvedStoreName}</span>
              </span>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <div className="text-center px-3 py-2 bg-white rounded-xl border border-slate-200 shadow-xs">
              <div className="text-[10px] font-bold text-slate-400">
                إجمالي الملصقات
              </div>
              <div className="text-xl font-black text-indigo-600">
                {totalStickersToPrint}
              </div>
            </div>
          </div>
        </div>

        {/* Settings: Paper Type & Discount */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Paper Type */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Printer className="w-4 h-4 text-slate-500" />
              <span>نوع الورق / الملصق *</span>
            </label>
            <select
              value={paperType}
              onChange={(e) => handlePaperTypeChange(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-900 focus:ring-2 focus:ring-slate-900 cursor-pointer"
            >
              {PAPER_TYPES.map((pt) => (
                <option key={pt.id} value={pt.id}>
                  {pt.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 font-medium">
              {PAPER_TYPES.find((pt) => pt.id === paperType)?.description}
            </p>
          </div>

          {/* Discount Price (Optional) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Tag className="w-4 h-4 text-slate-500" />
              <span>سعر خاص / تخفيض على الملصق (اختياري)</span>
            </label>
            <Input
              type="number"
              min="0"
              placeholder="اتركه فارغاً لاعتماد السعر الأساسي"
              value={discountPrice}
              onChange={(e) => setDiscountPrice(e.target.value)}
            />
            {discountPrice && Number(discountPrice) > 0 && (
              <p className="text-[11px] text-emerald-600 font-bold">
                ✓ سيتم شطب السعر القديم ({currentPrice} ج.م) وطباعة السعر المخفض (
                {discountPrice} ج.م)
              </p>
            )}
          </div>
        </div>

        {/* Sizes Configuration Section */}
        {hasMultipleSizes ? (
          <div className="space-y-3 pt-2 border-t border-slate-100">
            {/* Size Section Header & Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <label className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  <span>اختر المقاسات المطلوب طباعتها وعدد الملصقات لكل مقاس:</span>
                </label>
                <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                  💡 سيتم طباعة ملصق منفصل لكل مقاس محدد بدقة دون دمج كل المقاسات على استيكر واحد
                </p>
              </div>

              {/* Quick Actions */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={selectAllSizes}
                  className="px-2.5 py-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
                >
                  تحديد الكل
                </button>
                <button
                  type="button"
                  onClick={deselectAllSizes}
                  className="px-2.5 py-1 text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  إلغاء التحديد
                </button>
                <button
                  type="button"
                  onClick={setOneCopyAll}
                  className="px-2.5 py-1 text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  نسخة واحدة
                </button>
                {availableSizes.some((s) => s.stock_level > 0) && (
                  <button
                    type="button"
                    onClick={setCopiesToStock}
                    className="px-2.5 py-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer"
                  >
                    حسب الرصيد
                  </button>
                )}
              </div>
            </div>

            {/* Quick Size Filter Buttons (One-Click isolate size) */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              <span className="text-[11px] font-bold text-slate-400 whitespace-nowrap">
                اختر مقاس محدد فقط:
              </span>
              {Array.from(new Set(availableSizes.map((s) => s.size_name))).map((sizeName) => (
                <button
                  key={sizeName}
                  type="button"
                  onClick={() => selectOnlySize(sizeName)}
                  className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                    Object.values(sizeSettings).filter((x) => x.selected).length > 0 &&
                    Object.values(sizeSettings).every((x) => !x.selected || x.size_name === sizeName)
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                  title={`طباعة باركود مقاس ${sizeName} فقط`}
                >
                  مقاس {sizeName}
                </button>
              ))}
            </div>

            {/* Sizes List Table */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-64 overflow-y-auto divide-y divide-slate-100">
              {availableSizes.map((s) => {
                const key = s.variantKey || s.id || s.size_name;
                const conf = sizeSettings[key] || {
                  selected: false,
                  count: 1,
                };
                const isSelected = conf.selected;

                return (
                  <div
                    key={key}
                    className={`flex items-center justify-between p-3 transition-colors ${
                      isSelected ? 'bg-indigo-50/50' : 'bg-white hover:bg-slate-50'
                    }`}
                  >
                    {/* Checkbox and Size Info (using label prevents double toggle event bubbling) */}
                    <label className="flex items-center gap-3 cursor-pointer select-none flex-1">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSizeSelect(key)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-900 px-2 py-0.5 bg-white border border-slate-200 rounded-md">
                          {s.size_name}
                        </span>
                        {s.color_name && (
                          <span className="text-xs font-semibold text-slate-500">
                            • لون: {s.color_name}
                          </span>
                        )}
                        <span className="text-xs text-slate-400 font-bold">
                          (الرصيد: {s.stock_level} قطعة)
                        </span>
                        {s.barcode && (
                          <span className="text-[11px] font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 font-bold" dir="ltr">
                            {s.barcode}
                          </span>
                        )}
                      </div>
                    </label>

                    {/* Quantity Control */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-500">
                        عدد الملصقات:
                      </span>
                      <div className="flex items-center border border-slate-300 rounded-xl bg-white overflow-hidden shadow-2xs">
                        <button
                          type="button"
                          disabled={!isSelected || conf.count <= 1}
                          onClick={() =>
                            updateSizeCount(key, conf.count - 1)
                          }
                          className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          disabled={!isSelected}
                          min="1"
                          max="500"
                          value={conf.count}
                          onChange={(e) =>
                            updateSizeCount(key, e.target.value)
                          }
                          className="w-12 h-8 text-center text-xs font-black text-slate-900 border-0 focus:ring-0 disabled:bg-slate-100"
                        />
                        <button
                          type="button"
                          disabled={!isSelected}
                          onClick={() =>
                            updateSizeCount(key, conf.count + 1)
                          }
                          className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Single Size / No Multi-size fallback */
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Hash className="w-4 h-4 text-slate-500" />
              <span>عدد الملصقات المطلوب طباعتها:</span>
            </label>
            <div className="flex items-center gap-3">
              <div className="flex items-center border border-slate-300 rounded-xl bg-white overflow-hidden shadow-2xs">
                <button
                  type="button"
                  disabled={generalCount <= 1}
                  onClick={() =>
                    setGeneralCount((prev) => Math.max(1, prev - 1))
                  }
                  className="w-10 h-10 flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={generalCount}
                  onChange={(e) =>
                    setGeneralCount(Math.max(1, Number(e.target.value) || 1))
                  }
                  className="w-16 h-10 text-center text-sm font-black text-slate-900 border-0 focus:ring-0"
                />
                <button
                  type="button"
                  onClick={() => setGeneralCount((prev) => prev + 1)}
                  className="w-10 h-10 flex items-center justify-center text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <span className="text-xs font-semibold text-slate-400">
                (ملصق لنفس هذا المنتج)
              </span>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPrinting}
            >
              {isNewlyCreated ? 'إغلاق / لاحقاً' : 'إلغاء'}
            </Button>

            {/* Virtual Printer Mode Toggle */}
            <label
              htmlFor="modal-barcode-virtual-toggle"
              className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none bg-[#FAF6ED] border border-[#E6DECD] px-3 py-1.5 rounded-xl hover:bg-[#F3ECE0] transition-colors"
            >
              <div className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  id="modal-barcode-virtual-toggle"
                  checked={isVirtualMode}
                  onChange={(e) => {
                    setIsVirtualMode(e.target.checked);
                    try {
                      localStorage.setItem('barcode_virtual_mode', String(e.target.checked));
                    } catch {}
                  }}
                  className="sr-only peer"
                />
                <div className="w-8 h-4 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-violet-600"></div>
              </div>
              <span className="flex items-center gap-1.5">
                <Cpu className={`w-3.5 h-3.5 ${isVirtualMode ? 'text-violet-600' : 'text-slate-400'}`} />
                <span className={isVirtualMode ? 'text-violet-900 font-black' : 'text-slate-600 font-bold'}>
                  طابعة افتراضية (معاينة)
                </span>
                {isVirtualMode && (
                  <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-black bg-violet-100 text-violet-700 border border-violet-200">
                    نشط
                  </span>
                )}
              </span>
            </label>
          </div>

          <Button
            type="button"
            variant="primary"
            icon={isVirtualMode ? Eye : Printer}
            onClick={handlePrint}
            loading={isPrinting}
            disabled={totalStickersToPrint <= 0 || isPrinting}
            size="lg"
            className={`px-6 ${isVirtualMode ? '!bg-violet-700 hover:!bg-violet-800' : ''}`}
          >
            {isVirtualMode
              ? `معاينة الطباعة الافتراضية (${totalStickersToPrint}) 🖨️`
              : `طباعة الباركود الآن (${totalStickersToPrint} ملصق) 🖨️`}
          </Button>
        </div>
      </div>

      {/* VIRTUAL THERMAL PRINTER SIMULATOR MODAL */}
      <VirtualThermalPrinterModal
        isOpen={showSimulator}
        onClose={() => setShowSimulator(false)}
        queue={simulatorQueue}
        paperType={paperType}
        storeName={resolvedStoreName}
        logoUrl={resolvedLogoUrl}
        onPrintPhysical={async () => {
          await printBarcodes(simulatorQueue, paperType, {
            storeName: resolvedStoreName,
            logoUrl: resolvedLogoUrl,
            iframeId: 'barcode-print-modal-frame',
          });
        }}
      />
    </Modal>
  );
}

export default ProductBarcodePrintModal;
