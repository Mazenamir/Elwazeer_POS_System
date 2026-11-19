import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Truck,
  Building2,
  AlertTriangle,
  Flame,
  CheckCircle2,
  Package,
  Loader2,
  Plus,
  Minus,
  Palette,
} from 'lucide-react';
import api from '../../services/api/client';
import { useToast } from '../../context/ToastContext';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

const makeVariantKey = (sz, fallbackInvId) =>
  `${Number(sz.inventory_id || fallbackInvId || 0)}::${String(sz.size_name || '').trim()}::${String(sz.color_name || '').trim()}`;

/**
 * Smart Inter-Branch Stock Request Modal
 * Shows real-time branch, color & size availability, auto-selects the best source branch,
 * reveals a dedicated Colors + Sizes + Quantities breakdown panel immediately when any branch
 * is clicked, warns about duplicate pending requests, supports multi-size/color quantities,
 * and works identically on Master PostgreSQL & Branch SQLite.
 */
export function SmartStockRequestModal({
  isOpen,
  onClose,
  product,
  preselectedSize = null,
  activeBranchId = 'all',
  branches = [],
  onSuccess,
}) {
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [availability, setAvailability] = useState(null);
  const [targetBranchId, setTargetBranchId] = useState('');
  const [sourceBranchId, setSourceBranchId] = useState('');
  const [selectedColorFilter, setSelectedColorFilter] = useState('ALL');
  const [sizeQuantities, setSizeQuantities] = useState({});
  const [plainQuantity, setPlainQuantity] = useState('1');
  const [priority, setPriority] = useState('normal'); // 'normal' | 'urgent'
  const [notes, setNotes] = useState('');
  const pendingClickedSizeRef = useRef(null);

  const isAllBranchesMode = !activeBranchId || activeBranchId === 'all';

  // Determine initial target receiving branch when modal opens
  useEffect(() => {
    if (!isOpen || !product) return;

    if (!isAllBranchesMode) {
      setTargetBranchId(String(activeBranchId));
    } else if (branches.length > 0) {
      const nonMain = branches.find((b) => !b.is_main_warehouse);
      setTargetBranchId(String((nonMain || branches[0]).id));
    }

    setPriority('normal');
    setNotes(preselectedSize?.size_name ? `طلب مقاس ${preselectedSize.size_name}` : '');
    setPlainQuantity('1');
    setSizeQuantities({});
    setSelectedColorFilter(preselectedSize?.color_name ? String(preselectedSize.color_name).trim() : 'ALL');
    setSourceBranchId('');
  }, [isOpen, product, activeBranchId, isAllBranchesMode, branches, preselectedSize]);

  // Fetch real-time branch, color & size availability + pending transfers
  useEffect(() => {
    if (!isOpen || !product?.id) return;
    let cancelled = false;
    setLoading(true);
    api.get(`/inventory/${product.id}/branch-availability`)
      .then((res) => {
        if (!cancelled) setAvailability(res?.data || res || null);
      })
      .catch(() => {
        if (!cancelled) setAvailability(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, product?.id]);

  // Candidate source branches (exclude receiving targetBranchId), sorted by availability
  const sourceBranches = useMemo(() => {
    const rawBranches = availability?.branches || [];
    const targetNum = Number(targetBranchId);
    const others = rawBranches.filter((b) => Number(b.branch_id) !== targetNum);

    const reqSizeName = preselectedSize?.size_name
      ? String(preselectedSize.size_name).trim().toLowerCase()
      : null;
    const reqColorName = preselectedSize?.color_name
      ? String(preselectedSize.color_name).trim().toLowerCase()
      : null;

    const enriched = others.map((b) => {
      let matchingSizeStock = null;
      if (reqSizeName) {
        const match = (b.sizes || []).filter(
          (sz) =>
            String(sz.size_name || '').trim().toLowerCase() === reqSizeName &&
            (!reqColorName || String(sz.color_name || '').trim().toLowerCase() === reqColorName)
        );
        matchingSizeStock = match.reduce((sum, m) => sum + Number(m.stock_level || 0), 0);
      }
      return {
        ...b,
        matchingSizeStock,
      };
    });

    enriched.sort((a, b) => {
      if (reqSizeName) {
        if ((b.matchingSizeStock || 0) !== (a.matchingSizeStock || 0)) {
          return (b.matchingSizeStock || 0) - (a.matchingSizeStock || 0);
        }
      }
      if (Number(b.stock_level || 0) !== Number(a.stock_level || 0)) {
        return Number(b.stock_level || 0) - Number(a.stock_level || 0);
      }
      if (a.is_main_warehouse !== b.is_main_warehouse) {
        return a.is_main_warehouse ? -1 : 1;
      }
      return Number(a.branch_id) - Number(b.branch_id);
    });

    return enriched;
  }, [availability, targetBranchId, preselectedSize]);

  // Auto-select best available source branch when availability or targetBranch changes
  useEffect(() => {
    if (!isOpen || sourceBranches.length === 0) return;

    const reqSizeName = preselectedSize?.size_name ? String(preselectedSize.size_name).trim().toLowerCase() : null;
    const currentValid = sourceBranches.find((b) => {
      if (String(b.branch_id) !== String(sourceBranchId)) return false;
      return reqSizeName ? (b.matchingSizeStock || 0) > 0 : Number(b.stock_level || 0) > 0;
    });
    if (currentValid) return;

    const best = sourceBranches.find((b) =>
      reqSizeName ? (b.matchingSizeStock || 0) > 0 : Number(b.stock_level || 0) > 0
    ) || sourceBranches.find((b) => Number(b.stock_level || 0) > 0);

    setSourceBranchId(best ? String(best.branch_id) : '');
  }, [isOpen, sourceBranches, sourceBranchId, preselectedSize]);

  const selectedSourceBranch = useMemo(
    () => sourceBranches.find((b) => String(b.branch_id) === String(sourceBranchId)) || null,
    [sourceBranches, sourceBranchId]
  );

  const availableSizesInSource = useMemo(() => {
    if (!selectedSourceBranch) return [];
    const raw = (selectedSourceBranch.sizes || []).filter((sz) => Number(sz.stock_level || 0) > 0);
    if (raw.length > 0) {
      return [...raw].sort((a, b) =>
        String(a.size_name || '').localeCompare(String(b.size_name || ''), 'en', { numeric: true })
      );
    }
    if (Number(selectedSourceBranch.stock_level || 0) > 0) {
      return [
        {
          inventory_id: product?.id,
          size_name: product?.size_cut || 'موحد',
          color_name: product?.color || '',
          stock_level: Number(selectedSourceBranch.stock_level || 0),
          barcode: product?.barcode || null,
        },
      ];
    }
    return [];
  }, [selectedSourceBranch, product]);

  const { availableSourceBranches, unavailableSourceBranches } = useMemo(() => {
    const availList = [];
    const unavailList = [];
    for (const b of sourceBranches) {
      const hasTargetSize = preselectedSize?.size_name ? (b.matchingSizeStock || 0) > 0 : true;
      const isAvail = Number(b.stock_level || 0) > 0 && hasTargetSize;
      if (isAvail) availList.push(b);
      else unavailList.push(b);
    }
    return { availableSourceBranches: availList, unavailableSourceBranches: unavailList };
  }, [sourceBranches, preselectedSize]);

  // Distinct colors in the clicked source branch with total qty per color
  const colorsInSelectedBranch = useMemo(() => {
    const colorMap = new Map();
    for (const sz of availableSizesInSource) {
      const cName = String(sz.color_name || '').trim() || 'بدون لون';
      colorMap.set(cName, (colorMap.get(cName) || 0) + Number(sz.stock_level || 0));
    }
    return Array.from(colorMap.entries()).map(([color_name, stock_level]) => ({
      color_name,
      stock_level,
    }));
  }, [availableSizesInSource]);

  const filteredSizesInSource = useMemo(() => {
    if (selectedColorFilter === 'ALL') return availableSizesInSource;
    return availableSizesInSource.filter((sz) => {
      const cName = String(sz.color_name || '').trim() || 'بدون لون';
      return cName === selectedColorFilter;
    });
  }, [availableSizesInSource, selectedColorFilter]);

  // Initialize or reset size quantities & valid color filter when selected source branch changes
  useEffect(() => {
    if (!selectedSourceBranch) {
      setSizeQuantities({});
      setSelectedColorFilter('ALL');
      return;
    }

    const avail = (selectedSourceBranch.sizes || []).filter((sz) => Number(sz.stock_level || 0) > 0);
    const validColors = new Set(avail.map((sz) => String(sz.color_name || '').trim() || 'بدون لون'));
    if (selectedColorFilter !== 'ALL' && !validColors.has(selectedColorFilter)) {
      setSelectedColorFilter('ALL');
    }

    if (avail.length === 0) {
      setSizeQuantities({});
      setPlainQuantity('1');
      return;
    }

    const nextMap = {};
    if (pendingClickedSizeRef.current) {
      const clickedKey = pendingClickedSizeRef.current;
      pendingClickedSizeRef.current = null;
      nextMap[clickedKey] = 1;
    } else if (preselectedSize?.size_name) {
      const targetKeyLower = `${String(preselectedSize.size_name).trim()}::${String(preselectedSize.color_name || '').trim()}`.toLowerCase();
      const exactMatch =
        avail.find(
          (sz) => `${String(sz.size_name || '').trim()}::${String(sz.color_name || '').trim()}`.toLowerCase() === targetKeyLower
        ) ||
        avail.find(
          (sz) => String(sz.size_name || '').trim().toLowerCase() === String(preselectedSize.size_name).trim().toLowerCase()
        );
      if (exactMatch) {
        nextMap[makeVariantKey(exactMatch, product?.id)] = 1;
      }
    }
    setSizeQuantities(nextMap);
  }, [selectedSourceBranch, preselectedSize, product?.id]);

  // Pending duplicate requests for same product & receiving branch
  const pendingForTarget = useMemo(() => {
    const list = availability?.pending_requests || [];
    const tId = Number(targetBranchId);
    return list.filter((r) => Number(r.to_branch_id) === tId);
  }, [availability, targetBranchId]);

  const targetBranchStock = useMemo(() => {
    const b = (availability?.branches || []).find((br) => Number(br.branch_id) === Number(targetBranchId));
    return b ? Number(b.stock_level || 0) : Number(product?.stock_level ?? 0);
  }, [availability, targetBranchId, product]);

  const hasSizesMode = availableSizesInSource.length > 0;

  const selectedSizesArray = useMemo(() => {
    if (!hasSizesMode) return [];
    return availableSizesInSource
      .map((sz) => {
        const key = makeVariantKey(sz, product?.id);
        const qty = Number(sizeQuantities[key] || 0);
        return qty > 0
          ? {
              inventory_id: Number(sz.inventory_id || product?.id),
              size_name: sz.size_name,
              color_name: sz.color_name || '',
              quantity: qty,
            }
          : null;
      })
      .filter(Boolean);
  }, [hasSizesMode, availableSizesInSource, sizeQuantities, product?.id]);

  const totalRequestedQty = useMemo(() => {
    if (hasSizesMode) {
      return selectedSizesArray.reduce((sum, s) => sum + Number(s.quantity || 0), 0);
    }
    return Math.max(0, Number(plainQuantity || 0));
  }, [hasSizesMode, selectedSizesArray, plainQuantity]);

  const anyOtherBranchHasStock = useMemo(() => {
    if (preselectedSize?.size_name) {
      return sourceBranches.some((b) => (b.matchingSizeStock || 0) > 0);
    }
    return sourceBranches.some((b) => Number(b.stock_level || 0) > 0);
  }, [sourceBranches, preselectedSize]);

  const setSizeQty = (sz, nextVal) => {
    const key = makeVariantKey(sz, product?.id);
    const maxAvail = Number(sz.stock_level || 0);
    const clamped = Math.max(0, Math.min(maxAvail, Number(nextVal || 0)));
    setSizeQuantities((prev) => ({ ...prev, [key]: clamped }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!product?.id || !sourceBranchId || !targetBranchId) return;
    if (totalRequestedQty <= 0) {
      toast.warning(hasSizesMode ? 'يرجى تحديد مقاس ولون واحد على الأقل وكميته' : 'يرجى إدخال كمية صالحة');
      return;
    }

    try {
      setSubmitting(true);
      if (hasSizesMode && selectedSizesArray.length > 0) {
        // Group selected sizes by exact inventory_id (supports both single-product & sibling variant records)
        const byInvId = new Map();
        for (const item of selectedSizesArray) {
          const iId = Number(item.inventory_id || product.id);
          if (!byInvId.has(iId)) byInvId.set(iId, []);
          byInvId.get(iId).push({
            size_name: item.size_name,
            color_name: item.color_name || '',
            quantity: item.quantity,
          });
        }

        for (const [invId, variantSizes] of byInvId.entries()) {
          const variantTotal = variantSizes.reduce((s, x) => s + Number(x.quantity || 0), 0);
          await api.post('/inventory/transfer', {
            inventory_id: invId,
            from_branch_id: Number(sourceBranchId),
            to_branch_id: Number(targetBranchId),
            quantity: variantTotal,
            sizes: variantSizes,
            priority,
            notes: notes.trim() || undefined,
            is_request: true,
          });
        }
      } else {
        await api.post('/inventory/transfer', {
          inventory_id: product.id,
          from_branch_id: Number(sourceBranchId),
          to_branch_id: Number(targetBranchId),
          quantity: totalRequestedQty,
          priority,
          notes: notes.trim() || undefined,
          is_request: true,
        });
      }

      toast.success(
        priority === 'urgent'
          ? 'تم إرسال طلب التحويل العاجل بنجاح! 🔥🚚'
          : 'تم إرسال طلب نقل البضاعة بنجاح! 🚚'
      );
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.message || 'فشل إرسال طلب نقل البضاعة');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !product) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="طلب بضاعة ذكي من الفروع 🚚"
      subtitle={`طلب تحويل للصنف: ${product.name}`}
      maxWidth="max-w-3xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Product & Target Branch Summary */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-black text-slate-900 flex items-center gap-2">
              <Package className="w-4 h-4 text-indigo-600 shrink-0" />
              <span className="truncate">{product.name}</span>
              {preselectedSize?.size_name && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-indigo-100 text-indigo-800 border border-indigo-200">
                  مقاس مطلوب: {preselectedSize.size_name}
                </span>
              )}
            </div>
            <div className="text-[11px] font-bold text-slate-500 mt-1 flex items-center gap-2">
              <span>المتوفر بالفرع المستلم:</span>
              <span className={`font-mono font-black ${targetBranchStock <= 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                {targetBranchStock} قطعة
              </span>
              {product.barcode && (
                <span className="font-mono text-slate-400" dir="ltr">#{product.barcode}</span>
              )}
            </div>
          </div>

          {isAllBranchesMode && branches.length > 1 && (
            <div className="min-w-[180px]">
              <label className="block text-[10px] font-black text-slate-500 mb-1">الفرع المستلم *</label>
              <select
                value={targetBranchId}
                onChange={(e) => {
                  setTargetBranchId(e.target.value);
                  setSourceBranchId('');
                }}
                className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600"
              >
                {branches.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Duplicate Pending Request Warning */}
        {pendingForTarget.length > 0 && (
          <div className="p-3 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-black">
                تنبيه: يوجد {pendingForTarget.length} طلب تحويل معلّق حالياً لنفس الصنف لهذا الفرع:
              </div>
              {pendingForTarget.slice(0, 2).map((pr) => (
                <div key={pr.id} className="text-[11px] text-amber-800">
                  • طلب #{pr.id} من <strong>{pr.from_branch_name}</strong> ({pr.quantity} قطعة —{' '}
                  {pr.status === 'pending' ? 'في الطريق' : 'بانتظار الموافقة'})
                </div>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-10 flex flex-col items-center justify-center text-slate-400 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
            <span className="text-xs font-bold">جاري فحص أرصدة وألوان ومقاسات الفروع لحظياً...</span>
          </div>
        ) : !anyOtherBranchHasStock ? (
          <div className="p-5 rounded-2xl bg-rose-50 border border-rose-200 text-center space-y-1.5">
            <div className="text-sm font-black text-rose-800">
              {preselectedSize?.size_name
                ? `المقاس "${preselectedSize.size_name}" غير متوفر حالياً في أي فرع آخر`
                : 'هذا الصنف غير متوفر حالياً في أي فرع آخر'}
            </div>
            <div className="text-[11px] font-bold text-rose-600">
              جميع الفروع الأخرى رصيدها 0 لهذا {preselectedSize?.size_name ? 'المقاس' : 'الصنف'}، لا يمكن إرسال طلب تحويل.
            </div>
          </div>
        ) : (
          <>
            {/* 1. Source Branch Cards (only branches with stock are shown prominently) */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-700 flex items-center justify-between">
                <span>1. اضغط على الفرع المصدر المتاح ({availableSourceBranches.length}) لعرض ألوانه ومقاساته *</span>
                <span className="text-[10px] font-bold text-indigo-600">مرتّبة من الأعلى توفراً ✨</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {availableSourceBranches.map((b) => {
                  const isSelected = String(b.branch_id) === String(sourceBranchId);
                  const branchColors = (b.available_colors || []).filter((c) => c.stock_level > 0);

                  return (
                    <button
                      key={b.branch_id}
                      type="button"
                      onClick={() => setSourceBranchId(String(b.branch_id))}
                      className={`p-3 rounded-2xl border-2 text-right transition-all flex flex-col gap-1.5 cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50 border-indigo-600 shadow-sm ring-2 ring-indigo-200'
                          : 'bg-white border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 w-full">
                        <div className="min-w-0">
                          <div className="text-xs font-black text-slate-900 flex items-center gap-1.5 truncate">
                            <Building2 className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-indigo-600' : 'text-slate-400'}`} />
                            <span className="truncate">{b.branch_name}</span>
                            {b.is_main_warehouse && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-white font-bold shrink-0">
                                رئيسي
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-bold text-slate-500 mt-1">
                            المتاح: <strong className="font-mono text-emerald-700">{b.stock_level}</strong> قطعة
                          </div>
                        </div>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />}
                      </div>

                      {branchColors.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-200/70 w-full">
                          {branchColors.slice(0, 3).map((c) => (
                            <span
                              key={c.color_name}
                              className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700"
                            >
                              {c.color_name}: <span className="font-mono">{c.stock_level}</span>
                            </span>
                          ))}
                          {branchColors.length > 3 && (
                            <span className="text-[9px] font-bold text-indigo-600">
                              +{branchColors.length - 3} ألوان
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {unavailableSourceBranches.length > 0 && (
                <div className="text-[10px] font-bold text-slate-400 px-1 truncate">
                  فروع غير متوفر بها ({unavailableSourceBranches.length}):{' '}
                  {unavailableSourceBranches.map((b) => b.branch_name).join('، ')}
                </div>
              )}
            </div>

            {/* 2. Dedicated Selected Branch Details Panel (Colors + Sizes + Available Quantities) ABOVE Quantity & Priority */}
            {selectedSourceBranch && (
              <div className="p-4 rounded-2xl bg-indigo-50/40 border-2 border-indigo-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-black text-indigo-950 flex items-center gap-1.5">
                    <Palette className="w-4 h-4 text-indigo-600" />
                    <span>2. الألوان والمقاسات المتوفرة في: {selectedSourceBranch.branch_name}</span>
                  </div>
                  <div className="text-[11px] font-black text-indigo-700">
                    الكمية المحددة للطلب: <span className="font-mono text-sm">{totalRequestedQty}</span> قطعة
                  </div>
                </div>

                {/* Color Tabs inside Selected Branch */}
                {colorsInSelectedBranch.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-bold text-slate-600">الألوان المتاحة في هذا الفرع:</div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedColorFilter('ALL')}
                        className={`px-2.5 py-1 rounded-xl text-[11px] font-black border transition-all ${
                          selectedColorFilter === 'ALL'
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-400'
                        }`}
                      >
                        كل الألوان ({selectedSourceBranch.stock_level})
                      </button>
                      {colorsInSelectedBranch.map((c) => (
                        <button
                          key={c.color_name}
                          type="button"
                          onClick={() => setSelectedColorFilter(c.color_name)}
                          className={`px-2.5 py-1 rounded-xl text-[11px] font-black border transition-all ${
                            selectedColorFilter === c.color_name
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-400'
                          }`}
                        >
                          {c.color_name} (<span className="font-mono">{c.stock_level}</span>)
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sizes & Quantities Grid for Selected Branch / Color */}
                {filteredSizesInSource.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1 bg-white/80 rounded-xl border border-indigo-100">
                    {filteredSizesInSource.map((sz) => {
                      const key = makeVariantKey(sz, product?.id);
                      const curVal = Number(sizeQuantities[key] || 0);
                      const maxVal = Number(sz.stock_level || 0);
                      return (
                        <div
                          key={key}
                          className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-colors ${
                            curVal > 0 ? 'bg-indigo-50/70 border-indigo-500 shadow-xs' : 'bg-white border-slate-200'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-black text-slate-900 flex items-center gap-1.5 flex-wrap">
                              <span>مقاس {sz.size_name}</span>
                              {sz.color_name ? (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-bold border border-slate-200">
                                  {sz.color_name}
                                </span>
                              ) : (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-50 text-slate-400 font-bold">
                                  بدون لون
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-bold text-emerald-700 mt-0.5">
                              المتاح بالفرع: <span className="font-mono font-black">{maxVal}</span> قطعة
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => setSizeQty(sz, curVal - 1)}
                              disabled={curVal <= 0}
                              className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 flex items-center justify-center font-black"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <input
                              type="number"
                              min="0"
                              max={maxVal}
                              value={curVal}
                              onChange={(e) => setSizeQty(sz, e.target.value)}
                              className="w-11 text-center bg-slate-50 border border-slate-200 rounded-lg py-1 text-xs font-black font-mono outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => setSizeQty(sz, curVal + 1)}
                              disabled={curVal >= maxVal}
                              className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-800 hover:bg-indigo-200 disabled:opacity-40 flex items-center justify-center font-black"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-3 bg-white rounded-xl border border-indigo-100 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-700">الكمية المطلوبة من {selectedSourceBranch.branch_name} *</span>
                      <span className="text-emerald-700">
                        المتاح: <span className="font-mono font-black">{selectedSourceBranch.stock_level}</span>
                      </span>
                    </div>
                    <input
                      type="number"
                      min="1"
                      max={Math.max(1, Number(selectedSourceBranch.stock_level || 1))}
                      required
                      value={plainQuantity}
                      onChange={(e) => setPlainQuantity(e.target.value)}
                      className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-black font-mono outline-none focus:border-indigo-600"
                    />
                  </div>
                )}
              </div>
            )}

            {/* 3. Priority & Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1">
              <div className="sm:col-span-5 space-y-1.5">
                <label className="text-xs font-black text-slate-700 block">أولوية الطلب</label>
                <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setPriority('normal')}
                    className={`py-1.5 rounded-lg text-xs font-black transition-all ${
                      priority === 'normal'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    عادي
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriority('urgent')}
                    className={`py-1.5 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1 ${
                      priority === 'urgent'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'text-rose-600 hover:bg-rose-50'
                    }`}
                  >
                    <Flame className="w-3.5 h-3.5" />
                    <span>عاجل</span>
                  </button>
                </div>
              </div>

              <div className="sm:col-span-7 space-y-1.5">
                <label className="text-xs font-black text-slate-700 block">ملاحظات للفرع المصدر</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="مثال: عميل منتظر الآن، مطلوب اليوم..."
                  className="w-full bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-indigo-600"
                />
              </div>
            </div>
          </>
        )}

        <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            icon={Truck}
            isLoading={submitting}
            disabled={loading || !anyOtherBranchHasStock || !sourceBranchId || totalRequestedQty <= 0}
            className="flex-1 !rounded-2xl"
          >
            {totalRequestedQty > 0 ? `إرسال طلب التحويل (${totalRequestedQty} قطعة)` : 'إرسال طلب التحويل'}
          </Button>
          <Button type="button" variant="outline" size="lg" onClick={onClose}>
            إلغاء
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default SmartStockRequestModal;
