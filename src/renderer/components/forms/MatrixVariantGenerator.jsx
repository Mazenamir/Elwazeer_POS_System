// src/renderer/components/forms/MatrixVariantGenerator.jsx
// Fast Matrix Variant Generator (Colors x Sizes) with individual 12-digit barcodes and instant keyboard-friendly stock entry.

import React, { useState, useMemo } from 'react';
import {
  Palette,
  Layers,
  Sparkles,
  Zap,
  Trash2,
  Plus,
  Check,
  AlertCircle,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

// Standard clothing color palette with realistic hex accents
const POPULAR_COLORS = [
  { name: 'أبيض', hex: '#FFFFFF', isLight: true },
  { name: 'أسود', hex: '#18181B' },
  { name: 'كحلي', hex: '#1E293B' },
  { name: 'رمادي', hex: '#64748B' },
  { name: 'أزرق', hex: '#2563EB' },
  { name: 'أحمر', hex: '#DC2626' },
  { name: 'أخضر', hex: '#16A34A' },
  { name: 'أصفر', hex: '#EAB308', isLight: true },
  { name: 'بني', hex: '#78350F' },
  { name: 'زيتي', hex: '#4D533C' },
  { name: 'جملي', hex: '#C19A6B' },
  { name: 'نبيتي', hex: '#881337' },
  { name: 'بيج', hex: '#F5F5DC', isLight: true },
  { name: 'رصاصي', hex: '#9CA3AF' },
  { name: 'سماوي', hex: '#38BDF8' },
  { name: 'ذهبي', hex: '#D4AF37' },
  { name: 'فضي', hex: '#CBD5E1', isLight: true },
  { name: 'زيتوني', hex: '#556B2F' },
  { name: 'هافان', hex: '#B87333' },
  { name: 'كافيه', hex: '#6F4E37' },
  { name: 'مينت جرين', hex: '#86EFAC', isLight: true },
  { name: 'أوف وايت', hex: '#F8FAFC', isLight: true },
];

const PRESETS = [
  { id: 'suits_men', label: 'بدل رجالي (46-58)', sizes: ['46', '48', '50', '52', '54', '56', '58'] },
  { id: 'suits_slim', label: 'بدل سليم (48-54)', sizes: ['48', '50', '52', '54'] },
  { id: 'shirts', label: 'قمصان/كاجوال (S-3XL)', sizes: ['S', 'M', 'L', 'XL', '2XL', '3XL'] },
  { id: 'shoes', label: 'أحذية (40-45)', sizes: ['40', '41', '42', '43', '44', '45'] },
  { id: 'pants', label: 'بنطلونات رجالي (30-40)', sizes: ['30', '32', '34', '36', '38', '40'] },
  { id: 'kids_boys', label: 'أطفال أولادي (2-12)', sizes: ['2', '4', '6', '8', '10', '12'] },
  { id: 'kids_girls', label: 'أطفال بناتي (2-12)', sizes: ['2', '4', '6', '8', '10', '12'] },
  { id: 'free_size', label: 'مقاس موحد (حر)', sizes: ['حر'] },
];

const LETTER_SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];
const NUMBER_SIZES = ['28', '30', '32', '34', '36', '38', '40', '42', '44', '46', '48', '50', '52', '54', '56', '58', '60'];

// Generates a clean 12-digit numeric barcode starting with 20...
export const generate12DigitBarcode = () => {
  const ts = Date.now().toString().slice(-6);
  const rnd = Math.floor(1000 + Math.random() * 9000).toString();
  return `20${ts}${rnd}`;
};

export default function MatrixVariantGenerator({
  productSizes = [],
  setProductSizes,
  existingColors = [],
  existingSizes = [],
}) {
  const toast = useToast();
  const [selectedColors, setSelectedColors] = useState([]);
  const [selectedSizes, setSelectedSizes] = useState([]);
  const [customColor, setCustomColor] = useState('');
  const [showCustomColorInput, setShowCustomColorInput] = useState(false);
  const [customSize, setCustomSize] = useState('');
  const [showCustomSizeInput, setShowCustomSizeInput] = useState(false);
  const [bulkStockValue, setBulkStockValue] = useState('');
  const [copiedBarcode, setCopiedBarcode] = useState(null);

  // Combine default popular colors with DB colors
  const allColorOptions = useMemo(() => {
    const list = [...POPULAR_COLORS];
    const existingNames = new Set(POPULAR_COLORS.map((c) => c.name.toLowerCase()));
    if (Array.isArray(existingColors)) {
      existingColors.forEach((colorStr) => {
        const trimmed = String(colorStr || '').trim();
        if (trimmed && !existingNames.has(trimmed.toLowerCase())) {
          list.push({ name: trimmed, hex: '#94A3B8' });
          existingNames.add(trimmed.toLowerCase());
        }
      });
    }
    return list;
  }, [existingColors]);

  // Toggle color selection
  const toggleColor = (colorName) => {
    setSelectedColors((prev) =>
      prev.includes(colorName) ? prev.filter((c) => c !== colorName) : [...prev, colorName]
    );
  };

  // Toggle size selection
  const toggleSize = (sizeName) => {
    setSelectedSizes((prev) =>
      prev.includes(sizeName) ? prev.filter((s) => s !== sizeName) : [...prev, sizeName]
    );
  };

  // Apply preset to sizes selector
  const applyPreset = (presetSizes) => {
    setSelectedSizes(presetSizes);
  };

  // Add custom color
  const handleAddCustomColor = (e) => {
    e?.preventDefault();
    const clean = customColor.trim();
    if (!clean) return;
    if (!selectedColors.includes(clean)) {
      setSelectedColors((prev) => [...prev, clean]);
    }
    setCustomColor('');
    setShowCustomColorInput(false);
    toast.success(`تمت إضافة وتحديد اللون: ${clean}`);
  };

  // Add custom size
  const handleAddCustomSize = (e) => {
    e?.preventDefault();
    const clean = customSize.trim();
    if (!clean) return;
    if (!selectedSizes.includes(clean)) {
      setSelectedSizes((prev) => [...prev, clean]);
    }
    setCustomSize('');
    setShowCustomSizeInput(false);
    toast.success(`تمت إضافة وتحديد المقاس: ${clean}`);
  };

  // Single-Color Instant Preset Trigger ("أدوس أبيض ينزل لي مقاسات تك تك")
  const generateInstantForColor = (colorName, presetSizes) => {
    const targetSizes = presetSizes && presetSizes.length > 0
      ? presetSizes
      : selectedSizes.length > 0
      ? selectedSizes
      : ['48', '50', '52', '54'];

    const newRows = [];
    targetSizes.forEach((sz) => {
      // Check if already in table
      const exists = productSizes.some(
        (p) =>
          String(p.color_name || '').trim().toLowerCase() === colorName.toLowerCase() &&
          String(p.size_name || '').trim().toLowerCase() === sz.toLowerCase()
      );
      if (!exists) {
        newRows.push({
          id: Date.now() + Math.random(),
          size_name: sz,
          color_name: colorName,
          stock_level: '0',
        });
      }
    });

    if (newRows.length === 0) {
      toast.error(`جميع مقاسات اللون "${colorName}" موجودة بالفعل بالجدول.`);
      return;
    }

    setProductSizes((prev) => [...prev, ...newRows]);
    toast.success(`⚡ تم توليد ${newRows.length} مقاساً للون "${colorName}" بنجاح!`);
  };

  // Bulk Matrix Generator: (Selected Colors x Selected Sizes)
  const handleGenerateMatrix = (replace = false) => {
    if (selectedColors.length === 0) {
      toast.error('يرجى اختيار لون واحد على الأقل من لوحة الألوان');
      return;
    }
    if (selectedSizes.length === 0) {
      toast.error('يرجى اختيار مقاس واحد أو قالب من لوحة المقاسات');
      return;
    }

    const newRows = [];
    selectedColors.forEach((col) => {
      selectedSizes.forEach((sz) => {
        newRows.push({
          id: Date.now() + Math.random() + newRows.length,
          size_name: sz,
          color_name: col,
          stock_level: '0',
        });
      });
    });

    if (replace) {
      setProductSizes(newRows);
      toast.success(`⚡ تم إنشاء ${newRows.length} توليفة جديدة بالجدول بباركودات مستقلة!`);
    } else {
      // Merge unique
      setProductSizes((prev) => {
        const filteredNew = newRows.filter(
          (nr) =>
            !prev.some(
              (p) =>
                String(p.color_name || '').trim().toLowerCase() === nr.color_name.toLowerCase() &&
                String(p.size_name || '').trim().toLowerCase() === nr.size_name.toLowerCase()
            )
        );
        if (filteredNew.length === 0) {
          toast.warning('جميع التوليفات المختارة موجودة بالفعل في الجدول.');
          return prev;
        }
        toast.success(`⚡ تم إضافة ${filteredNew.length} مقاساً جديداً إلى الجدول!`);
        return [...prev, ...filteredNew];
      });
    }
  };

  // Apply uniform stock level to all variants
  const handleApplyBulkStock = () => {
    const val = String(bulkStockValue).trim();
    if (val === '' || isNaN(val) || Number(val) < 0) {
      toast.error('يرجى إدخال رقم صحيح للكمية');
      return;
    }
    setProductSizes((prev) =>
      prev.map((s) => ({ ...s, stock_level: val }))
    );
    toast.success(`تم ضبط كمية جميع المقاسات (${productSizes.length}) إلى ${val} قطعة بنجاح!`);
  };

  // Row update helpers
  const updateRow = (id, field, value) => {
    setProductSizes((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  };

  const removeRow = (id) => {
    setProductSizes((prev) => prev.filter((s) => s.id !== id));
  };

  const addManualRow = () => {
    setProductSizes((prev) => [
      ...prev,
      {
        id: Date.now() + Math.random(),
        size_name: '',
        color_name: selectedColors[0] || '',
        stock_level: '0',
      },
    ]);
  };

  const clearAllRows = () => {
    if (productSizes.length === 0) return;
    if (window.confirm('هل أنت متأكد من مسح جميع المقاسات المولدة بالجدول؟')) {
      setProductSizes([]);
      toast.success('تم مسح الجدول');
    }
  };

  const copyToClipboard = (barcode, id) => {
    navigator.clipboard.writeText(barcode);
    setCopiedBarcode(id);
    setTimeout(() => setCopiedBarcode(null), 1500);
    toast.success(`تم نسخ الباركود: ${barcode}`);
  };

  // Calculated totals
  const totalStockCount = useMemo(() => {
    return productSizes.reduce((sum, s) => sum + (Number(s.stock_level) || 0), 0);
  }, [productSizes]);

  const potentialMatrixCount = selectedColors.length * selectedSizes.length;

  return (
    <div className="space-y-4">
      {/* SECTION 1: COLORS SELECTOR */}
      <div className="bg-white rounded-2xl border-2 border-indigo-100 p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
              <Palette className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                <span>1. اختر الألوان</span>
                {selectedColors.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-extrabold text-[11px] border border-indigo-200">
                    تم تحديد {selectedColors.length}
                  </span>
                )}
              </h4>
              <p className="text-[11px] text-slate-500 font-medium">
                اضغط على أي لون لتحديده، أو اضغط مطولاً للتوليد السريع
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {selectedColors.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedColors([])}
                className="text-[11px] text-rose-600 hover:text-rose-700 font-bold px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
              >
                إلغاء تحديد الألوان
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowCustomColorInput((prev) => !prev)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[11px] border border-indigo-200 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>لون مخصص</span>
            </button>
          </div>
        </div>

        {/* Custom Color Inline Input */}
        {showCustomColorInput && (
          <div className="flex items-center gap-2 p-2.5 bg-indigo-50/70 rounded-xl border border-indigo-200 animate-in fade-in slide-in-from-top-1">
            <input
              type="text"
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
              placeholder="اكتب اسم اللون الجديد (مثال: كشمير، بيج فاتح، سيمون)..."
              className="flex-1 bg-white border border-indigo-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleAddCustomColor(e)}
            />
            <button
              type="button"
              onClick={handleAddCustomColor}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
            >
              إضافة وتحديد
            </button>
            <button
              type="button"
              onClick={() => setShowCustomColorInput(false)}
              className="px-2.5 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        )}

        {/* Color Chips Grid */}
        <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
          {allColorOptions.map((c) => {
            const isSelected = selectedColors.includes(c.name);
            return (
              <button
                key={c.name}
                type="button"
                onClick={() => toggleColor(c.name)}
                className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer shadow-2xs ${
                  isSelected
                    ? 'bg-indigo-600 text-white border-2 border-indigo-700 scale-[1.02] shadow-sm'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 hover:border-slate-300'
                }`}
                title={`انقر لتحديد أو إلغاء تحديد: ${c.name}`}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0 shadow-2xs"
                  style={{
                    backgroundColor: c.hex || '#64748B',
                    border: c.isLight || isSelected ? '1px solid rgba(0,0,0,0.15)' : 'none',
                  }}
                />
                <span>{c.name}</span>
                {isSelected && (
                  <span className="flex items-center gap-1">
                    <Check className="w-3 h-3 stroke-[3]" />
                    <span
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        generateInstantForColor(c.name);
                      }}
                      className="p-0.5 rounded bg-indigo-700 hover:bg-amber-500 text-amber-300 hover:text-indigo-950 transition-colors cursor-pointer"
                      title={`توليد سريع لمقاسات ${c.name} فقط ⚡`}
                    >
                      <Zap className="w-3 h-3 fill-current" />
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* SECTION 2: SIZES & PRESETS SELECTOR */}
      <div className="bg-white rounded-2xl border-2 border-indigo-100 p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                <span>2. اختر المقاسات (قوالب، حروف، أو أرقام)</span>
                {selectedSizes.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-extrabold text-[11px] border border-indigo-200">
                    تم تحديد {selectedSizes.length} مقاس
                  </span>
                )}
              </h4>
              <p className="text-[11px] text-slate-500 font-medium">
                اختر قالباً جاهزاً بضغطة واحدة، أو حدد مقاسات محددة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {selectedSizes.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedSizes([])}
                className="text-[11px] text-rose-600 hover:text-rose-700 font-bold px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
              >
                إلغاء تحديد المقاسات
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowCustomSizeInput((prev) => !prev)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[11px] border border-indigo-200 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>مقاس مخصص</span>
            </button>
          </div>
        </div>

        {/* Custom Size Inline Input */}
        {showCustomSizeInput && (
          <div className="flex items-center gap-2 p-2.5 bg-indigo-50/70 rounded-xl border border-indigo-200 animate-in fade-in slide-in-from-top-1">
            <input
              type="text"
              value={customSize}
              onChange={(e) => setCustomSize(e.target.value)}
              placeholder="اكتب المقاس (مثال: 62، 6XL، محير)..."
              className="flex-1 bg-white border border-indigo-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleAddCustomSize(e)}
            />
            <button
              type="button"
              onClick={handleAddCustomSize}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
            >
              إضافة وتحديد
            </button>
            <button
              type="button"
              onClick={() => setShowCustomSizeInput(false)}
              className="px-2.5 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        )}

        {/* Quick Presets Buttons */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-black text-slate-500 block">
            قوالب سريعة جاهزة (نقرة واحدة لتحديد النطاق كامل):
          </span>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => {
              const isAllActive = p.sizes.every((sz) => selectedSizes.includes(sz));
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.sizes)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer border ${
                    isAllActive
                      ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                      : 'bg-white hover:bg-indigo-50 text-indigo-700 border-indigo-200 shadow-2xs'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Letter Sizes (S, M, L, ...) */}
        <div className="space-y-1.5 pt-1">
          <span className="text-[11px] font-black text-slate-500 block">مقاسات حروف:</span>
          <div className="flex flex-wrap gap-1.5">
            {LETTER_SIZES.map((sz) => {
              const isSelected = selectedSizes.includes(sz);
              return (
                <button
                  key={sz}
                  type="button"
                  onClick={() => toggleSize(sz)}
                  className={`w-11 h-8 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center border ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {sz}
                </button>
              );
            })}
          </div>
        </div>

        {/* Numeric Sizes (28, 30, ...) */}
        <div className="space-y-1.5 pt-1">
          <span className="text-[11px] font-black text-slate-500 block">مقاسات أرقام:</span>
          <div className="flex flex-wrap gap-1.5">
            {NUMBER_SIZES.map((sz) => {
              const isSelected = selectedSizes.includes(sz);
              return (
                <button
                  key={sz}
                  type="button"
                  onClick={() => toggleSize(sz)}
                  className={`w-10 h-8 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center border ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {sz}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* SECTION 3: FAST GENERATION TRIGGER BANNER (تِك تِك ⚡) */}
      <div className="p-3.5 bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white rounded-2xl shadow-md border border-indigo-700 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-400 text-indigo-950 flex items-center justify-center shrink-0 shadow-sm font-black">
            <Zap className="w-5 h-5 fill-amber-400" />
          </div>
          <div>
            <div className="text-xs font-black flex items-center gap-2">
              <span>مولد المصفوفة الذكي (تِك تِك)</span>
              {potentialMatrixCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-white font-extrabold text-[11px]">
                  سيتم توليد {potentialMatrixCount} صنفاً
                </span>
              )}
            </div>
            <div className="text-[11px] text-indigo-200 mt-0.5">
              {selectedColors.length === 0 || selectedSizes.length === 0 ? (
                <span>⚠️ يرجى تحديد الألوان والمقاسات بالأعلى لتفعيل التوليد الفوري</span>
              ) : (
                <span>
                  {selectedColors.length} ألوان × {selectedSizes.length} مقاسات = توليد فوري لجميع المقاسات بالجدول
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            disabled={selectedColors.length === 0 || selectedSizes.length === 0}
            onClick={() => handleGenerateMatrix(false)}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-700 disabled:opacity-50 text-white font-black text-xs transition-all shadow-sm hover:shadow-md cursor-pointer disabled:cursor-not-allowed"
          >
            <Sparkles className="w-4 h-4" />
            <span>توليد المقاسات فوراً ⚡</span>
          </button>
        </div>
      </div>

      {/* SECTION 4: GENERATED VARIANTS PREVIEW TABLE */}
      <div className="bg-white rounded-2xl border-2 border-slate-200 overflow-hidden shadow-2xs space-y-2">
        {/* Table Sub-Header with Bulk Quantity Setter & Live Counter */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-slate-800">
              جدول مقاسات وألوان المنتج:
            </span>
            <span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 font-extrabold text-xs border border-indigo-200">
              {productSizes.length} صنف/مقاس
            </span>
            <span className="px-2.5 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 font-black text-xs border border-emerald-200">
              إجمالي المخزون: {totalStockCount} قطعة
            </span>
          </div>

          {/* Bulk Stock Setter (Set stock for all rows with 1 click) */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-500">كمية موحدة للكل:</span>
            <input
              type="number"
              min="0"
              value={bulkStockValue}
              onChange={(e) => setBulkStockValue(e.target.value)}
              placeholder="0"
              className="w-24 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-center outline-none focus:border-indigo-600"
            />
            <button
              type="button"
              onClick={handleApplyBulkStock}
              className="px-2 py-1 bg-white hover:bg-slate-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
            >
              تطبيق
            </button>
          </div>
        </div>

        {/* Variants Rows Table */}
        <div className="overflow-x-auto max-h-72 overflow-y-auto">
          {productSizes.length === 0 ? (
            <div className="py-8 text-center text-slate-400 space-y-1">
              <Layers className="w-8 h-8 mx-auto text-slate-300 stroke-[1.5]" />
              <p className="text-xs font-bold text-slate-600">لا توجد مقاسات في الجدول حالياً</p>
              <p className="text-[11px] text-slate-400">
                اختر الألوان والمقاسات بالأعلى واضغط &quot;توليد المقاسات والباركودات ⚡&quot; لتنزيلها فوراً
              </p>
            </div>
          ) : (
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100/80 sticky top-0 z-10 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 w-[36%]">اللون</th>
                  <th className="py-2.5 px-3 w-[36%]">المقاس (Size)</th>
                  <th className="py-2.5 px-3 w-[20%] text-center">الكمية بالمخزن</th>
                  <th className="py-2.5 px-3 text-center w-12">حذف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {productSizes.map((row) => (
                  <tr key={row.id} className="hover:bg-indigo-50/30 transition-colors">
                    {/* COLOR */}
                    <td className="p-2">
                      <input
                        type="text"
                        value={row.color_name || ''}
                        onChange={(e) => updateRow(row.id, 'color_name', e.target.value)}
                        placeholder="اللون..."
                        className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-600 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none transition-all"
                        required
                      />
                    </td>

                    {/* SIZE */}
                    <td className="p-2">
                      <input
                        type="text"
                        value={row.size_name || ''}
                        onChange={(e) => updateRow(row.id, 'size_name', e.target.value)}
                        placeholder="المقاس..."
                        className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-600 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none transition-all text-center"
                        required
                      />
                    </td>

                    {/* STOCK LEVEL */}
                    <td className="p-2">
                      <input
                        type="number"
                        min="0"
                        value={row.stock_level}
                        onChange={(e) => updateRow(row.id, 'stock_level', e.target.value)}
                        onFocus={(e) => e.target.select()}
                        className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-600 rounded-lg px-2.5 py-1.5 text-xs font-bold text-center text-slate-900 outline-none transition-all"
                        required
                      />
                    </td>

                    {/* ACTIONS */}
                    <td className="p-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="حذف هذا المقاس"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Table Bottom Actions */}
        <div className="p-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <button
            type="button"
            onClick={addManualRow}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-indigo-50 border border-indigo-200 text-indigo-700 font-black text-xs transition-colors shadow-2xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>إضافة سطر مفرد يدوياً</span>
          </button>

          {productSizes.length > 0 && (
            <button
              type="button"
              onClick={clearAllRows}
              className="text-[11px] text-rose-600 hover:text-rose-800 font-bold px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
            >
              مسح الكل ({productSizes.length})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
