import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardHeader } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import StatCard from '../../components/ui/StatCard';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import { useToast } from '../../context/ToastContext';
import client from '../../services/api/client';
import {
  AlertTriangle,
  Plus,
  Search,
  RotateCcw,
  Package,
  Calendar,
  TrendingDown,
  FileText,
  Palette,
  Layers,
  Minus,
  Check,
  X,
} from 'lucide-react';

const normalizeProductName = (name) => String(name || '').trim().toLowerCase();

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

const parseSizesData = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const groupSalesCatalog = (items) => {
  const groups = new Map();
  for (const item of items) {
    const key = normalizeProductName(item.name) || `id_${item.id}`;
    const stock = Number(item.branch_stock_level ?? item.stock_level ?? 0);
    const unitCost = Number(item.cost_price || item.purchase_price || item.price || 0);
    if (!groups.has(key)) {
      groups.set(key, {
        ...item,
        groupKey: key,
        stock_level: stock,
        rep_stock: stock,
        unit_cost: unitCost,
        variant_count: 1,
        colors: item.color ? [String(item.color).trim()] : [],
      });
    } else {
      const existing = groups.get(key);
      existing.stock_level += stock;
      existing.variant_count += 1;
      if (stock > 0 && Number(existing.rep_stock || 0) <= 0) {
        existing.id = item.id;
        existing.barcode = item.barcode || existing.barcode;
        existing.rep_stock = stock;
      }
      if (unitCost > 0 && !existing.unit_cost) {
        existing.unit_cost = unitCost;
      }
      if (item.color) {
        const c = String(item.color).trim();
        if (c && !existing.colors.includes(c)) existing.colors.push(c);
      }
    }
  }
  return Array.from(groups.values());
};

export function WornProducts() {
  const { user, isAdmin, hasPermission } = useAuth();
  const { branches, currentBranchId, activeBranchId, hasAllBranchesAccess, canSwitchBranches } = useBranch();
  const { toast } = useToast();

  const canCreateWorn = Boolean(isAdmin || hasPermission('worn_products.create'));
  const canEditWorn = Boolean(isAdmin || hasPermission('worn_products.edit'));
  const canDeleteWorn = Boolean(isAdmin || hasPermission('worn_products.delete'));

  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({
    records: 0,
    quantity: 0,
    month_quantity: 0,
    estimated_loss: 0,
  });
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filterBranch, setFilterBranch] = useState(() => (activeBranchId && activeBranchId !== 'all' ? activeBranchId : 'all'));

  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1,
  });

  useEffect(() => {
    if (activeBranchId) {
      setFilterBranch(activeBranchId);
      setPagination((prev) => ({ ...prev, page: 1 }));
    }
  }, [activeBranchId]);

  // Modal & Form
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productsList, setProductsList] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Selected Product & Smart Variant Picker State
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [availabilityData, setAvailabilityData] = useState(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [selectedColorFilter, setSelectedColorFilter] = useState('ALL');
  const [selectedVariants, setSelectedVariants] = useState({});
  const [lossManuallyEdited, setLossManuallyEdited] = useState(false);

  const [form, setForm] = useState({
    product_type: 'sales',
    product_id: '',
    branch_id: '',
    quantity: 1,
    color_name: '',
    size_name: '',
    condition: 'worn',
    reason: '',
    estimated_loss: 0,
    notes: '',
    occurred_at: new Date().toISOString().split('T')[0],
    deduct_stock: true,
  });

  const isBranchScoped = !hasAllBranchesAccess && !canSwitchBranches && user?.branch_scope !== 'all' && user?.role !== 'accountant' && !/^(acct|hesabat|accountant|حسابات)/i.test(user?.username || '') && (user?.role === 'branch_user' || user?.role === 'cashier' || user?.role === 'tailor');

  // Load summary and list
  const loadRecords = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.page,
        limit: pagination.limit,
      });

      if (search.trim()) params.set('search', search.trim());
      if (filterBranch !== 'all') params.set('branch_id', filterBranch);
      if (filterType !== 'all') params.set('product_type', filterType);
      if (filterStatus !== 'all') params.set('status', filterStatus);

      const [recordsRes, summaryRes] = await Promise.all([
        client.get(`/worn-products?${params.toString()}`),
        client.get(`/worn-products/summary?${params.toString()}`),
      ]);

      const data = recordsRes.data;
      if (data && Array.isArray(data.data)) {
        setRecords(data.data);
        if (data.pagination) setPagination(data.pagination);
      } else if (Array.isArray(data)) {
        setRecords(data);
      } else {
        setRecords([]);
      }

      if (summaryRes.data) {
        setSummary(summaryRes.data);
      }
    } catch (err) {
      toast({
        title: 'خطأ في التحميل',
        message: err.message || 'تعذر تحميل بيانات التوالف',
        variant: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search, filterBranch, filterType, filterStatus, toast]);

  useEffect(() => {
    loadRecords();
    const handleSyncCompleted = () => {
      loadRecords();
    };
    window.addEventListener('elwazeer:sync-completed', handleSyncCompleted);
    return () => window.removeEventListener('elwazeer:sync-completed', handleSyncCompleted);
  }, [loadRecords]);

  // Load full branch catalog for instant smart search
  const loadProducts = useCallback(async (type, branchId) => {
    try {
      setLoadingProducts(true);
      const params = new URLSearchParams();
      if (branchId) params.set('branch_id', branchId);
      params.set('all', 'true');
      if (type !== 'rental') {
        params.set('include_zero', 'true');
      }

      const endpoint = type === 'rental' ? '/rental-inventory' : '/inventory';
      const res = await client.get(`${endpoint}?${params.toString()}`);
      const payload = res.data;
      const rawItems = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.items)
          ? payload.items
          : Array.isArray(payload?.data)
            ? payload.data
            : [];

      if (type === 'sales') {
        setProductsList(groupSalesCatalog(rawItems));
      } else {
        setProductsList(
          rawItems.map((item) => ({
            ...item,
            stock_level: Number(item.branch_stock_level ?? item.stock_level ?? 0),
            unit_cost: Number(item.cost_price || item.purchase_price || item.price || 0),
            colors: item.color ? [String(item.color).trim()] : [],
          }))
        );
      }
    } catch {
      setProductsList([]);
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  const loadAvailabilityForProduct = useCallback(async (productId) => {
    if (!productId) {
      setAvailabilityData(null);
      return;
    }
    try {
      setLoadingAvailability(true);
      const res = await client.get(`/inventory/${productId}/branch-availability`);
      setAvailabilityData(res.data || null);
    } catch {
      setAvailabilityData(null);
    } finally {
      setLoadingAvailability(false);
    }
  }, []);

  const resetProductSelection = useCallback(() => {
    setSelectedProduct(null);
    setAvailabilityData(null);
    setSelectedColorFilter('ALL');
    setSelectedVariants({});
    setLossManuallyEdited(false);
    setProductSearch('');
  }, []);

  const openAddModal = () => {
    const validBranchFromContext =
      activeBranchId && activeBranchId !== 'all'
        ? String(activeBranchId)
        : currentBranchId && currentBranchId !== 'all'
          ? String(currentBranchId)
          : '';
    const defaultBranch = isBranchScoped
      ? String(user?.branch_id || '1')
      : validBranchFromContext || (branches[0]?.id ? String(branches[0].id) : '1');
    resetProductSelection();
    setForm({
      product_type: 'sales',
      product_id: '',
      branch_id: String(defaultBranch),
      quantity: 1,
      color_name: '',
      size_name: '',
      condition: 'worn',
      reason: '',
      estimated_loss: 0,
      notes: '',
      occurred_at: new Date().toISOString().split('T')[0],
      deduct_stock: true,
    });
    setShowModal(true);
    loadProducts('sales', defaultBranch);
  };

  const handleProductTypeChange = (type) => {
    resetProductSelection();
    setForm((prev) => ({
      ...prev,
      product_type: type,
      product_id: '',
      quantity: 1,
      color_name: '',
      size_name: '',
      estimated_loss: 0,
    }));
    loadProducts(type, form.branch_id);
  };

  const handleBranchChange = (branchId) => {
    setSelectedVariants({});
    setSelectedColorFilter('ALL');
    if (form.product_type === 'rental') {
      resetProductSelection();
      setForm((prev) => ({
        ...prev,
        branch_id: branchId,
        product_id: '',
        quantity: 1,
        color_name: '',
        size_name: '',
        estimated_loss: 0,
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        branch_id: branchId,
        quantity: 1,
      }));
    }
    loadProducts(form.product_type, branchId);
  };

  const handleSelectProduct = (prod) => {
    if (!prod) return;
    setSelectedProduct(prod);
    setSelectedColorFilter('ALL');
    setSelectedVariants({});
    setLossManuallyEdited(false);
    setProductSearch('');
    const unitCost = Number(prod.unit_cost ?? prod.cost_price ?? prod.purchase_price ?? prod.price ?? 0);
    setForm((prev) => ({
      ...prev,
      product_id: String(prod.id),
      quantity: 1,
      color_name: prod.color || '',
      size_name: prod.size_cut || prod.size || '',
      estimated_loss: Math.round(unitCost * 100) / 100,
    }));

    if (form.product_type === 'sales') {
      loadAvailabilityForProduct(prod.id);
    } else {
      setAvailabilityData(null);
    }
  };

  const selectedBranchObj = useMemo(
    () => branches.find((b) => String(b.id) === String(form.branch_id)) || null,
    [branches, form.branch_id]
  );

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    const list = q
      ? productsList.filter((p) => {
          const haystack = [
            p.name,
            p.barcode,
            p.color,
            ...(p.colors || []),
            p.size_cut,
            p.size,
            p.category,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return haystack.includes(q);
        })
      : productsList;

    return [...list].sort((a, b) => {
      if (form.deduct_stock) {
        const diff = (Number(b.stock_level) > 0 ? 1 : 0) - (Number(a.stock_level) > 0 ? 1 : 0);
        if (diff !== 0) return diff;
      }
      return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
    });
  }, [productsList, productSearch, form.deduct_stock]);

  const branchAvailabilityEntry = useMemo(() => {
    if (form.product_type !== 'sales' || !availabilityData?.branches) return null;
    return (
      availabilityData.branches.find((b) => String(b.branch_id) === String(form.branch_id)) || null
    );
  }, [form.product_type, availabilityData, form.branch_id]);

  const branchVariantList = useMemo(() => {
    if (form.product_type !== 'sales') return [];
    const directSizes = branchAvailabilityEntry?.sizes || [];
    if (directSizes.length > 0) {
      return [...directSizes].sort((a, b) => {
        const colorCmp = String(a.color_name || '').localeCompare(String(b.color_name || ''), 'ar');
        if (colorCmp !== 0) return colorCmp;
        return sortSizeStrings(a.size_name, b.size_name);
      });
    }

    if (!form.deduct_stock && availabilityData?.branches?.length) {
      const seen = new Map();
      for (const b of availabilityData.branches) {
        for (const s of b.sizes || []) {
          const k = `${String(s.size_name || '').trim().toLowerCase()}::${String(s.color_name || '').trim().toLowerCase()}`;
          if (!seen.has(k)) {
            seen.set(k, {
              ...s,
              inventory_id: selectedProduct?.id || s.inventory_id,
              stock_level: 0,
            });
          }
        }
      }
      return Array.from(seen.values()).sort((a, b) => sortSizeStrings(a.size_name, b.size_name));
    }

    return [];
  }, [form.product_type, form.deduct_stock, branchAvailabilityEntry, availabilityData, selectedProduct]);

  const availableColorGroups = useMemo(() => {
    const map = new Map();
    for (const v of branchVariantList) {
      const color = (v.color_name || '').trim() || 'بدون لون';
      const key = getVariantKey(v);
      const picked = Number(selectedVariants[key] || 0);
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
          inventory_id: v.inventory_id || selectedProduct?.id,
          size_name: v.size_name || '',
          color_name: v.color_name || '',
          stock_level: Number(v.stock_level || 0),
          quantity: qty,
        });
      }
    }
    return out;
  }, [branchVariantList, selectedVariants, selectedProduct]);

  const usingVariantPicker = form.product_type === 'sales' && branchVariantList.length > 0;
  const totalSelectedQty = usingVariantPicker
    ? selectedVariantEntries.reduce((sum, item) => sum + item.quantity, 0)
    : Number(form.quantity || 0);

  useEffect(() => {
    if (!showModal || !selectedProduct || lossManuallyEdited) return;
    const unitCost = Number(
      selectedProduct.unit_cost ??
        selectedProduct.cost_price ??
        selectedProduct.purchase_price ??
        selectedProduct.price ??
        0
    );
    const nextLoss = Math.round(unitCost * Math.max(0, totalSelectedQty) * 100) / 100;
    setForm((prev) => (prev.estimated_loss === nextLoss ? prev : { ...prev, estimated_loss: nextLoss }));
  }, [showModal, selectedProduct, totalSelectedQty, lossManuallyEdited]);

  const updateVariantQty = (variant, nextQty) => {
    const k = getVariantKey(variant);
    let clamped = Math.max(0, Math.floor(Number(nextQty || 0)));
    if (form.deduct_stock) {
      clamped = Math.min(clamped, Math.max(0, Number(variant.stock_level || 0)));
    }
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
      const current = Number(prev[k] || 0);
      let next = Math.max(0, current + delta);
      if (form.deduct_stock) {
        next = Math.min(next, maxAvail);
      }
      const copy = { ...prev };
      if (next <= 0) {
        delete copy[k];
      } else {
        copy[k] = next;
      }
      return copy;
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.product_id || !selectedProduct) {
      toast({ title: 'تنبيه', message: 'يرجى اختيار المنتج التالف أولاً', variant: 'warning' });
      return;
    }

    if (usingVariantPicker) {
      if (selectedVariantEntries.length === 0 || totalSelectedQty <= 0) {
        toast({ title: 'تنبيه', message: 'يرجى تحديد كمية تالفة لمقاس/لون واحد على الأقل', variant: 'warning' });
        return;
      }
      if (form.deduct_stock) {
        const overItem = selectedVariantEntries.find((v) => v.quantity > v.stock_level);
        if (overItem) {
          toast({
            title: 'تجاوز الرصيد المتاح',
            message: `الكمية المطلوبة للمقاس ${overItem.size_name || 'موحد'} أكبر من المتاح بالفرع (${overItem.stock_level})`,
            variant: 'warning',
          });
          return;
        }
      }
    } else if (!form.quantity || Number(form.quantity) <= 0) {
      toast({ title: 'تنبيه', message: 'يرجى إدخال كمية صحيحة أكبر من الصفر', variant: 'warning' });
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        product_type: form.product_type,
        branch_id: Number(form.branch_id),
        quantity: Number(totalSelectedQty),
        condition: form.condition,
        reason: form.reason.trim(),
        estimated_loss: Number(form.estimated_loss || 0),
        notes: form.notes.trim(),
        occurred_at: form.occurred_at,
        deduct_stock: form.deduct_stock,
      };

      if (form.product_type === 'rental') {
        payload.rental_inventory_id = Number(form.product_id);
        payload.color_name = selectedProduct.color || form.color_name || '';
        payload.size_name = selectedProduct.size_cut || form.size_name || '';
      } else {
        payload.inventory_id = Number(selectedVariantEntries[0]?.inventory_id || form.product_id);
        if (usingVariantPicker) {
          payload.sizes = selectedVariantEntries.map((v) => ({
            inventory_id: Number(v.inventory_id),
            size_name: v.size_name,
            color_name: v.color_name,
            quantity: v.quantity,
          }));
        } else {
          if (form.color_name.trim()) payload.color_name = form.color_name.trim();
          if (form.size_name.trim()) payload.size_name = form.size_name.trim();
        }
      }

      await client.post('/worn-products', payload);
      toast({
        title: 'تم بنجاح',
        message: form.deduct_stock
          ? 'تم تسجيل المنتج التالف وخصم الكمية بدقة من مخزون الفرع'
          : 'تم تسجيل المنتج التالف في السجل بدون خصم من المخزون',
        variant: 'success',
      });
      setShowModal(false);
      loadRecords();
    } catch (err) {
      toast({
        title: 'تعذر الحفظ',
        message: err.message || 'حدث خطأ أثناء حفظ السجل',
        variant: 'danger',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRecord = async (record) => {
    const hadDeduct = record.deduct_stock !== false && record.deduct_stock !== 0;
    const confirmMsg = hadDeduct
      ? `هل أنت متأكد من استرجاع وحذف سجل "${record.product_name || 'المنتج'}"؟\nسيتم إعادة ${record.quantity} قطعة إلى رصيد مخزون الفرع تلقائياً.`
      : `هل أنت متأكد من حذف سجل التالف لـ "${record.product_name || 'المنتج'}"؟`;

    if (!window.confirm(confirmMsg)) return;

    try {
      setDeletingId(record.id);
      const res = await client.delete(`/worn-products/${record.id}`);
      toast({
        title: 'تم الاسترجاع والحذف',
        message: res.data?.restored_stock
          ? 'تم حذف السجل وإرجاع الكمية لمخزون الفرع بنجاح'
          : 'تم حذف السجل بنجاح',
        variant: 'success',
      });
      loadRecords();
    } catch (err) {
      toast({
        title: 'تعذر الحذف',
        message: err.message || 'حدث خطأ أثناء حذف السجل',
        variant: 'danger',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleStatusChange = async (recordId, newStatus) => {
    try {
      await client.patch(`/worn-products/${recordId}`, { status: newStatus });
      setRecords((prev) =>
        prev.map((r) => (r.id === recordId ? { ...r, status: newStatus } : r))
      );
      toast({
        title: 'تم التحديث',
        message: 'تم تحديث حالة القطعة بنجاح',
        variant: 'success',
      });
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر تحديث الحالة',
        variant: 'danger',
      });
    }
  };

  const formatCurrency = (val) => {
    const parsed = Number(val);
    const num = Number.isFinite(parsed) ? parsed : 0;
    const formatted = num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return num < 0 ? `\u200E${formatted} ج.م` : `${formatted} ج.م`;
  };

  const formatDate = (val) => {
    if (!val) return '-';
    return new Date(val).toLocaleDateString('ar-EG-u-nu-latn');
  };

  const getConditionLabel = (c) => {
    switch (c) {
      case 'worn':
        return 'مهترئ / استخدام';
      case 'damaged':
        return 'تالف / مكسور';
      case 'lost':
        return 'مفقود';
      default:
        return c || 'مهترئ';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#151515] border border-[#24221F] flex items-center justify-center text-white shadow-sm">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                المنتجات المهترئة والتوالف
              </h1>
              <p className="text-sm font-semibold text-slate-500 mt-0.5">
                سجل إهلاك وتلف بضائع البيع وقطع التأجير واستبعادها من الجرد
              </p>
            </div>
          </div>
        </div>
        {canCreateWorn && (
          <Button variant="danger" icon={Plus} onClick={openAddModal}>
            تسجيل قطعة تالفة
          </Button>
        )}
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="إجمالي السجلات"
          value={summary.records}
          icon={FileText}
          variant="pastel-yellow"
          subtitle="سجل هالك مقيد بالنظام"
        />
        <StatCard
          title="إجمالي القطع التالفة"
          value={summary.quantity}
          icon={Package}
          variant="pastel-pink"
          subtitle="قطعة مستبعدة من المخازن"
        />
        <StatCard
          title="هالك الشهر الحالي"
          value={summary.month_quantity}
          icon={Calendar}
          variant="pastel-green"
          subtitle="قطعة تالفة خلال هذا الشهر"
        />
        <StatCard
          title="إجمالي الخسارة التقديرية"
          value={formatCurrency(summary.estimated_loss)}
          icon={TrendingDown}
          variant="pastel-blue"
          subtitle="تكلفة تقديرية بناءً على سعر التكلفة"
        />
      </div>

      {/* Filters Bar */}
      <Card>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <Input
              placeholder="بحث بالاسم، الباركود، السبب..."
              icon={Search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {!isBranchScoped && (
            <div>
              <select
                className="w-full h-11 px-3.5 rounded-xl border border-[#E6DECD] bg-[#FFFDF9] font-bold text-sm text-[#24221F] focus:outline-none focus:border-[#151515]"
                value={filterBranch}
                onChange={(e) => setFilterBranch(e.target.value)}
              >
                <option value="all">كل الفروع</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id.toString()}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <select
              className="w-full h-11 px-3.5 rounded-xl border border-[#E6DECD] bg-[#FFFDF9] font-bold text-sm text-[#24221F] focus:outline-none focus:border-[#151515]"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="all">كل الأقسام (بيع وتأجير)</option>
              <option value="sales">مخزون البيع</option>
              <option value="rental">مخزون التأجير</option>
            </select>
          </div>

          <div>
            <select
              className="w-full h-11 px-3.5 rounded-xl border border-[#E6DECD] bg-[#FFFDF9] font-bold text-sm text-[#24221F] focus:outline-none focus:border-[#151515]"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">كل الحالات</option>
              <option value="recorded">مسجل حديثاً</option>
              <option value="reviewed">تمت المراجعة</option>
              <option value="disposed">تم التخلص والإتلاف</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Table Records */}
      <Card>
        <CardHeader
          title="قائمة التوالف والقطع المستبعدة"
          subtitle={`إجمالي المطابق: ${records.length} سجل`}
        />

        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-[#151515] text-white text-xs font-bold">
                <th className="py-3 px-4 rounded-r-xl">التاريخ</th>
                {!isBranchScoped && <th className="py-3 px-4">الفرع</th>}
                <th className="py-3 px-4">المنتج والتفاصيل</th>
                <th className="py-3 px-4">نوع المخزون</th>
                <th className="py-3 px-4">الكمية</th>
                <th className="py-3 px-4">درجة التلف</th>
                <th className="py-3 px-4">السبب / الملاحظات</th>
                <th className="py-3 px-4">الخسارة المقدرة</th>
                <th className="py-3 px-4">الحالة</th>
                <th className="py-3 px-4 rounded-l-xl text-center">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6DECD]/60 text-sm">
              {loading ? (
                <tr>
                  <td
                    colSpan={isBranchScoped ? 9 : 10}
                    className="py-12 text-center text-slate-400 font-bold"
                  >
                    جارِ تحميل البيانات...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td
                    colSpan={isBranchScoped ? 9 : 10}
                    className="py-16 text-center text-slate-400 font-bold"
                  >
                    <AlertTriangle className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                    لا توجد منتجات تالفة مسجلة تطابق معايير البحث
                  </td>
                </tr>
              ) : (
                records.map((r) => {
                  const rowVariants = parseSizesData(r.sizes_data);
                  const noDeduct = r.deduct_stock === false || r.deduct_stock === 0;
                  return (
                  <tr key={r.id} className="hover:bg-[#FAF6ED]/70 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-600 whitespace-nowrap">
                      {formatDate(r.occurred_at || r.created_at)}
                    </td>
                    {!isBranchScoped && (
                      <td className="py-3.5 px-4 font-black text-slate-800">
                        {r.branch_name || 'الفرع الرئيسي'}
                      </td>
                    )}
                    <td className="py-3.5 px-4">
                      <div className="font-black text-slate-900 flex items-center gap-2 flex-wrap">
                        <span>{r.product_name || 'منتج غير معروف'}</span>
                        {noDeduct && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200">
                            بدون خصم مخزون
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 flex items-center flex-wrap gap-2 mt-0.5">
                        <span className="font-mono text-indigo-600 font-bold">كود: #{r.product_id}</span>
                        {r.product_barcode && <span>• باركود: #{r.product_barcode}</span>}
                        {!rowVariants.length && r.product_color && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-bold">
                            لون: {r.product_color}
                          </span>
                        )}
                        {!rowVariants.length && r.product_size && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-bold">
                            مقاس: {r.product_size}
                          </span>
                        )}
                      </div>
                      {rowVariants.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {rowVariants.map((v, idx) => (
                            <span
                              key={`${r.id}-v-${idx}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-[#FAF6ED] border border-[#E6DECD] text-[#24221F]"
                            >
                              {v.size_name ? `مقاس ${v.size_name}` : 'موحد'}
                              {v.color_name ? ` (${v.color_name})` : ''}
                              <span className="text-rose-600 font-black">×{v.quantity}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {r.product_type === 'rental' ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-black bg-indigo-50 text-indigo-700 border border-indigo-100">
                          تأجير
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-100">
                          بيع
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-black text-rose-600 whitespace-nowrap">
                      {r.quantity} قطعة
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-700 text-xs">
                      {getConditionLabel(r.condition)}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-bold text-slate-600 max-w-xs">
                      {r.reason || r.notes ? (
                        <div>
                          {r.reason && <p className="font-black text-slate-800">{r.reason}</p>}
                          {r.notes && <p className="text-slate-400 mt-0.5">{r.notes}</p>}
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-black text-slate-900 whitespace-nowrap">
                      {formatCurrency(r.estimated_loss)}
                    </td>
                    <td className="py-3.5 px-4">
                      <select
                        className="text-xs font-black py-1.5 px-2.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 disabled:opacity-60 disabled:cursor-not-allowed"
                        value={r.status || 'recorded'}
                        onChange={(e) => handleStatusChange(r.id, e.target.value)}
                        disabled={!canEditWorn}
                      >
                        <option value="recorded">مسجل</option>
                        <option value="reviewed">تمت المراجعة</option>
                        <option value="disposed">تم التخلص</option>
                      </select>
                    </td>
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      {canDeleteWorn && (
                        <button
                          type="button"
                          onClick={() => handleDeleteRecord(r)}
                          disabled={deletingId === r.id}
                          title={noDeduct ? 'حذف السجل' : 'استرجاع الكمية للمخزون وحذف السجل'}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-black text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors disabled:opacity-50"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>{deletingId === r.id ? 'جارِ...' : 'استرجاع وحذف'}</span>
                        </button>
                      )}
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add Damaged Product Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="تسجيل منتج مهترئ / تالف"
        size="lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5">
                نوع المخزون
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleProductTypeChange('sales')}
                  className={`py-2 px-3 rounded-xl text-xs font-black border transition-all ${
                    form.product_type === 'sales'
                      ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  بضاعة بيع
                </button>
                <button
                  type="button"
                  onClick={() => handleProductTypeChange('rental')}
                  className={`py-2 px-3 rounded-xl text-xs font-black border transition-all ${
                    form.product_type === 'rental'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  قطع تأجير
                </button>
              </div>
            </div>

            {!isBranchScoped && (
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">
                  الفرع
                </label>
                <select
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  value={form.branch_id}
                  onChange={(e) => handleBranchChange(e.target.value)}
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

            <div className="sm:col-span-2">
              <label className="block text-xs font-black text-slate-700 mb-1.5">
                اختيار المنتج
              </label>
              {!selectedProduct ? (
                <div className="space-y-2">
                  <Input
                    placeholder="ابحث بالاسم أو الباركود أو اللون..."
                    icon={Search}
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                  />
                  <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
                    {loadingProducts ? (
                      <div className="p-4 text-center text-xs font-bold text-slate-400">
                        جارِ تحميل أصناف المخزون...
                      </div>
                    ) : filteredProducts.length === 0 ? (
                      <div className="p-4 text-center text-xs font-bold text-slate-400">
                        لا توجد منتجات مطابقة للبحث
                      </div>
                    ) : (
                      filteredProducts.slice(0, 60).map((p) => {
                        const avail = Number(p.stock_level ?? 0);
                        return (
                          <button
                            key={`${form.product_type}-${p.id}`}
                            type="button"
                            onClick={() => handleSelectProduct(p)}
                            className="w-full text-right px-3.5 py-2.5 hover:bg-[#FAF6ED] transition-colors flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <div className="font-black text-xs text-slate-900 truncate">
                                {p.name}
                              </div>
                              <div className="text-[11px] text-slate-500 font-bold flex items-center flex-wrap gap-2 mt-0.5">
                                {p.barcode && <span className="font-mono text-indigo-600">#{p.barcode}</span>}
                                {p.colors?.length > 0 && (
                                  <span>• ألوان: {p.colors.join('، ')}</span>
                                )}
                                {(p.size_cut || p.size) && (
                                  <span>• مقاس: {p.size_cut || p.size}</span>
                                )}
                              </div>
                            </div>
                            <span
                              className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-black border ${
                                avail > 0
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-slate-100 text-slate-500 border-slate-200'
                              }`}
                            >
                              المتاح: {avail} قطعة
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                  {filteredProducts.length > 60 && (
                    <p className="text-[11px] text-slate-400 font-bold">
                      يتم عرض أول 60 نتيجة — اكتب جزء من الاسم أو الباركود لتضييق البحث
                    </p>
                  )}
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl border border-[#E6DECD] bg-[#FAF6ED]/70 space-y-3">
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
                          الفرع المحدد: <strong className="text-slate-900">{selectedBranchObj?.name || 'الفرع'}</strong>
                        </span>
                        {form.product_type === 'rental' ? (
                          <>
                            {selectedProduct.color && (
                              <span>
                                اللون: <strong className="text-slate-900">{selectedProduct.color}</strong>
                              </span>
                            )}
                            {selectedProduct.size_cut && (
                              <span>
                                المقاس: <strong className="text-slate-900">{selectedProduct.size_cut}</strong>
                              </span>
                            )}
                            <span>
                              المتاح بالفرع: <strong className="text-emerald-700">{selectedProduct.stock_level ?? 0} قطعة</strong>
                            </span>
                          </>
                        ) : (
                          <span>
                            المتاح بالفرع: <strong className="text-emerald-700">{branchAvailabilityEntry?.stock_level ?? selectedProduct.stock_level ?? 0} قطعة</strong>
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        resetProductSelection();
                        setForm((prev) => ({
                          ...prev,
                          product_id: '',
                          quantity: 1,
                          color_name: '',
                          size_name: '',
                          estimated_loss: 0,
                        }));
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-black bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>تغيير المنتج</span>
                    </button>
                  </div>

                  {/* Sales Multi-Color & Size Variant Panel */}
                  {form.product_type === 'sales' && (
                    <div className="bg-white rounded-xl border border-[#E6DECD] p-3 space-y-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                          <Layers className="w-4 h-4 text-amber-700" />
                          <span>الألوان والمقاسات المتوفرة في {selectedBranchObj?.name || 'الفرع'}</span>
                        </div>
                        {usingVariantPicker && (
                          <span className="text-xs font-black px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                            المحدد للتلف: {totalSelectedQty} قطعة
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
                                  <span>كل الألوان ({branchVariantList.reduce((s, v) => s + Number(v.stock_level || 0), 0)})</span>
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

                          {/* Size Cards Grid with Steppers */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-0.5">
                            {visibleVariants.map((v) => {
                              const k = getVariantKey(v);
                              const avail = Number(v.stock_level || 0);
                              const picked = Number(selectedVariants[k] || 0);
                              const maxAllowed = form.deduct_stock ? avail : 9999;
                              const isOutOfStock = form.deduct_stock && avail <= 0;
                              const overCap = form.deduct_stock && picked > avail;

                              return (
                                <div
                                  key={k}
                                  className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                                    overCap
                                      ? 'border-rose-400 bg-rose-50/70'
                                      : picked > 0
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
                                    <div className={`text-[11px] font-bold mt-0.5 ${overCap ? 'text-rose-600' : 'text-emerald-700'}`}>
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
                                      max={form.deduct_stock ? avail : undefined}
                                      disabled={isOutOfStock}
                                      value={picked}
                                      onChange={(e) => updateVariantQty(v, e.target.value)}
                                      className="w-12 h-7 text-center text-xs font-black rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
                                    />
                                    <button
                                      type="button"
                                      disabled={isOutOfStock || picked >= maxAllowed}
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

                          {/* Selected Variants Chips Summary */}
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
                        <div className="space-y-3">
                          <p className="text-xs font-bold text-slate-500">
                            {form.deduct_stock && Number(branchAvailabilityEntry?.stock_level ?? selectedProduct.stock_level ?? 0) <= 0
                              ? 'لا يوجد رصيد متاح لهذا الصنف في الفرع المحدد. يمكنك إلغاء "خصم الكمية تلقائياً" لتسجيل التالف يدوياً بدون خصم.'
                              : 'صنف بدون مقاسات مفصلة — حدد اللون/المقاس (اختياري) والكمية التالفة:'}
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <Input
                              placeholder="اللون (اختياري)"
                              value={form.color_name}
                              onChange={(e) => setForm((prev) => ({ ...prev, color_name: e.target.value }))}
                            />
                            <Input
                              placeholder="المقاس (اختياري)"
                              value={form.size_name}
                              onChange={(e) => setForm((prev) => ({ ...prev, size_name: e.target.value }))}
                            />
                            <div className="flex items-center gap-1 justify-end" dir="ltr">
                              <button
                                type="button"
                                disabled={Number(form.quantity || 0) <= 1}
                                onClick={() => setForm((prev) => ({ ...prev, quantity: Math.max(1, Number(prev.quantity || 1) - 1) }))}
                                className="w-9 h-10 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center text-slate-700 disabled:opacity-40"
                              >
                                <Minus className="w-4 h-4" />
                              </button>
                              <Input
                                type="number"
                                min="1"
                                max={
                                  form.deduct_stock
                                    ? Math.max(1, Number(branchAvailabilityEntry?.stock_level ?? selectedProduct.stock_level ?? 0))
                                    : undefined
                                }
                                value={form.quantity}
                                onChange={(e) => setForm((prev) => ({ ...prev, quantity: Number(e.target.value) }))}
                              />
                              <button
                                type="button"
                                disabled={
                                  form.deduct_stock &&
                                  Number(form.quantity || 0) >= Number(branchAvailabilityEntry?.stock_level ?? selectedProduct.stock_level ?? 0)
                                }
                                onClick={() => setForm((prev) => ({ ...prev, quantity: Number(prev.quantity || 0) + 1 }))}
                                className="w-9 h-10 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center text-slate-700 disabled:opacity-40"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Rental Item Quantity Stepper */}
                  {form.product_type === 'rental' && (
                    <div className="bg-white rounded-xl border border-[#E6DECD] p-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-black text-slate-900">الكمية التالفة من قطعة التأجير</div>
                        <div className="text-[11px] font-bold text-slate-500 mt-0.5">
                          الحد المتاح بالفرع: {selectedProduct.stock_level ?? 0} قطعة
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5" dir="ltr">
                        <button
                          type="button"
                          disabled={Number(form.quantity || 0) <= 1}
                          onClick={() => setForm((prev) => ({ ...prev, quantity: Math.max(1, Number(prev.quantity || 1) - 1) }))}
                          className="w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center text-slate-700 disabled:opacity-40"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          min="1"
                          max={form.deduct_stock ? Math.max(1, Number(selectedProduct.stock_level || 0)) : undefined}
                          value={form.quantity}
                          onChange={(e) => setForm((prev) => ({ ...prev, quantity: Number(e.target.value) }))}
                          className="w-14 h-8 text-center text-xs font-black rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
                        />
                        <button
                          type="button"
                          disabled={form.deduct_stock && Number(form.quantity || 0) >= Number(selectedProduct.stock_level || 0)}
                          onClick={() => setForm((prev) => ({ ...prev, quantity: Number(prev.quantity || 0) + 1 }))}
                          className="w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center text-slate-700 disabled:opacity-40"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5">
                إجمالي الكمية التالفة
              </label>
              <Input
                type="number"
                min="1"
                readOnly={usingVariantPicker}
                required
                value={totalSelectedQty}
                onChange={(e) => {
                  if (usingVariantPicker) return;
                  setForm((prev) => ({ ...prev, quantity: Number(e.target.value) }));
                }}
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5">
                الخسارة التقديرية (ج.م)
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.estimated_loss}
                onChange={(e) => {
                  setLossManuallyEdited(true);
                  setForm((prev) => ({ ...prev, estimated_loss: e.target.value }));
                }}
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5">
                درجة التلف
              </label>
              <select
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
                value={form.condition}
                onChange={(e) => setForm({ ...form, condition: e.target.value })}
              >
                <option value="worn">مهترئ / انتهاء العمر الافتراضي</option>
                <option value="damaged">تالف / مقطوع / كسر</option>
                <option value="lost">مفقود</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5">
                تاريخ التسجيل
              </label>
              <Input
                type="date"
                required
                value={form.occurred_at}
                onChange={(e) => setForm({ ...form, occurred_at: e.target.value })}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded text-slate-900 focus:ring-slate-900"
                  checked={form.deduct_stock}
                  onChange={(e) => setForm({ ...form, deduct_stock: e.target.checked })}
                />
                <div>
                  <span className="text-xs font-black text-slate-900 block">
                    خصم الكمية تلقائياً من مخزون الفرع
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500 block">
                    سيتم إنقاص رصيد المخزون مباشرة بمقدار الكمية المحددة
                  </span>
                </div>
              </label>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-black text-slate-700 mb-1.5">
                سبب التلف
              </label>
              <Input
                placeholder="مثال: تمزق أثناء القياس، بهتان ألوان، تلف بسحاب..."
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-black text-slate-700 mb-1.5">
                ملاحظات إضافية
              </label>
              <textarea
                className="w-full p-3 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 min-h-[80px]"
                placeholder="أي تفاصيل أخرى خاصة بالقطعة أو المحضر..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowModal(false)}
              disabled={submitting}
            >
              إلغاء
            </Button>
            <Button type="submit" variant="danger" loading={submitting}>
              تسجيل واستبعاد القطعة
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default WornProducts;
