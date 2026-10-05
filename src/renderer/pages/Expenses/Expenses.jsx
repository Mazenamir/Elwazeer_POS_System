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
import client from '../../api/client';
import {
  Receipt,
  Plus,
  Search,
  Calendar,
  DollarSign,
  TrendingDown,
  Filter,
  RotateCcw,
  Building,
  Zap,
  Flame,
  Coffee,
  Wrench,
  Megaphone,
  MoreHorizontal,
  FileSpreadsheet,
} from 'lucide-react';

const CATEGORIES = [
  { id: 'rent', name: 'إيجار', icon: Building, color: 'text-blue-600 bg-blue-50 border-blue-100' },
  { id: 'electricity', name: 'كهرباء', icon: Zap, color: 'text-amber-600 bg-amber-50 border-amber-100' },
  { id: 'gas', name: 'غاز ومياه', icon: Flame, color: 'text-orange-600 bg-orange-50 border-orange-100' },
  { id: 'labor', name: 'عمالة وبوفيه وضيافة', icon: Coffee, color: 'text-purple-600 bg-purple-50 border-purple-100' },
  { id: 'maintenance', name: 'صيانة وتصليحات', icon: Wrench, color: 'text-rose-600 bg-rose-50 border-rose-100' },
  { id: 'marketing', name: 'تسويق وإعلانات', icon: Megaphone, color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
  { id: 'bonus', name: 'مستلزمات وقطع', icon: DollarSign, color: 'text-indigo-600 bg-indigo-50 border-indigo-100' },
  { id: 'other', name: 'مصروفات أخرى', icon: MoreHorizontal, color: 'text-slate-600 bg-slate-100 border-slate-200' },
];

export function Expenses() {
  const { user } = useAuth();
  const { branches, currentBranchId } = useBranch();
  const { toast } = useToast();

  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState({ today: 0, month: 0 });
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterBranch, setFilterBranch] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');

  // Pagination
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1,
  });

  // Add Expense Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    branch_id: '',
    category: 'labor',
    amount: '',
    expense_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const isBranchScoped = user?.role === 'branch_user' || user?.role === 'cashier' || user?.role === 'tailor';

  // Load Expenses & Summary
  const loadExpenses = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.page,
        limit: pagination.limit,
      });

      if (filterBranch !== 'all') params.set('branch_id', filterBranch);
      if (filterCategory !== 'all') params.set('category', filterCategory);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      if (minAmount) params.set('min_amount', minAmount);
      if (maxAmount) params.set('max_amount', maxAmount);

      const [listRes, summaryRes] = await Promise.all([
        client.get(`/expenses?${params.toString()}`),
        client.get(`/expenses/summary?${params.toString()}`),
      ]);

      const listData = listRes.data;
      if (listData && Array.isArray(listData.data)) {
        setExpenses(listData.data);
        if (listData.pagination) setPagination(listData.pagination);
      } else if (Array.isArray(listData)) {
        setExpenses(listData);
      } else {
        setExpenses([]);
      }

      if (summaryRes.data) {
        setSummary(summaryRes.data);
      }
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر تحميل المصروفات',
        variant: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filterBranch, filterCategory, dateFrom, dateTo, minAmount, maxAmount, toast]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  const handleOpenAdd = () => {
    const defaultBranch = isBranchScoped ? user.branch_id : (currentBranchId || branches[0]?.id || '1');
    setForm({
      branch_id: String(defaultBranch),
      category: 'labor',
      amount: '',
      expense_date: new Date().toISOString().split('T')[0],
      notes: '',
    });
    setShowAddModal(true);
  };

  const handleCreateExpense = async (e) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) {
      toast({ title: 'تنبيه', message: 'يرجى إدخال مبلغ صحيح', variant: 'warning' });
      return;
    }

    try {
      setSubmitting(true);
      await client.post('/expenses', {
        branch_id: Number(form.branch_id),
        category: form.category,
        amount: Number(form.amount),
        expense_date: form.expense_date,
        notes: form.notes.trim() || null,
      });

      toast({
        title: 'تم بنجاح',
        message: 'تم تسجيل المصروف وقيده بالخزينة',
        variant: 'success',
      });

      setShowAddModal(false);
      loadExpenses();
    } catch (err) {
      toast({
        title: 'تعذر الحفظ',
        message: err.message || 'حدث خطأ أثناء تسجيل المصروف',
        variant: 'danger',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const clearFilters = () => {
    setFilterBranch('all');
    setFilterCategory('all');
    setDateFrom('');
    setDateTo('');
    setMinAmount('');
    setMaxAmount('');
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const formatCurrency = (val) => {
    return `${Number(val || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ج.م`;
  };

  const getCategoryObj = (catId) => {
    return CATEGORIES.find((c) => c.id === catId) || {
      name: catId || 'أخرى',
      color: 'text-slate-600 bg-slate-100 border-slate-200',
    };
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shadow-sm">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                إدارة المصروفات التشغيلية
              </h1>
              <p className="text-sm font-semibold text-slate-500 mt-0.5">
                تسجيل ومتابعة نثريات الفروع، الإيجار، المرافق، وضيافة العملاء
              </p>
            </div>
          </div>
        </div>
        <Button variant="danger" icon={Plus} onClick={handleOpenAdd}>
          تسجيل مصروف جديد
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="مصروفات اليوم"
          value={formatCurrency(summary.today)}
          icon={Calendar}
          variant="danger"
          subtitle="إجمالي ما تم صرفه اليوم"
        />
        <StatCard
          title="مصروفات الشهر الحالي"
          value={formatCurrency(summary.month)}
          icon={TrendingDown}
          variant="warning"
          subtitle="تراكمي مصروفات هذا الشهر"
        />
        <StatCard
          title="عدد الفواتير المسجلة"
          value={pagination.total || expenses.length}
          icon={Receipt}
          variant="primary"
          subtitle="حركة صرف مسجلة"
        />
        <StatCard
          title="متوسط حركة الصرف"
          value={
            expenses.length > 0
              ? formatCurrency(
                  expenses.reduce((acc, x) => acc + Number(x.amount || 0), 0) / expenses.length
                )
              : '0.00 ج.م'
          }
          icon={DollarSign}
          variant="info"
          subtitle="متوسط قيمة الإيصال"
        />
      </div>

      {/* Smart Filters */}
      <Card>
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-black text-slate-800">فلتر ذكي للمصروفات</span>
            </div>
            <button
              onClick={clearFilters}
              className="text-xs font-bold text-slate-500 hover:text-slate-900 flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              إعادة تعيين
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">من تاريخ</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">إلى تاريخ</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
              />
            </div>

            {!isBranchScoped && (
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">الفرع</label>
                <select
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  value={filterBranch}
                  onChange={(e) => {
                    setFilterBranch(e.target.value);
                    setPagination((p) => ({ ...p, page: 1 }));
                  }}
                >
                  <option value="all">كل الفروع</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">البند / الفئة</label>
              <select
                className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
                value={filterCategory}
                onChange={(e) => {
                  setFilterCategory(e.target.value);
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
              >
                <option value="all">كل الفئات</option>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">المبلغ من</label>
              <Input
                type="number"
                min="0"
                placeholder="0"
                value={minAmount}
                onChange={(e) => {
                  setMinAmount(e.target.value);
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">المبلغ إلى</label>
              <Input
                type="number"
                min="0"
                placeholder="بلا حد"
                value={maxAmount}
                onChange={(e) => {
                  setMaxAmount(e.target.value);
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Expenses Table */}
      <Card>
        <CardHeader
          title="سجل المصروفات"
          subtitle={`المعروض: ${expenses.length} حركة`}
        />

        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-xs font-black">
                <th className="py-3.5 px-4">التاريخ</th>
                {!isBranchScoped && <th className="py-3.5 px-4">الفرع</th>}
                <th className="py-3.5 px-4">البند / الفئة</th>
                <th className="py-3.5 px-4">المبلغ</th>
                <th className="py-3.5 px-4">البيان والملاحظات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td
                    colSpan={isBranchScoped ? 4 : 5}
                    className="py-12 text-center text-slate-400 font-bold"
                  >
                    جارِ تحميل المصروفات...
                  </td>
                </tr>
              ) : expenses.length === 0 ? (
                <tr>
                  <td
                    colSpan={isBranchScoped ? 4 : 5}
                    className="py-16 text-center text-slate-400 font-bold"
                  >
                    <Receipt className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                    لا توجد مصروفات مسجلة تطابق اختياراتك
                  </td>
                </tr>
              ) : (
                expenses.map((exp) => {
                  const cat = getCategoryObj(exp.category);
                  return (
                    <tr key={exp.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-600 whitespace-nowrap">
                        {new Date(exp.expense_date || exp.created_at).toLocaleDateString(
                          'ar-EG-u-nu-latn'
                        )}
                      </td>

                      {!isBranchScoped && (
                        <td className="py-3.5 px-4 font-black text-slate-800">
                          {exp.branch_name || 'الفرع الرئيسي'}
                        </td>
                      )}

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border ${cat.color}`}
                        >
                          {cat.name}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-black text-rose-600 whitespace-nowrap">
                        {formatCurrency(exp.amount)}
                      </td>

                      <td className="py-3.5 px-4 text-xs font-bold text-slate-600 max-w-md">
                        {exp.notes || '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              صفحة {pagination.page} من {pagination.totalPages} (إجمالي {pagination.total})
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() =>
                  setPagination((p) => ({ ...p, page: Math.max(1, p.page - 1) }))
                }
              >
                السابق
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() =>
                  setPagination((p) => ({ ...p, page: Math.min(p.totalPages, p.page + 1) }))
                }
              >
                التالي
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Add Expense Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="تسجيل مصروف تشغيلي جديد"
        size="md"
      >
        <form onSubmit={handleCreateExpense} className="space-y-4">
          <div className="space-y-3">
            {!isBranchScoped && (
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">
                  الفرع *
                </label>
                <select
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  value={form.branch_id}
                  onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
                  required
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5">
                بند المصروف *
              </label>
              <select
                className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                required
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5">
                المبلغ (ج.م) *
              </label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                required
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5">
                تاريخ الصرف *
              </label>
              <Input
                type="date"
                required
                value={form.expense_date}
                onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5">
                البيان / تفاصيل الصرف
              </label>
              <textarea
                className="w-full p-3 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 min-h-[90px]"
                placeholder="مثال: فاتورة كهرباء شهر 9، شاي وسكر للبوفيه، إصلاح مكيف..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAddModal(false)}
              disabled={submitting}
            >
              إلغاء
            </Button>
            <Button type="submit" variant="danger" loading={submitting}>
              قيد وصرف المبلغ
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default Expenses;
