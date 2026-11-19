import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  X,
  Palette,
  Layers,
  Minus,
  Plus,
  Check,
  Building2,
} from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import api from '../../services/api/client';
import { useToast } from '../../context/ToastContext';

const normalizeName = (name) => String(name || '').trim().toLowerCase();

const sortSizeStrings = (a, b) => {
  const numA = parseFloat(a);
  const numB = parseFloat(b);
  if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) {
    return numA - numB;
  }
  return String(a || '').localeCompare(String(b || ''), 'ar-u-nu-latn', { numeric: true });
};

const getVariantKey = (v) =>
  `${v.inventory_id || ''}::${String(v.size_name || '').trim()}::${String(v.color_name || '').trim()}`;

const groupCatalogByName = (items) => {
  const groups = new Map();
  for (const item of items) {
    const key = normalizeName(item.name) || `id_${item.id}`;
    const stock = Number(item.branch_stock_level ?? item.stock_level ?? 0);
    const cost = Number(item.cost_price || item.wholesale_price || item.price || 0);
    const supId = Number(item.preferred_supplier_id || item.supplier_id || 0);

    if (!groups.has(key)) {
      groups.set(key, {
        ...item,
        groupKey: key,
        stock_level: stock,
        rep_stock: stock,
        unit_cost: cost,
        colors: item.color ? [String(item.color).trim()] : [],
        supplierIds: supId > 0 ? [supId] : [],
      });
    } else {
      const existing = groups.get(key);
      existing.stock_level += stock;
      if (stock > 0 && Number(existing.rep_stock || 0) <= 0) {
        existing.id = item.id;
        existing.barcode = item.barcode || existing.barcode;
        existing.rep_stock = stock;
      }
      if (cost > 0 && !existing.unit_cost) {
        existing.unit_cost = cost;
      }
      if (item.color) {
        const c = String(item.color).trim();
        if (c && !existing.colors.includes(c)) existing.colors.push(c);
      }
      if (supId > 0 && !existing.supplierIds.includes(supId)) {
        existing.supplierIds.push(supId);
      }
    }
  }
  return Array.from(groups.values());
};

export default function SupplierReturnModal({
  isOpen,
  onClose,
  suppliers = [],
  initialSupplierId = '',
  branches = [],
  activeBranchId = 'all',
  isBranchScoped = false,
  userBranchId = null,
  fallbackProducts = [],
  onSuccess,
}) {
  const { toast } = useToast();

  const [supplierId, setSupplierId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [onlySupplierProducts, setOnlySupplierProducts] = useState(true);
  const [productSearch, setProductSearch] = useState('');

  const [catalogList, setCatalogList] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [availabilityData, setAvailabilityData] = useState(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);

  const [selectedColorFilter, setSelectedColorFilter] = useState('ALL');
  const [selectedVariants, setSelectedVariants] = useState({});

  const [plainQuantity, setPlainQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Resolve initial defaults whenever modal opens
  useEffect(() => {
    if (!isOpen) return;

    const validBranch = isBranchScoped
      ? String(userBranchId || branches[0]?.id || '1')
      : activeBranchId && activeBranchId !== 'all'
        ? String(activeBranchId)
        : String(branches[0]?.id || '1');

    setSupplierId(String(initialSupplierId || suppliers[0]?.id || ''));
    setBranchId(validBranch);
    setOnlySupplierProducts(true);
    setProductSearch('');
    setSelectedProduct(null);
    setAvailabilityData(null);
    setSelectedColorFilter('ALL');
    setSelectedVariants({});
    setPlainQuantity('1');
    setUnitPrice('');
    setNotes('');
  }, [isOpen, initialSupplierId, suppliers, branches, activeBranchId, isBranchScoped, userBranchId]);

  // Fetch branch-aware inventory catalog whenever modal open or branchId changes
  useEffect(() => {
    if (!isOpen || !branchId) return;
    let cancelled = false;

    setLoadingCatalog(true);
    api
      .get(`/inventory?all=true&include_zero=true&branch_id=${encodeURIComponent(branchId)}`)
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data ?? res;
        const list = Array.isArray(payload)
          ? payload
          : payload?.items || payload?.data || [];
        setCatalogList(list);
      })
      .catch(() => {
        if (!cancelled) setCatalogList([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingCatalog(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, branchId]);

  // Load branch availability & colors/sizes matrix when a product is selected
  useEffect(() => {
    if (!isOpen || !selectedProduct?.id) {
      setAvailabilityData(null);
      return;
    }
    let cancelled = false;
    setLoadingAvailability(true);
    api
      .get(`/inventory/${selectedProduct.id}/branch-availability`)
      .then((res) => {
        if (cancelled) return;
        setAvailabilityData(res?.data || res || null);
      })
      .catch(() => {
        if (!cancelled) setAvailabilityData(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingAvailability(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedProduct?.id]);

  const groupedCatalog = useMemo(() => {
    const raw = catalogList.length > 0 ? catalogList : fallbackProducts;
    return groupCatalogByName(raw);
  }, [catalogList, fallbackProducts]);

  const supplierScopedCount = useMemo(() => {
    const sId = Number(supplierId || 0);
    if (!sId) return 0;
    return groupedCatalog.filter((p) => p.supplierIds.includes(sId)).length;
  }, [groupedCatalog, supplierId]);

  const productSuggestions = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    const sId = supplierId ? Number(supplierId) : null;

    const scopeBase =
      onlySupplierProducts && sId
        ? groupedCatalog.filter((p) => p.supplierIds.includes(sId))
        : groupedCatalog;

    const filtered = q
      ? scopeBase.filter((p) =>
          [p.name, p.barcode, p.color, ...(p.colors || []), p.size_cut, p.category]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(q)
        )
      : scopeBase;

    const sorted = [...filtered].sort((a, b) => {
      const aMatch = sId && a.supplierIds.includes(sId) ? 1 : 0;
      const bMatch = sId && b.supplierIds.includes(sId) ? 1 : 0;
      if (aMatch !== bMatch) return bMatch - aMatch;
      return Number(b.stock_level || 0) - Number(a.stock_level || 0);
    });

    return sorted.slice(0, 40);
  }, [groupedCatalog, productSearch, supplierId, onlySupplierProducts]);

  const selectedBranchObj = useMemo(
    () => branches.find((b) => String(b.id) === String(branchId)) || null,
    [branches, branchId]
  );

  // Availability entry for currently chosen return branch + other branches with stock
  const branchAvailabilityEntry = useMemo(() => {
    if (!availabilityData?.branches) return null;
    return (
      availabilityData.branches.find((b) => String(b.branch_id) === String(branchId)) || null
    );
  }, [availabilityData, branchId]);

  const otherAvailableBranches = useMemo(() => {
    if (!availabilityData?.branches || isBranchScoped) return [];
    return availabilityData.branches
      .filter((b) => String(b.branch_id) !== String(branchId) && Number(b.stock_level || 0) > 0)
      .sort((a, b) => Number(b.stock_level || 0) - Number(a.stock_level || 0));
  }, [availabilityData, branchId, isBranchScoped]);

  const branchVariantList = useMemo(() => {
    const sizes = branchAvailabilityEntry?.sizes || [];
    return [...sizes].sort((a, b) => {
      const colorCmp = String(a.color_name || '').localeCompare(String(b.color_name || ''), 'ar');
      if (colorCmp !== 0) return colorCmp;
      return sortSizeStrings(a.size_name, b.size_name);
    });
  }, [branchAvailabilityEntry]);

  const availableColorGroups = useMemo(() => {
    const map = new Map();
    for (const v of branchVariantList) {
      const color = (v.color_name || '').trim() || 'بدون لون';
      const k = getVariantKey(v);
      const picked = Number(selectedVariants[k] || 0);
      if (!map.has(color)) {
        map.set(color, { color, stock: 0, picked: 0 });
      }
      const entry = map.get(color);
      entry.stock += Number(v.stock_level || 0);
      entry.picked += picked;
    }
    return Array.from(map.values());
  }, [branchVariantList, selectedVariants]);

  const visibleVariants = useMemo(() => {
    if (selectedColorFilter === 'ALL') return branchVariantList;
    return branchVariantList.filter(
      (v) => ((v.color_name || '').trim() || 'بدون لون') === selectedColorFilter
    );
  }, [branchVariantList, selectedColorFilter]);

  const selectedVariantEntries = useMemo(() => {
    const out = [];
    for (const v of branchVariantList) {
      const k = getVariantKey(v);
      const qty = Math.floor(Number(selectedVariants[k] || 0));
      if (qty > 0) {
        out.push({
          key: k,
          inventory_id: Number(v.inventory_id || selectedProduct?.id),
          size_name: v.size_name || '',
          color_name: v.color_name || '',
          stock_level: Number(v.stock_level || 0),
          quantity: qty,
        });
      }
    }
    return out;
  }, [branchVariantList, selectedVariants, selectedProduct]);

  const usingVariantPicker = Boolean(selectedProduct) && branchVariantList.length > 0;
  const totalSelectedQty = usingVariantPicker
    ? selectedVariantEntries.reduce((sum, item) => sum + item.quantity, 0)
    : Number(plainQuantity || 0);

  const selectedBranchStock = selectedProduct
    ? Number(branchAvailabilityEntry?.stock_level ?? selectedProduct.stock_level ?? 0)
    : 0;

  const updateVariantQty = (variant, nextQty) => {
    const k = getVariantKey(variant);
    const maxAvail = Math.max(0, Number(variant.stock_level || 0));
    const clamped = Math.min(maxAvail, Math.max(0, Math.floor(Number(nextQty || 0))));
    setSelectedVariants((prev) => {
      const copy = { ...prev };
      if (clamped <= 0) {
        delete copy[k];
      } else {
        copy[k] = clamped;
      }
      return copy;
    });
  };

  const stepVariantQty = (variant, delta) => {
    const k = getVariantKey(variant);
    const maxAvail = Math.max(0, Number(variant.stock_level || 0));
    setSelectedVariants((prev) => {
      const next = Math.min(maxAvail, Math.max(0, Number(prev[k] || 0) + delta));
      const copy = { ...prev };
      if (next <= 0) {
        delete copy[k];
      } else {
        copy[k] = next;
      }
      return copy;
    });
  };

  const handleSelectProduct = (prod) => {
    if (!prod) return;
    setSelectedProduct(prod);
    setProductSearch(prod.name || '');
    setSelectedColorFilter('ALL');
    setSelectedVariants({});
    setPlainQuantity('1');
    const suggestedCost = Number(prod.unit_cost || prod.cost_price || prod.wholesale_price || prod.price || 0);
    if (suggestedCost > 0) {
      setUnitPrice(String(suggestedCost));
    }
  };

  const handleClearProduct = () => {
    setSelectedProduct(null);
    setAvailabilityData(null);
    setSelectedColorFilter('ALL');
    setSelectedVariants({});
    setProductSearch('');
    setPlainQuantity('1');
  };

  const handleBranchSwitch = (nextBranchId) => {
    setBranchId(String(nextBranchId));
    setSelectedVariants({});
    setSelectedColorFilter('ALL');
    setPlainQuantity('1');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!supplierId) {
      toast.warning('يرجى اختيار المورد');
      return;
    }

    const cleanName = productSearch.trim();
    if (!cleanName && !selectedProduct) {
      toast.warning('يرجى اختيار أو كتابة اسم الصنف المرتجع');
      return;
    }

    const parsedCost = Number(unitPrice);
    if (!parsedCost || parsedCost <= 0) {
      toast.warning('يرجى إدخال سعر التكلفة للقطعة');
      return;
    }

    if (usingVariantPicker) {
      if (selectedVariantEntries.length === 0 || totalSelectedQty <= 0) {
        toast.warning('يرجى تحديد كمية مرتجعة لمقاس/لون واحد على الأقل');
        return;
      }
      const over = selectedVariantEntries.find((v) => v.quantity > v.stock_level);
      if (over) {
        toast.warning(
          `الكمية المطلوبة للمقاس ${over.size_name || 'موحد'} أكبر من المتاح بالفرع (${over.stock_level})`
        );
        return;
      }
    } else if (!totalSelectedQty || totalSelectedQty <= 0) {
      toast.warning('يرجى إدخال كمية مرتجعة صحيحة');
      return;
    }

    const targetBranchId = Number(branchId || 1);
    const totalAmount = Math.round(totalSelectedQty * parsedCost * 100) / 100;

    const payload = {
      supplier_id: Number(supplierId),
      branch_id: targetBranchId,
      product_name: cleanName || selectedProduct?.name || '',
      quantity: totalSelectedQty,
      unit_price: parsedCost,
      total_amount: totalAmount,
      notes: notes.trim(),
      items: selectedProduct
        ? usingVariantPicker
          ? selectedVariantEntries.map((v) => ({
              inventory_id: Number(v.inventory_id),
              branch_id: targetBranchId,
              quantity: v.quantity,
              cost_price: parsedCost,
              size: v.size_name || null,
              color: v.color_name || null,
            }))
          : [
              {
                inventory_id: Number(selectedProduct.id),
                branch_id: targetBranchId,
                quantity: totalSelectedQty,
                cost_price: parsedCost,
                size: selectedProduct.size_cut || null,
                color: selectedProduct.color || null,
              },
            ]
        : [],
    };

    try {
      setSubmitting(true);
      await api.post('/suppliers/returns', payload);
      toast.success(
        selectedProduct
          ? 'تم تسجيل مرتجع المشتريات وخصم الكميات المحددة من المخزون وتحديث رصيد المورد بنجاح! 🔄'
          : 'تم تسجيل مرتجع المشتريات وتخفيض رصيد المورد بنجاح! 🔄'
      );
      onClose?.();
      onSuccess?.();
    } catch (err) {
      toast.error(err.message || 'فشل تسجيل مرتجع المشتريات');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="مرتجع مشتريات لمورد 🔄"
      subtitle="إرجاع بضاعة لمورد واختيار الألوان والمقاسات بدقة وتخفيض رصيده المسجل"
      maxWidth="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className={`grid grid-cols-1 ${!isBranchScoped ? 'sm:grid-cols-2' : ''} gap-3`}>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">المورد *</label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full h-10 bg-white border-2 border-slate-200 rounded-xl px-3 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600"
              required
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id.toString()}>
                  {s.name} ({s.company || 'مورد'})
                </option>
              ))}
            </select>
          </div>

          {!isBranchScoped && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">الفرع المرتجع منه *</label>
              <select
                value={branchId}
                onChange={(e) => handleBranchSwitch(e.target.value)}
                className="w-full h-10 bg-white border-2 border-slate-200 rounded-xl px-3 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600"
                required
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id.toString()}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Product Selection with Live Supplier-Filtered Autocomplete */}
        <div className="space-y-2 relative">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <label className="text-xs font-bold text-slate-700">اسم الصنف المرتجع *</label>
            {!selectedProduct && (
              <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200">
                <button
                  type="button"
                  onClick={() => setOnlySupplierProducts(true)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-black transition-all ${
                    onlySupplierProducts
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  أصناف هذا المورد فقط ({supplierScopedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setOnlySupplierProducts(false)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-black transition-all ${
                    !onlySupplierProducts
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  كل المخزون ({groupedCatalog.length})
                </button>
              </div>
            )}
          </div>

          {!selectedProduct ? (
            <>
              <div className="relative">
                <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  required
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="اكتب اسم الصنف أو الباركود أو اللون للاختيار من المخزون..."
                  className="w-full bg-white border-2 border-slate-200 rounded-xl pr-9 pl-8 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600"
                />
                {productSearch && (
                  <button
                    type="button"
                    onClick={() => setProductSearch('')}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    title="مسح"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {productSuggestions.length === 0 && onlySupplierProducts && (
                <div className="p-3 bg-white border-2 border-amber-200 rounded-xl shadow-sm text-center space-y-2">
                  <div className="text-[11px] font-bold text-slate-600">
                    {loadingCatalog
                      ? 'جارِ تحميل أصناف المخزون...'
                      : 'لا توجد أصناف مطابقة مربوطة بهذا المورد في المخزون'}
                  </div>
                  {!loadingCatalog && (
                    <button
                      type="button"
                      onClick={() => setOnlySupplierProducts(false)}
                      className="px-3 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-[11px] font-black transition-colors"
                    >
                      عرض كل أصناف المخزون
                    </button>
                  )}
                </div>
              )}

              {productSuggestions.length > 0 && (
                <div className="max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {productSuggestions.map((prod) => {
                    const isSameSupplier =
                      supplierId && prod.supplierIds.includes(Number(supplierId));
                    const avail = Number(prod.stock_level || 0);
                    return (
                      <button
                        key={prod.groupKey || prod.id}
                        type="button"
                        onClick={() => handleSelectProduct(prod)}
                        className="w-full text-right px-3.5 py-2.5 hover:bg-indigo-50/70 transition-colors flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-black text-slate-800 truncate flex items-center gap-1.5">
                            <span>{prod.name}</span>
                            {isSameSupplier && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold shrink-0">
                                نفس المورد
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 font-bold truncate mt-0.5">
                            {[
                              prod.colors?.length ? `ألوان: ${prod.colors.join('، ')}` : '',
                              prod.size_cut ? `مقاس: ${prod.size_cut}` : '',
                              prod.barcode ? `#${prod.barcode}` : '',
                            ]
                              .filter(Boolean)
                              .join(' • ')}
                          </div>
                        </div>
                        <div className="text-left shrink-0">
                          <div className="text-[11px] font-black text-indigo-700 font-mono">
                            {Number(prod.unit_cost || prod.cost_price || prod.price || 0).toLocaleString()} ج.م
                          </div>
                          <div
                            className={`text-[10px] font-bold ${
                              avail > 0 ? 'text-emerald-600' : 'text-rose-500'
                            }`}
                          >
                            متاح: {avail} قطعة
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {productSearch.trim() && (
                <div className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-800">
                  صنف غير محدد من القائمة — سيتم تخفيض رصيد المورد فقط (اضغط على الصنف من القائمة لاختيار الألوان والمقاسات وخصم المخزون)
                </div>
              )}
            </>
          ) : (
            <div className="p-3.5 rounded-2xl border-2 border-[#E6DECD] bg-[#FAF6ED]/70 space-y-3">
              {/* Selected Product Header */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-slate-900 flex items-center gap-2 flex-wrap">
                    <span>{selectedProduct.name}</span>
                    {selectedProduct.barcode && (
                      <span className="text-xs font-mono text-indigo-600 bg-white px-2 py-0.5 rounded-lg border border-indigo-100">
                        #{selectedProduct.barcode}
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-bold text-slate-500 mt-1 flex items-center flex-wrap gap-3">
                    <span>
                      الفرع المحدد:{' '}
                      <strong className="text-slate-900">{selectedBranchObj?.name || 'الفرع'}</strong>
                    </span>
                    <span>
                      المتاح بالفرع:{' '}
                      <strong className={selectedBranchStock > 0 ? 'text-emerald-700' : 'text-rose-600'}>
                        {selectedBranchStock} قطعة
                      </strong>
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClearProduct}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-black bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>تغيير الصنف</span>
                </button>
              </div>

              {/* Quick branch switch badges when stock exists in other branches */}
              {otherAvailableBranches.length > 0 && (
                <div className="flex items-center flex-wrap gap-1.5 pt-1 border-t border-[#E6DECD]/70">
                  <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5" />
                    <span>متاح أيضاً في فروع أخرى (اضغط للتحويل):</span>
                  </span>
                  {otherAvailableBranches.map((ob) => (
                    <button
                      key={ob.branch_id}
                      type="button"
                      onClick={() => handleBranchSwitch(ob.branch_id)}
                      className="px-2 py-0.5 rounded-lg text-[11px] font-black bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 transition-colors"
                    >
                      {ob.branch_name} ({ob.stock_level})
                    </button>
                  ))}
                </div>
              )}

              {/* Branch Color Filter Pills & Sizes Matrix */}
              <div className="bg-white rounded-xl border border-[#E6DECD] p-3 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    <span>الألوان والمقاسات المتوفرة في {selectedBranchObj?.name || 'الفرع'}</span>
                  </div>
                  {usingVariantPicker && (
                    <span className="text-xs font-black px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                      المحدد للإرجاع: {totalSelectedQty} قطعة
                    </span>
                  )}
                </div>

                {loadingAvailability ? (
                  <div className="py-4 text-center text-xs font-bold text-slate-400">
                    جارِ تحميل الألوان والمقاسات المتاحة بالفرع...
                  </div>
                ) : usingVariantPicker ? (
                  <>
                    {/* Color Filter Pills */}
                    {availableColorGroups.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
                          <Palette className="w-3.5 h-3.5" />
                          <span>تصفية حسب اللون:</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedColorFilter('ALL')}
                            className={`px-3 py-1.5 rounded-full text-xs font-black border transition-all flex items-center gap-1.5 ${
                              selectedColorFilter === 'ALL'
                                ? 'bg-[#151515] text-white border-[#151515]'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {selectedColorFilter === 'ALL' && <Check className="w-3 h-3" />}
                            <span>
                              كل الألوان ({branchVariantList.reduce((s, v) => s + Number(v.stock_level || 0), 0)})
                            </span>
                          </button>
                          {availableColorGroups.map((cg) => {
                            const active = selectedColorFilter === cg.color;
                            return (
                              <button
                                key={cg.color}
                                type="button"
                                onClick={() => setSelectedColorFilter(cg.color)}
                                className={`px-3 py-1.5 rounded-full text-xs font-black border transition-all flex items-center gap-1.5 ${
                                  active
                                    ? 'bg-[#151515] text-white border-[#151515]'
                                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                {active && <Check className="w-3 h-3" />}
                                <span>
                                  {cg.color} ({cg.stock})
                                </span>
                                {cg.picked > 0 && (
                                  <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-rose-500 text-white font-black">
                                    {cg.picked}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Size / Color Cards with Functional Steppers */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-0.5">
                      {visibleVariants.map((v) => {
                        const k = getVariantKey(v);
                        const avail = Number(v.stock_level || 0);
                        const picked = Number(selectedVariants[k] || 0);
                        const isOutOfStock = avail <= 0;

                        return (
                          <div
                            key={k}
                            className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                              picked > 0
                                ? 'border-rose-300 bg-rose-50/40 shadow-sm'
                                : isOutOfStock
                                  ? 'border-slate-100 bg-slate-50 opacity-60'
                                  : 'border-slate-200 bg-white'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-black text-slate-900">
                                  {v.size_name ? `مقاس ${v.size_name}` : 'مقاس موحد'}
                                </span>
                                {v.color_name && (
                                  <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold">
                                    {v.color_name}
                                  </span>
                                )}
                              </div>
                              <div className={`text-[11px] font-bold mt-0.5 ${isOutOfStock ? 'text-slate-400' : 'text-emerald-700'}`}>
                                المتاح بالفرع: {avail} قطعة
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0" dir="ltr">
                              <button
                                type="button"
                                disabled={picked <= 0}
                                onClick={() => stepVariantQty(v, -1)}
                                className="w-7 h-7 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center text-slate-700 disabled:opacity-40"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <input
                                type="number"
                                min="0"
                                max={avail}
                                disabled={isOutOfStock}
                                value={picked}
                                onChange={(e) => updateVariantQty(v, e.target.value)}
                                className="w-12 h-7 text-center text-xs font-black rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
                              />
                              <button
                                type="button"
                                disabled={isOutOfStock || picked >= avail}
                                onClick={() => stepVariantQty(v, 1)}
                                className="w-7 h-7 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center text-slate-700 disabled:opacity-40"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Selected Summary Chips */}
                    {selectedVariantEntries.length > 0 && (
                      <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-1.5">
                        {selectedVariantEntries.map((item) => (
                          <span
                            key={item.key}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-xs font-black text-rose-800"
                          >
                            <span>
                              {item.size_name ? `مقاس ${item.size_name}` : 'موحد'}
                              {item.color_name ? ` (${item.color_name})` : ''}: {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateVariantQty(item, 0)}
                              className="text-rose-500 hover:text-rose-800"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs font-bold text-slate-500">
                    {selectedBranchStock <= 0
                      ? 'لا يوجد رصيد متاح لهذا الصنف في الفرع المحدد. اختر فرعاً آخر متاحاً بالأعلى إن وجد.'
                      : `صنف بدون مقاسات مفصلة — المتاح بالفرع: ${selectedBranchStock} قطعة`}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Quantity & Unit Cost */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {usingVariantPicker ? (
            <Input
              label="إجمالي الكمية المرتجعة"
              type="number"
              readOnly
              value={totalSelectedQty}
            />
          ) : (
            <Input
              label="الكمية المرتجعة *"
              type="number"
              min="1"
              max={selectedProduct ? Math.max(1, selectedBranchStock) : undefined}
              required
              value={plainQuantity}
              onChange={(e) => setPlainQuantity(e.target.value)}
            />
          )}

          <Input
            label="سعر التكلفة للقطعة (ج.م) *"
            type="number"
            step="0.01"
            min="0.01"
            required
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
          />
        </div>

        {totalSelectedQty > 0 && Number(unitPrice) > 0 && (
          <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-black text-rose-800">
            <span>إجمالي قيمة المرتجع المخصومة من المورد:</span>
            <span className="font-mono text-sm">
              {(totalSelectedQty * Number(unitPrice)).toLocaleString()} ج.م
            </span>
          </div>
        )}

        <Input
          label="ملاحظات وسبب الإرجاع"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="تلف، عيب صناعة، غير مطابق..."
        />

        <div className="flex items-center gap-2 pt-3">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={submitting}
            className="flex-1 !rounded-2xl !bg-rose-600 hover:!bg-rose-700 text-white"
          >
            تأكيد المرتجع للمورد
          </Button>
          <Button type="button" variant="outline" size="lg" onClick={onClose}>
            إلغاء
          </Button>
        </div>
      </form>
    </Modal>
  );
}
