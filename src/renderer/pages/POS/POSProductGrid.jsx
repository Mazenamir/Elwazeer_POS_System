import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Tag, Eye, Layers, AlertCircle, Building2, Plus } from 'lucide-react';

const INITIAL_VISIBLE_COUNT = 48;
const LOAD_MORE_STEP = 48;
const FOLD_CARD_COUNT = 12;
const EAGER_IMAGE_COUNT = 8;

const POSProductCard = React.memo(function POSProductCard({
  product,
  index,
  isAllBranches,
  activeBranchIdStr,
  activeBranchName,
  canRequestBranchStock,
  hasTransferBranches,
  onCardClick,
  onSizeClick,
  onShowAllSizes,
  onOpenLightbox,
  onRequestStock,
}) {
  const currentBranchStock =
    typeof product._branchStock === 'number'
      ? product._branchStock
      : isAllBranches
      ? Number(product.total_stock ?? product.stock_level ?? 0)
      : (() => {
          if (Array.isArray(product.available_branches)) {
            const match = product.available_branches.find((b) => String(b.branch_id) === activeBranchIdStr);
            if (match) return Number(match.stock_level || 0);
            return 0;
          }
          return Number(product.stock_level ?? 0);
        })();

  const isOutOfStock = currentBranchStock <= 0;
  const isLow = !isOutOfStock && currentBranchStock <= (product.min_stock_level ?? 5);
  const availableBranches = Array.isArray(product.available_branches) ? product.available_branches : [];

  const hasMultiSizes = Array.isArray(product.sizes) && product.sizes.length > 1;
  const displaySizes = hasMultiSizes
    ? product._displaySizes ||
      [...product.sizes].sort((a, b) => {
        const aStock = Number(a.stock_level || 0) > 0 ? 1 : 0;
        const bStock = Number(b.stock_level || 0) > 0 ? 1 : 0;
        return bStock - aStock;
      })
    : null;
  const visibleSizes = displaySizes ? displaySizes.slice(0, 4) : null;
  const remainingCount = displaySizes ? displaySizes.length - 4 : 0;

  return (
    <div
      onClick={() => onCardClick(product)}
      className={`${index >= FOLD_CARD_COUNT ? 'pos-product-card-deferred ' : ''}p-3.5 rounded-2xl border transition-all cursor-pointer group flex flex-col justify-between relative ${
        isOutOfStock
          ? 'bg-slate-50/80 border-slate-200 hover:border-rose-300'
          : 'bg-white border-slate-200/80 shadow-sm hover:shadow-md hover:border-indigo-400'
      }`}
    >
      {/* Thumbnail */}
      <div className="aspect-square bg-slate-100 rounded-xl mb-3 overflow-hidden relative flex items-center justify-center">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            loading={index < EAGER_IMAGE_COUNT ? 'eager' : 'lazy'}
            decoding="async"
            className={`w-full h-full object-cover transition-transform group-hover:scale-105 ${
              isOutOfStock ? 'grayscale opacity-70' : ''
            }`}
          />
        ) : (
          <Tag className="w-8 h-8 text-slate-300 group-hover:text-indigo-400 transition-colors" />
        )}
        <span className="absolute bottom-2 right-2 bg-slate-900/85 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-md">
          {product.category || 'ملابس'}
        </span>
        {product.image_url && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenLightbox(product);
            }}
            title="تكبير الصورة"
            className="absolute top-2 left-2 z-10 w-7 h-7 rounded-lg bg-slate-900/85 hover:bg-indigo-600 text-white flex items-center justify-center shadow-sm transition-colors cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
        )}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-slate-900/40 flex items-center justify-center">
            <span className="bg-rose-600 text-white text-[11px] font-black px-2.5 py-1 rounded-lg shadow-md border border-rose-400">
              {isAllBranches ? 'نفد من المخزون' : 'غير متوفر بفرعك'}
            </span>
          </div>
        )}
      </div>

      {/* Title & Attributes */}
      <div>
        <div className="flex items-center justify-between gap-1">
          <h4 className="font-black text-slate-900 text-xs sm:text-sm line-clamp-1 group-hover:text-indigo-600 transition-colors">
            {product.name}
          </h4>
          <span className="text-[10px] font-mono text-slate-400 font-bold shrink-0">
            #{product.id}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[11px] font-bold">
          {product.color && (
            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
              {product.color}
            </span>
          )}
          {hasMultiSizes ? (
            <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-black flex items-center gap-1">
              <Layers className="w-3 h-3 text-indigo-500" />
              {product.sizes.length} مقاسات
            </span>
          ) : Array.isArray(product.sizes) && product.sizes.length === 1 ? (
            <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-black">
              مقاس: {product.sizes[0].size_name}
            </span>
          ) : (
            (product.size_cut || product.size) && (
              <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-black">
                مقاس: {product.size_cut || product.size}
              </span>
            )
          )}
        </div>

        {/* Multi-Sizes Pills Shown Directly on Outside of Card */}
        {hasMultiSizes && visibleSizes && (
          <div className="mt-2 bg-indigo-50/50 rounded-xl p-1.5 border border-indigo-100 flex flex-col gap-1">
            <div className="text-[10px] font-black text-indigo-900 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Layers className="w-3 h-3 text-indigo-600" />
                المقاسات:
              </span>
              {product.sizes.length > 4 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onShowAllSizes(product);
                  }}
                  className="text-[10px] font-extrabold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                >
                  عرض الكل ({product.sizes.length})
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {visibleSizes.map((s) => {
                const hasStock = Number(s.stock_level || 0) > 0;
                return (
                  <span
                    key={`${s.size_name}_${s.color_name || ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSizeClick(product, s);
                    }}
                    className={`text-[10px] font-black px-1.5 py-0.5 rounded-md flex items-center gap-0.5 transition-all ${
                      hasStock
                        ? 'bg-white text-indigo-700 border border-indigo-200 shadow-xs hover:bg-indigo-600 hover:text-white cursor-pointer'
                        : 'bg-slate-100 text-slate-400 border border-slate-200 line-through opacity-60 cursor-not-allowed'
                    }`}
                    title={`مقاس ${s.size_name}: ${hasStock ? `متوفر ${s.stock_level} قطعة (اضغط للإضافة مباشرة)` : 'نفذت الكمية'}`}
                  >
                    <span>{s.size_name}</span>
                    {hasStock && (
                      <span className="text-[9px] font-mono opacity-75">
                        ({s.stock_level})
                      </span>
                    )}
                  </span>
                );
              })}
              {remainingCount > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onShowAllSizes(product);
                  }}
                  className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-indigo-100/80 hover:bg-indigo-200 text-indigo-700 border border-indigo-200 transition-colors cursor-pointer"
                  title="عرض باقي المقاسات"
                >
                  +{remainingCount} أخرى
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Stock & Inter-Branch Request */}
      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold">
        {isOutOfStock ? (
          <span className="text-rose-600 font-black flex items-center gap-1 text-[11px]">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {isAllBranches ? 'غير متوفر (0)' : `غير متوفر بـ ${activeBranchName} (0)`}
          </span>
        ) : (
          <span className={isLow ? 'text-amber-600 font-black' : 'text-emerald-600 font-black'}>
            {isAllBranches ? `المتوفر: ${currentBranchStock}` : `متوفر بـ ${activeBranchName}: ${currentBranchStock}`}
          </span>
        )}
        {hasTransferBranches && canRequestBranchStock && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRequestStock(product);
            }}
            className="text-[10px] font-black text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-lg border border-indigo-100 transition-colors cursor-pointer shrink-0"
            title="طلب بضاعة من الفروع الأخرى"
          >
            طلب من فرع 🚚
          </button>
        )}
      </div>

      {/* Available Branches Outside Pill - توضيح الفروع المتاح بها من برا */}
      {availableBranches.length > 0 ? (
        <div className="mt-2 bg-slate-50/90 rounded-xl p-2 border border-slate-200/80 flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
            <Building2 className="w-3 h-3 text-indigo-600 shrink-0" />
            متاح في:
          </span>
          <div className="flex flex-wrap items-center gap-1">
            {availableBranches.map((b) => {
              const isCurrent = !isAllBranches && String(b.branch_id) === activeBranchIdStr;
              return (
                <span
                  key={b.branch_id}
                  className={`text-[10px] font-black px-1.5 py-0.5 rounded-md flex items-center gap-1 ${
                    isCurrent
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-indigo-50 text-indigo-700 border border-indigo-200/70'
                  }`}
                  title={`فرع ${b.branch_name}: متوفر ${b.stock_level} قطعة`}
                >
                  <span>{b.branch_name}</span>
                  <span className="font-mono bg-white/80 px-1 rounded text-[9px]">
                    ({b.stock_level})
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mt-2 bg-rose-50/60 rounded-xl p-1.5 border border-rose-100 text-[10px] text-rose-600 font-bold flex items-center gap-1">
          <AlertCircle className="w-3 h-3 shrink-0" />
          غير متاح في أي فرع
        </div>
      )}

      {/* Price & Add Button */}
      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
        <span className="text-sm font-black text-indigo-600">
          {Number(product.price || 0).toLocaleString()} ج.م
        </span>
        <button
          type="button"
          disabled={isOutOfStock}
          onClick={(e) => {
            e.stopPropagation();
            onCardClick(product);
          }}
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all shadow-sm ${
            isOutOfStock
              ? 'bg-slate-100 text-slate-300 border border-slate-200 cursor-not-allowed'
              : 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white cursor-pointer'
          }`}
          title={isOutOfStock ? 'الصنف غير متوفر بالمخزون ولا يمكن ضربه بالفاتورة' : 'إضافة للفاتورة'}
        >
          <Plus className={`w-4 h-4 ${isOutOfStock ? 'opacity-40' : ''}`} />
        </button>
      </div>
    </div>
  );
});

const POSProductGrid = React.memo(function POSProductGrid({
  loadingInventory,
  filteredProducts,
  resetKey,
  isAllBranches,
  activeBranchIdStr,
  activeBranchName,
  canRequestBranchStock,
  hasTransferBranches,
  onCardClick,
  onSizeClick,
  onShowAllSizes,
  onOpenLightbox,
  onRequestStock,
}) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  const scrollContainerRef = useRef(null);
  const sentinelRef = useRef(null);
  const prevResetKeyRef = useRef(resetKey);

  useEffect(() => {
    if (prevResetKeyRef.current !== resetKey) {
      prevResetKeyRef.current = resetKey;
      setVisibleCount(INITIAL_VISIBLE_COUNT);
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
      }
    }
  }, [resetKey]);

  const totalCount = filteredProducts.length;
  const hasMore = visibleCount < totalCount;
  const visibleProducts = useMemo(
    () => (hasMore ? filteredProducts.slice(0, visibleCount) : filteredProducts),
    [filteredProducts, visibleCount, hasMore]
  );

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(totalCount, prev + LOAD_MORE_STEP));
  }, [totalCount]);

  useEffect(() => {
    if (!hasMore) return;
    const rootEl = scrollContainerRef.current;
    const sentinelEl = sentinelRef.current;
    if (!rootEl || !sentinelEl || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((prev) => (prev < totalCount ? Math.min(totalCount, prev + LOAD_MORE_STEP) : prev));
        }
      },
      { root: rootEl, rootMargin: '300px' }
    );

    observer.observe(sentinelEl);
    return () => observer.disconnect();
  }, [hasMore, visibleCount, totalCount, resetKey]);

  const remainingCount = Math.max(0, totalCount - visibleCount);

  return (
    <div
      ref={scrollContainerRef}
      className="min-h-[500px] max-h-[calc(100vh-270px)] overflow-y-auto pr-1 pos-catalog-scroll"
    >
      {loadingInventory ? (
        <div className="py-24 text-center text-slate-400 font-bold text-sm">
          جاري تحميل المنتجات...
        </div>
      ) : totalCount === 0 ? (
        <div className="py-24 text-center text-slate-400 font-bold text-sm bg-white rounded-3xl border border-dashed border-slate-300">
          لا توجد منتجات مطابقة للبحث
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5">
            {visibleProducts.map((product, index) => (
              <POSProductCard
                key={product.id}
                product={product}
                index={index}
                isAllBranches={isAllBranches}
                activeBranchIdStr={activeBranchIdStr}
                activeBranchName={activeBranchName}
                canRequestBranchStock={canRequestBranchStock}
                hasTransferBranches={hasTransferBranches}
                onCardClick={onCardClick}
                onSizeClick={onSizeClick}
                onShowAllSizes={onShowAllSizes}
                onOpenLightbox={onOpenLightbox}
                onRequestStock={onRequestStock}
              />
            ))}
          </div>

          {hasMore && (
            <div ref={sentinelRef} className="py-4 flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                className="px-4 py-2 rounded-xl bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-black shadow-xs transition-colors cursor-pointer"
              >
                عرض المزيد (المتبقي {remainingCount} منتج)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
});

export default POSProductGrid;
