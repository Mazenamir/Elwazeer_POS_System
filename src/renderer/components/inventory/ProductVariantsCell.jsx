import React, { useMemo } from 'react';
import { Grid3X3 } from 'lucide-react';
import { buildProductVariantSummary, getColorSwatch } from './variantDisplay.utils';

const INLINE_VARIANT_THRESHOLD = 6;
const MAX_VISIBLE_COLORS = 4;

export default function ProductVariantsCell({ product, onOpenMatrix }) {
  const summary = useMemo(() => buildProductVariantSummary(product), [product]);

  // Legacy products with no structured sizes array
  if (!Array.isArray(product?.sizes) || product.sizes.length === 0) {
    const fallbackSwatch = product?.color ? getColorSwatch(product.color) : null;
    return (
      <div className="flex flex-wrap items-center gap-1.5 max-w-xs">
        {product?.color && (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-[#FAF6ED] text-[#24221F] text-xs font-bold border border-[#E6DECD]">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0 border"
              style={{ backgroundColor: fallbackSwatch.hex, borderColor: fallbackSwatch.border }}
            />
            {product.color}
          </span>
        )}
        {(product?.size_cut || product?.size) && (
          <span className="text-xs text-[#777266] font-bold">
            {product.size_cut || product.size}
          </span>
        )}
        {!product?.color && !product?.size_cut && !product?.size && (
          <span className="text-xs text-slate-400">—</span>
        )}
      </div>
    );
  }

  // Compact product (<= 6 total variants): show directly inline in a tidy layout
  if (summary.totalVariants <= INLINE_VARIANT_THRESHOLD) {
    return (
      <div className="flex flex-col gap-1.5 max-w-sm">
        {summary.colorGroups.map((group) => (
          <div key={group.color} className="flex flex-wrap items-center gap-1">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 text-[11px] font-black border border-slate-200 shrink-0">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0 border"
                style={{ backgroundColor: group.swatch.hex, borderColor: group.swatch.border }}
              />
              {group.color}
            </span>
            {group.sizes.map((s) => {
              const qty = s.stock_level;
              return (
                <span
                  key={`${group.color}-${s.size_name}`}
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-bold border ${
                    qty > 2
                      ? 'bg-emerald-50/80 text-emerald-900 border-emerald-200'
                      : qty > 0
                      ? 'bg-amber-50 text-amber-900 border-amber-200'
                      : 'bg-slate-50 text-slate-400 border-slate-200/80'
                  }`}
                  title={`اللون: ${group.color} | المقاس: ${s.size_name} | الرصيد: ${qty}`}
                >
                  <span className="font-extrabold">{s.size_name}</span>
                  <span
                    className={`px-1 rounded text-[10px] font-black ${
                      qty > 2
                        ? 'bg-emerald-100 text-emerald-800'
                        : qty > 0
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-200/70 text-slate-500'
                    }`}
                  >
                    {qty}
                  </span>
                </span>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  // Multi-variant product (> 6 variants): compact color pills + click to open full Matrix Modal
  const visibleColors = summary.colorGroups.slice(0, MAX_VISIBLE_COLORS);
  const remainingColors = summary.colorGroups.length - visibleColors.length;

  return (
    <div className="flex flex-col gap-1.5 max-w-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        {visibleColors.map((group) => {
          const hasStock = group.totalStock > 0;
          return (
            <button
              key={group.color}
              type="button"
              onClick={() => onOpenMatrix?.(product, group.color)}
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-black border transition-all cursor-pointer ${
                hasStock
                  ? 'bg-[#FFFDF9] text-[#24221F] border-[#E6DECD] hover:border-indigo-400 hover:bg-indigo-50/40 shadow-2xs'
                  : 'bg-slate-50/90 text-slate-400 border-slate-200/90 hover:border-slate-300 hover:text-slate-600'
              }`}
              title={`${group.color}: ${group.totalStock} قطعة (${group.inStockCount} مقاس متوفر / ${group.zeroCount} نفذ)`}
            >
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 border ${hasStock ? '' : 'opacity-50'}`}
                style={{ backgroundColor: group.swatch.hex, borderColor: group.swatch.border }}
              />
              <span className="truncate max-w-[78px]">{group.color}</span>
              <span
                className={`px-1.5 py-0.2 rounded-md text-[10px] font-black tabular-nums ${
                  hasStock
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-rose-50 text-rose-500 border border-rose-100'
                }`}
              >
                {group.totalStock}
              </span>
            </button>
          );
        })}

        {remainingColors > 0 && (
          <button
            type="button"
            onClick={() => onOpenMatrix?.(product)}
            className="inline-flex items-center px-2 py-1 rounded-lg text-[11px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors cursor-pointer"
          >
            +{remainingColors} ألوان
          </button>
        )}
      </div>

      {/* Compact single-line footer trigger */}
      <div className="flex items-center gap-2 text-[11px]">
        <button
          type="button"
          onClick={() => onOpenMatrix?.(product)}
          className="inline-flex items-center gap-1 font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
        >
          <Grid3X3 className="w-3.5 h-3.5" />
          <span>عرض المصفوفة</span>
        </button>
        <span className="text-slate-300">•</span>
        <span className="text-emerald-700 font-bold tabular-nums">{summary.inStockVariants} متوفر</span>
        {summary.zeroVariants > 0 && (
          <>
            <span className="text-slate-300">•</span>
            <span className="text-rose-500 font-semibold tabular-nums">{summary.zeroVariants} نفذ</span>
          </>
        )}
      </div>
    </div>
  );
}
