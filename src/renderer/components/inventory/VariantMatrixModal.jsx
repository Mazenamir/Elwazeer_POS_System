import React, { useMemo, useState, useEffect } from 'react';
import Modal from '../modals/Modal';
import Button from '../ui/Button';
import { Barcode, Edit2, Search, Package, Palette, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { buildProductVariantSummary } from './variantDisplay.utils';

export default function VariantMatrixModal({
  isOpen,
  product,
  initialColor = '',
  onClose,
  onEditProduct,
  onPrintBarcode,
  canEdit = false,
}) {
  const [stockFilter, setStockFilter] = useState('all'); // 'all' | 'in_stock' | 'out_of_stock'
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isOpen) {
      setStockFilter('all');
      setSearchTerm(initialColor || '');
    }
  }, [isOpen, product?.id, initialColor]);

  const summary = useMemo(() => buildProductVariantSummary(product), [product]);

  const { filteredGroups, visibleSizes } = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    // Determine whether query matches specific sizes or colors
    const matchingSizeSet = new Set(
      q ? summary.orderedSizes.filter((sz) => sz.toLowerCase().includes(q)) : summary.orderedSizes
    );

    let groups = summary.colorGroups.filter((group) => {
      if (stockFilter === 'in_stock' && group.inStockCount === 0) return false;
      if (stockFilter === 'out_of_stock' && group.zeroCount === 0) return false;
      if (!q) return true;
      const colorMatches = group.color.toLowerCase().includes(q);
      const hasMatchingSize = group.sizes.some((s) => matchingSizeSet.has(s.size_name));
      return colorMatches || hasMatchingSize;
    });

    const sizes = summary.orderedSizes.filter((sizeName) => {
      // If user typed a size name (and not just a color name), narrow columns too
      if (q && matchingSizeSet.size > 0) {
        const anyColorMatched = summary.colorGroups.some((g) => g.color.toLowerCase().includes(q));
        if (!anyColorMatched && !matchingSizeSet.has(sizeName)) return false;
      }

      if (stockFilter === 'in_stock') {
        return groups.some((g) => (g.sizeMap.get(sizeName)?.stock_level ?? 0) > 0);
      }
      if (stockFilter === 'out_of_stock') {
        return groups.some((g) => {
          const entry = g.sizeMap.get(sizeName);
          return entry && entry.stock_level === 0;
        });
      }
      return true;
    });

    return { filteredGroups: groups, visibleSizes: sizes };
  }, [summary, stockFilter, searchTerm]);

  if (!product) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`مصفوفة الألوان والمقاسات — ${product.name}`}
      subtitle={`كود: #${product.id}${product.barcode ? ` · باركود: ${product.barcode}` : ''}${product.category ? ` · ${product.category}` : ''}`}
      maxWidth="max-w-5xl"
      bodyClassName="p-4 sm:p-6"
    >
      <div className="space-y-4">
        {/* Top Summary KPIs + Quick Actions */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1">
            <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#FAF6ED] border border-[#E6DECD]">
              <div className="w-8 h-8 rounded-lg bg-[#24221F] text-white flex items-center justify-center shrink-0">
                <Package className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-[#777266]">إجمالي الرصيد</div>
                <div className="text-base font-black text-[#24221F] tabular-nums">{summary.totalStock}</div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-100">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
                <Palette className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-indigo-700">الألوان</div>
                <div className="text-base font-black text-indigo-950 tabular-nums">{summary.totalColors}</div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-100">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-emerald-700">مقاسات متوفرة</div>
                <div className="text-base font-black text-emerald-950 tabular-nums">{summary.inStockVariants}</div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-rose-50/60 border border-rose-100">
              <div className="w-8 h-8 rounded-lg bg-rose-500 text-white flex items-center justify-center shrink-0">
                <AlertCircle className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-rose-700">نواقص (0)</div>
                <div className="text-base font-black text-rose-950 tabular-nums">{summary.zeroVariants}</div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onPrintBarcode && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={Barcode}
                onClick={() => {
                  onClose();
                  onPrintBarcode(product);
                }}
              >
                طباعة الباركود
              </Button>
            )}
            {canEdit && onEditProduct && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                icon={Edit2}
                onClick={() => {
                  onClose();
                  onEditProduct(product);
                }}
              >
                تعديل المنتج
              </Button>
            )}
          </div>
        </div>

        {/* Filter Bar & Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
          <div className="inline-flex items-center bg-white p-1 rounded-lg border border-slate-200 gap-1">
            {[
              { id: 'all', label: `الكل (${summary.totalVariants})` },
              { id: 'in_stock', label: `المتوفر فقط (${summary.inStockVariants})` },
              { id: 'out_of_stock', label: `النواقص 0 (${summary.zeroVariants})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStockFilter(tab.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-black transition-all cursor-pointer ${
                  stockFilter === tab.id
                    ? 'bg-[#151515] text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث باللون أو المقاس..."
              className="w-full pr-9 pl-8 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-lg outline-none focus:border-indigo-500 text-slate-800"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Matrix Table */}
        {filteredGroups.length === 0 || visibleSizes.length === 0 ? (
          <div className="py-12 text-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 space-y-1">
            <p className="text-sm font-black text-slate-700">لا توجد مقاسات مطابقة للفلتر المحدد</p>
            <p className="text-xs text-slate-500">جرّب التبديل إلى "الكل" أو مسح كلمة البحث.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-[#E6DECD] overflow-hidden bg-white shadow-2xs">
            <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 z-20 bg-[#FAF6ED] border-b border-[#E6DECD]">
                  <tr>
                    <th className="sticky right-0 z-30 bg-[#FAF6ED] py-2.5 px-3 text-right font-black text-[#24221F] border-l border-[#E6DECD] min-w-[140px]">
                      اللون / الإجمالي
                    </th>
                    {visibleSizes.map((sizeName) => (
                      <th
                        key={sizeName}
                        className="py-2.5 px-2 text-center font-black text-[#24221F] min-w-[52px] whitespace-nowrap"
                      >
                        {sizeName}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E6DECD]/60">
                  {filteredGroups.map((group) => (
                    <tr key={group.color} className="hover:bg-[#FAF6ED]/50 transition-colors">
                      <td className="sticky right-0 z-10 bg-white py-2.5 px-3 border-l border-[#E6DECD] whitespace-nowrap">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-3 h-3 rounded-full shrink-0 border shadow-2xs"
                              style={{ backgroundColor: group.swatch.hex, borderColor: group.swatch.border }}
                            />
                            <span className="font-black text-[#24221F] truncate max-w-[95px]">
                              {group.color}
                            </span>
                          </div>
                          <span
                            className={`px-1.5 py-0.5 rounded-md text-[10px] font-black tabular-nums ${
                              group.totalStock > 0
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-400'
                            }`}
                          >
                            {group.totalStock}
                          </span>
                        </div>
                      </td>

                      {visibleSizes.map((sizeName) => {
                        const cell = group.sizeMap.get(sizeName);
                        if (!cell) {
                          return (
                            <td key={sizeName} className="py-2 px-1.5 text-center text-slate-300 select-none">
                              —
                            </td>
                          );
                        }
                        const qty = cell.stock_level;
                        return (
                          <td
                            key={sizeName}
                            className="py-2 px-1.5 text-center"
                            title={`اللون: ${group.color} | المقاس: ${sizeName} | الرصيد: ${qty}${cell.barcode ? ` | باركود: ${cell.barcode}` : ''}`}
                          >
                            <span
                              className={`inline-flex items-center justify-center min-w-[34px] px-1.5 py-1 rounded-lg font-black tabular-nums border ${
                                qty > 2
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : qty > 0
                                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                                  : 'bg-rose-50/40 text-rose-400 border-rose-100 font-bold'
                              }`}
                            >
                              {qty}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Color Legend */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 font-bold pt-1">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300 inline-block" />
              متوفر (&gt; 2)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300 inline-block" />
              كمية محدودة (1–2)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-rose-50 border border-rose-200 inline-block" />
              نفذ (0)
            </span>
          </div>
          <span>مرّر المؤشر فوق أي خلية لعرض باركود المقاس</span>
        </div>
      </div>
    </Modal>
  );
}
