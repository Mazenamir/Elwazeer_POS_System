import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
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
  DollarSign,
  TrendingDown,
  CheckCircle,
  FileText,
  Filter,
} from 'lucide-react';

export function WornProducts() {
  const { user } = useAuth();
  const { branches, currentBranchId, activeBranchId, isMultiBranch } = useBranch();
  const { toast } = useToast();

  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({
    records: 0,
    quantity: 0,
    month_quantity: 0,
    estimated_loss: 0,
  });
  const [loading, setLoading] = useState(true);

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

  const [form, setForm] = useState({
    product_type: 'sales',
    product_id: '',
    branch_id: '',
    quantity: 1,
    condition: 'worn',
    reason: '',
    estimated_loss: 0,
    notes: '',
    occurred_at: new Date().toISOString().split('T')[0],
    deduct_stock: true,
  });

  const isBranchScoped = user?.role === 'branch_user' || user?.role === 'cashier' || user?.role === 'tailor';

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
  }, [loadRecords]);

  // Load products for modal autocomplete
  const loadProducts = useCallback(async (type, branchId, query = '') => {
    try {
      setLoadingProducts(true);
      const params = new URLSearchParams({ page: 1, limit: 40 });
      if (branchId) params.set('branch_id', branchId);
      if (query.trim()) params.set('search', query.trim());

      const endpoint = type === 'rental' ? '/rental-inventory' : '/inventory';
      const res = await client.get(`${endpoint}?${params.toString()}`);
      const data = res.data;
      setProductsList(Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : []);
    } catch {
      setProductsList([]);
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  const openAddModal = () => {
    const defaultBranch = isBranchScoped ? user.branch_id : (currentBranchId || (branches[0]?.id ? String(branches[0].id) : '1'));
    setForm({
      product_type: 'sales',
      product_id: '',
      branch_id: String(defaultBranch),
      quantity: 1,
      condition: 'worn',
      reason: '',
      estimated_loss: 0,
      notes: '',
      occurred_at: new Date().toISOString().split('T')[0],
      deduct_stock: true,
    });
    setProductSearch('');
    setShowModal(true);
    loadProducts('sales', defaultBranch, '');
  };

  const handleProductTypeChange = (type) => {
    setForm((prev) => ({ ...prev, product_type: type, product_id: '' }));
    loadProducts(type, form.branch_id, productSearch);
  };

  const handleBranchChange = (branchId) => {
    setForm((prev) => ({ ...prev, branch_id: branchId, product_id: '' }));
    loadProducts(form.product_type, branchId, productSearch);
  };

  const handleProductSearchChange = (val) => {
    setProductSearch(val);
    loadProducts(form.product_type, form.branch_id, val);
  };

  const handleProductSelect = (pId) => {
    const prod = productsList.find((p) => String(p.id) === String(pId));
    setForm((prev) => ({
      ...prev,
      product_id: pId,
      estimated_loss: prod ? (Number(prod.cost_price || prod.purchase_price || prod.price || 0) * (prev.quantity || 1)) : prev.estimated_loss,
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.product_id) {
      toast({ title: 'تنبيه', message: 'يرجى اختيار المنتج التالف', variant: 'warning' });
      return;
    }
    if (!form.quantity || Number(form.quantity) <= 0) {
      toast({ title: 'تنبيه', message: 'يرجى إدخال كمية صحيحة أكبر من الصفر', variant: 'warning' });
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        product_type: form.product_type,
        branch_id: Number(form.branch_id),
        quantity: Number(form.quantity),
        condition: form.condition,
        reason: form.reason.trim(),
        estimated_loss: Number(form.estimated_loss || 0),
        notes: form.notes.trim(),
        occurred_at: form.occurred_at,
        deduct_stock: form.deduct_stock,
      };

      if (form.product_type === 'rental') {
        payload.rental_inventory_id = Number(form.product_id);
      } else {
        payload.inventory_id = Number(form.product_id);
      }

      await client.post('/worn-products', payload);
      toast({
        title: 'تم بنجاح',
        message: 'تم تسجيل المنتج التالف وتحديث المخزون بنجاح',
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
        <Button variant="danger" icon={Plus} onClick={openAddModal}>
          تسجيل قطعة تالفة
        </Button>
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
                <th className="py-3 px-4 rounded-l-xl">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6DECD]/60 text-sm">
              {loading ? (
                <tr>
                  <td
                    colSpan={isBranchScoped ? 8 : 9}
                    className="py-12 text-center text-slate-400 font-bold"
                  >
                    جارِ تحميل البيانات...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td
                    colSpan={isBranchScoped ? 8 : 9}
                    className="py-16 text-center text-slate-400 font-bold"
                  >
                    <AlertTriangle className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                    لا توجد منتجات تالفة مسجلة تطابق معايير البحث
                  </td>
                </tr>
              ) : (
                records.map((r) => (
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
                      <div className="font-black text-slate-900">
                        {r.product_name || 'منتج غير معروف'}
                      </div>
                      <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                        <span className="font-mono text-indigo-600 font-bold">كود: #{r.product_id}</span>
                        {r.product_barcode && <span>• باركود: #{r.product_barcode}</span>}
                        {r.product_color && <span>• {r.product_color}</span>}
                        {r.product_size && <span>• مقاس: {r.product_size}</span>}
                      </div>
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
                    <td className="py-3.5 px-4 font-black text-rose-600">
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
                        className="text-xs font-black py-1.5 px-2.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
                        value={r.status || 'recorded'}
                        onChange={(e) => handleStatusChange(r.id, e.target.value)}
                      >
                        <option value="recorded">مسجل</option>
                        <option value="reviewed">تمت المراجعة</option>
                        <option value="disposed">تم التخلص</option>
                      </select>
                    </td>
                  </tr>
                ))
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
              <div className="space-y-2">
                <Input
                  placeholder="ابحث بالاسم أو الباركود أو اللون..."
                  icon={Search}
                  value={productSearch}
                  onChange={(e) => handleProductSearchChange(e.target.value)}
                />
                <select
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  value={form.product_id}
                  onChange={(e) => handleProductSelect(e.target.value)}
                  required
                >
                  <option value="">-- اضغط لاختيار المنتج من القائمة --</option>
                  {productsList.map((p) => {
                    const label = [
                      p.name,
                      p.barcode ? `#${p.barcode}` : '',
                      p.color ? `لون: ${p.color}` : '',
                      p.size_cut || p.size ? `مقاس: ${p.size_cut || p.size}` : '',
                      `[المتاح: ${p.stock_level ?? 0} قطعة]`,
                    ]
                      .filter(Boolean)
                      .join(' - ');
                    return (
                      <option key={p.id} value={p.id}>
                        {label}
                      </option>
                    );
                  })}
                </select>
                {loadingProducts && (
                  <p className="text-[11px] text-slate-400 font-bold">جارِ البحث في المخزون...</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5">
                الكمية التالفة
              </label>
              <Input
                type="number"
                min="1"
                required
                value={form.quantity}
                onChange={(e) => {
                  const qty = Number(e.target.value);
                  setForm((prev) => {
                    const prod = productsList.find((p) => String(p.id) === String(prev.product_id));
                    const unitPrice = prod ? Number(prod.cost_price || prod.purchase_price || prod.price || 0) : 0;
                    return {
                      ...prev,
                      quantity: qty,
                      estimated_loss: unitPrice ? unitPrice * qty : prev.estimated_loss,
                    };
                  });
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
                onChange={(e) => setForm({ ...form, estimated_loss: e.target.value })}
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
