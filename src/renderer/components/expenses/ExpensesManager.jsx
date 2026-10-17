import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardHeader } from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import Badge from '../ui/Badge';
import StatCard from '../ui/StatCard';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import { useToast } from '../../context/ToastContext';
import client from '../../services/api/client';
import expensesService from '../../services/api/expenses.service';
import {
  Receipt,
  Plus,
  Search,
  Calendar,
  DollarSign,
  TrendingDown,
  Filter,
  RotateCcw,
  Building2,
  Zap,
  Flame,
  Coffee,
  Wrench,
  Megaphone,
  MoreHorizontal,
  Wallet,
  CreditCard,
  Landmark,
  Smartphone,
  Edit3,
  Trash2,
  Clock,
  User,
  AlertCircle,
  CheckCircle2,
  Info,
} from 'lucide-react';

export const EXPENSE_CATEGORIES = [
  { id: 'rent', name: 'إيجار', icon: Building2, color: 'text-blue-600 bg-blue-50 border-blue-100' },
  { id: 'electricity', name: 'كهرباء', icon: Zap, color: 'text-amber-600 bg-amber-50 border-amber-100' },
  { id: 'gas', name: 'غاز ومياه', icon: Flame, color: 'text-orange-600 bg-orange-50 border-orange-100' },
  { id: 'labor', name: 'عمالة وبوفيه وضيافة', icon: Coffee, color: 'text-purple-600 bg-purple-50 border-purple-100' },
  { id: 'maintenance', name: 'صيانة وتصليحات', icon: Wrench, color: 'text-rose-600 bg-rose-50 border-rose-100' },
  { id: 'marketing', name: 'تسويق وإعلانات', icon: Megaphone, color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
  { id: 'bonus', name: 'مكسرات ومكافآت', icon: DollarSign, color: 'text-indigo-600 bg-indigo-50 border-indigo-100' },
  { id: 'other', name: 'مصروفات أخرى', icon: MoreHorizontal, color: 'text-slate-600 bg-slate-100 border-slate-200' },
];

export const PAYMENT_METHODS = [
  {
    id: 'cash',
    name: 'نقدي (درج الكاشير)',
    icon: Wallet,
    color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    drawerEffect: true,
  },
  {
    id: 'card',
    name: 'فيزا / بطاقة بنكية',
    icon: CreditCard,
    color: 'text-blue-700 bg-blue-50 border-blue-200',
    drawerEffect: false,
  },
  {
    id: 'bank_transfer',
    name: 'تحويل بنكي / InstaPay',
    icon: Landmark,
    color: 'text-indigo-700 bg-indigo-50 border-indigo-200',
    drawerEffect: false,
  },
  {
    id: 'wallet',
    name: 'محفظة إلكترونية',
    icon: Smartphone,
    color: 'text-purple-700 bg-purple-50 border-purple-200',
    drawerEffect: false,
  },
];

export function ExpensesManager({ isCashierTab = false }) {
  const { user, isAdmin } = useAuth();
  const { branches, activeBranchId } = useBranch();
  const toast = useToast();

  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState({
    today: 0,
    month: 0,
    period_total: 0,
    cash_total: 0,
    non_cash_total: 0,
    count: 0,
  });
  const [cashiersList, setCashiersList] = useState([]);
  const [employeesList, setEmployeesList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterBranch, setFilterBranch] = useState(isCashierTab && activeBranchId !== 'all' ? activeBranchId : 'all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterPaymentMethod, setFilterPaymentMethod] = useState('all');
  const [filterCashier, setFilterCashier] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');

  // Keep branch locked if inside cashier tab
  useEffect(() => {
    if (isCashierTab && activeBranchId && activeBranchId !== 'all') {
      setFilterBranch(activeBranchId);
    }
  }, [isCashierTab, activeBranchId]);

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
    payment_method: 'cash',
    expense_date: new Date().toISOString().split('T')[0],
    notes: '',
    employee_id: '',
  });

  // Edit Expense Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    id: null,
    branch_id: '',
    category: 'labor',
    amount: '',
    payment_method: 'cash',
    expense_date: '',
    notes: '',
  });
  const [editingSubmitting, setEditingSubmitting] = useState(false);

  // Delete Expense Modal
  const [expenseToDelete, setExpenseToDelete] = useState(null);
  const [deletingSubmitting, setDeletingSubmitting] = useState(false);

  const isBranchScoped = !isAdmin && (user?.role === 'branch_user' || user?.role === 'cashier' || isCashierTab);

  // Load cashiers & employees for selects
  useEffect(() => {
    expensesService
      .getCashiers()
      .then((res) => {
        if (Array.isArray(res)) setCashiersList(res);
        else if (Array.isArray(res?.data)) setCashiersList(res.data);
      })
      .catch(() => {});

    client
      .get('/employees/options')
      .then((res) => {
        const data = res?.employees || res || [];
        if (Array.isArray(data)) setEmployeesList(data);
      })
      .catch(() => {
        client
          .get('/employees')
          .then((res) => {
            const list = res?.data || res || [];
            if (Array.isArray(list)) setEmployeesList(list);
          })
          .catch(() => {});
      });
  }, []);

  // Fetch Expenses & Summary
  const loadExpenses = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        page: pagination.page,
        limit: pagination.limit,
      };

      if (filterBranch && filterBranch !== 'all') params.branch_id = filterBranch;
      if (filterCategory && filterCategory !== 'all') params.category = filterCategory;
      if (filterPaymentMethod && filterPaymentMethod !== 'all') params.payment_method = filterPaymentMethod;
      if (filterCashier && filterCashier !== 'all') params.cashier_id = filterCashier;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (minAmount) params.min_amount = minAmount;
      if (maxAmount) params.max_amount = maxAmount;

      const [listRes, summaryRes] = await Promise.all([
        expensesService.list(params),
        expensesService.getSummary(params),
      ]);

      const listData = listRes?.data || listRes;
      if (listData && Array.isArray(listData.data)) {
        setExpenses(listData.data);
        if (listData.pagination) setPagination((p) => ({ ...p, ...listData.pagination }));
      } else if (Array.isArray(listData)) {
        setExpenses(listData);
      } else {
        setExpenses([]);
      }

      if (summaryRes) {
        setSummary(summaryRes);
      }
    } catch (err) {
      toast.error(err.message || 'تعذر تحميل المصروفات');
    } finally {
      setLoading(false);
    }
  }, [
    pagination.page,
    pagination.limit,
    filterBranch,
    filterCategory,
    filterPaymentMethod,
    filterCashier,
    dateFrom,
    dateTo,
    searchQuery,
    minAmount,
    maxAmount,
    toast,
  ]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  // Open Add Modal
  const handleOpenAdd = () => {
    const defaultBranch = isBranchScoped
      ? user?.branch_id || activeBranchId
      : activeBranchId && activeBranchId !== 'all'
      ? activeBranchId
      : branches[0]?.id || '1';

    setForm({
      branch_id: String(defaultBranch || '1'),
      category: 'labor',
      amount: '',
      payment_method: 'cash',
      expense_date: new Date().toISOString().split('T')[0],
      notes: '',
      employee_id: '',
    });
    setShowAddModal(true);
  };

  // Submit New Expense
  const handleCreateExpense = async (e) => {
    e.preventDefault();
    const parsedAmount = Number(form.amount);
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error('يرجى إدخال مبلغ صحيح أكبر من الصفر');
      return;
    }

    if (form.category === 'bonus' && !form.employee_id) {
      toast.error('يرجى اختيار الموظف للمكافأة / المكسرات');
      return;
    }

    try {
      setSubmitting(true);
      await expensesService.create({
        branch_id: Number(form.branch_id),
        category: form.category,
        amount: parsedAmount,
        payment_method: form.payment_method,
        expense_date: form.expense_date,
        notes: form.notes.trim() || null,
        employee_id: form.category === 'bonus' ? Number(form.employee_id) : undefined,
      });

      toast.success(
        form.payment_method === 'cash'
          ? 'تم تسجيل المصروف وقيده بخصم من درج الكاشير والخزينة 💵'
          : 'تم تسجيل المصروف الإلكتروني بنجاح (بدون خصم من الدرج النقدي) 💳'
      );

      setShowAddModal(false);
      loadExpenses();
    } catch (err) {
      toast.error(err.message || 'حدث خطأ أثناء تسجيل المصروف');
    } finally {
      setSubmitting(false);
    }
  };

  const cleanNotes = (text) => {
    if (!text) return '';
    return text.replace(/\s*\[EXP-[a-zA-Z0-9-]+\]\s*/g, ' ').trim();
  };

  // Open Edit Modal
  const handleOpenEdit = (exp) => {
    setEditForm({
      id: exp.id,
      branch_id: String(exp.branch_id),
      category: exp.category || 'other',
      amount: String(exp.amount),
      payment_method: exp.payment_method || 'cash',
      expense_date: exp.expense_date ? exp.expense_date.split('T')[0] : '',
      notes: cleanNotes(exp.notes),
    });
    setShowEditModal(true);
  };

  // Submit Edit Expense
  const handleUpdateExpense = async (e) => {
    e.preventDefault();
    const parsedAmount = Number(editForm.amount);
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error('يرجى إدخال مبلغ صحيح أكبر من الصفر');
      return;
    }

    try {
      setEditingSubmitting(true);
      await expensesService.update(editForm.id, {
        category: editForm.category,
        amount: parsedAmount,
        payment_method: editForm.payment_method,
        expense_date: editForm.expense_date,
        notes: editForm.notes.trim() || null,
      });

      toast.success('تم تعديل المصروف وحفظ التغييرات بنجاح');
      setShowEditModal(false);
      loadExpenses();
    } catch (err) {
      toast.error(err.message || 'حدث خطأ أثناء تعديل المصروف');
    } finally {
      setEditingSubmitting(false);
    }
  };

  // Confirm Delete
  const handleDeleteExpense = async () => {
    if (!expenseToDelete) return;
    try {
      setDeletingSubmitting(true);
      await expensesService.delete(expenseToDelete.id);
      toast.success('تم حذف المصروف بنجاح وتحديث الحسابات');
      setExpenseToDelete(null);
      loadExpenses();
    } catch (err) {
      toast.error(err.message || 'تعذر حذف المصروف');
    } finally {
      setDeletingSubmitting(false);
    }
  };

  const clearFilters = () => {
    setFilterBranch(isCashierTab && activeBranchId !== 'all' ? activeBranchId : 'all');
    setFilterCategory('all');
    setFilterPaymentMethod('all');
    setFilterCashier('all');
    setDateFrom('');
    setDateTo('');
    setSearchQuery('');
    setMinAmount('');
    setMaxAmount('');
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const formatCurrency = (val) => {
    const num = Number(val) || 0;
    return `${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
  };

  const formatDateTime = (dateStr, createdAtStr) => {
    if (!dateStr && !createdAtStr) return '-';
    try {
      const dt = new Date(createdAtStr || dateStr);
      const datePart = dt.toLocaleDateString('ar-EG-u-nu-latn');
      if (createdAtStr) {
        const timePart = dt.toLocaleTimeString('ar-EG-u-nu-latn', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });
        return `${datePart} ${timePart}`;
      }
      return datePart;
    } catch {
      return dateStr || '-';
    }
  };

  const getCategoryObj = (catId) => {
    return (
      EXPENSE_CATEGORIES.find((c) => c.id === catId) || {
        name: catId || 'أخرى',
        icon: MoreHorizontal,
        color: 'text-slate-600 bg-slate-100 border-slate-200',
      }
    );
  };

  const getPaymentMethodObj = (methodId) => {
    return (
      PAYMENT_METHODS.find((p) => p.id === methodId) || {
        name: methodId || 'نقدي',
        icon: Wallet,
        color: 'text-slate-700 bg-slate-50 border-slate-200',
        drawerEffect: methodId === 'cash',
      }
    );
  };

  // Check if current user can edit or delete this expense
  const canModify = (exp) => {
    if (isAdmin) return true;
    if (!exp.created_by) return true;
    return Number(exp.created_by) === Number(user?.id);
  };

  return (
    <div className="space-y-4" style={{ direction: 'rtl' }}>
      {/* Top Header Card */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shadow-sm shrink-0">
            <Wallet className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {isCashierTab ? 'المصروفات ونثريات الكاشير' : 'إدارة المصروفات التشغيلية'}
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-rose-100 text-rose-800">
                خزينة الفرع
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">
              قيد فوري للمصروفات، ومتابعة حركة النقدية الصادرة من درج الكاشير
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" icon={RotateCcw} onClick={loadExpenses} disabled={loading} size="sm">
            تحديث
          </Button>
          <Button variant="danger" icon={Plus} onClick={handleOpenAdd} size="sm" className="!px-5 !py-2.5 shadow-md">
            تسجيل مصروف جديد
          </Button>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="مصروفات اليوم"
          value={formatCurrency(summary.today)}
          icon={Calendar}
          variant="danger"
          subtitle="إجمالي ما تم صرفه اليوم بالفرع"
        />
        <StatCard
          title="المسحوب نقداً (من الدرج)"
          value={formatCurrency(summary.cash_total)}
          icon={Wallet}
          variant="warning"
          subtitle="يقلل النقدية المتوقعة بالخزينة"
        />
        <StatCard
          title="مصروفات غير نقدية (فيزا/تحويل)"
          value={formatCurrency(summary.non_cash_total)}
          icon={CreditCard}
          variant="info"
          subtitle="لا تؤثر على رصيد الكاش بالدرج"
        />
        <StatCard
          title="إجمالي فترة البحث"
          value={formatCurrency(summary.period_total)}
          icon={Receipt}
          variant="primary"
          subtitle={`${summary.count || expenses.length} حركة صرف مسجلة`}
        />
      </div>

      {/* Smart Filters Card */}
      <Card className="!p-4 bg-slate-50/70 border border-slate-200/80">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 mb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-black text-slate-800">فلاتر البحث الذكي للمصروفات</span>
          </div>
          <button
            onClick={clearFilters}
            className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            إعادة تعيين الفلاتر
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {/* Keyword Search */}
          <div className="lg:col-span-2">
            <label className="block text-[11px] font-bold text-slate-500 mb-1">بحث في البيان / الكاشير</label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
              <input
                type="text"
                placeholder="ابحث بالبيان، الملاحظات..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pr-9 pl-3 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-600 shadow-sm"
              />
            </div>
          </div>

          {/* Date From */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">من تاريخ</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPagination((p) => ({ ...p, page: 1 }));
              }}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-600 shadow-sm"
            />
          </div>

          {/* Date To */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">إلى تاريخ</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPagination((p) => ({ ...p, page: 1 }));
              }}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-600 shadow-sm"
            />
          </div>

          {/* Category Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">الفئة / البند</label>
            <select
              value={filterCategory}
              onChange={(e) => {
                setFilterCategory(e.target.value);
                setPagination((p) => ({ ...p, page: 1 }));
              }}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-600 shadow-sm"
            >
              <option value="all">كل الفئات</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Payment Method Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">طريقة الصرف</label>
            <select
              value={filterPaymentMethod}
              onChange={(e) => {
                setFilterPaymentMethod(e.target.value);
                setPagination((p) => ({ ...p, page: 1 }));
              }}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-600 shadow-sm"
            >
              <option value="all">كل الطرق</option>
              {PAYMENT_METHODS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Cashier Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">الكاشير / القائم بالصرف</label>
            <select
              value={filterCashier}
              onChange={(e) => {
                setFilterCashier(e.target.value);
                setPagination((p) => ({ ...p, page: 1 }));
              }}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-600 shadow-sm"
            >
              <option value="all">كل الكاشيرات</option>
              {cashiersList.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username}
                </option>
              ))}
            </select>
          </div>

          {/* Branch Filter (Only if Admin & not cashier tab) */}
          {!isCashierTab && isAdmin && (
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">الفرع</label>
              <select
                value={filterBranch}
                onChange={(e) => {
                  setFilterBranch(e.target.value);
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-600 shadow-sm"
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
        </div>
      </Card>

      {/* Expenses Table Card */}
      <Card className="!p-0 overflow-hidden border border-slate-200/80 shadow-sm">
        <div className="p-4 bg-white border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-indigo-600" />
            <h3 className="text-base font-black text-slate-900">سجل المصروفات والنثريات</h3>
            <span className="text-xs font-bold text-slate-400">({expenses.length} حركة معروضة)</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-xs font-black">
                <th className="py-3.5 px-4 whitespace-nowrap">التاريخ والوقت</th>
                {(!isCashierTab || isAdmin) && <th className="py-3.5 px-4 whitespace-nowrap">الفرع</th>}
                <th className="py-3.5 px-4 whitespace-nowrap">البند / الفئة</th>
                <th className="py-3.5 px-4 whitespace-nowrap">طريقة الدفع</th>
                <th className="py-3.5 px-4 whitespace-nowrap">المبلغ</th>
                <th className="py-3.5 px-4 whitespace-nowrap">المسؤول / الكاشير</th>
                <th className="py-3.5 px-4 min-w-[200px]">البيان والتفاصيل</th>
                <th className="py-3.5 px-4 text-center whitespace-nowrap">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm font-bold text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400 font-bold">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                      <span>جاري تحميل المصروفات...</span>
                    </div>
                  </td>
                </tr>
              ) : expenses.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400">
                    <Receipt className="w-12 h-12 mx-auto mb-2 text-slate-300 stroke-[1.5]" />
                    <p className="text-sm font-black text-slate-600">لا توجد مصروفات مسجلة</p>
                    <p className="text-xs text-slate-400 mt-1">
                      جرب تغيير خيارات الفلترة أو اضغط على تسجيل مصروف جديد
                    </p>
                  </td>
                </tr>
              ) : (
                expenses.map((exp) => {
                  const cat = getCategoryObj(exp.category);
                  const pay = getPaymentMethodObj(exp.payment_method);
                  const CatIcon = cat.icon || MoreHorizontal;
                  const PayIcon = pay.icon || Wallet;
                  const canAct = canModify(exp);

                  return (
                    <tr key={exp.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Date & Time */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-black text-slate-900 text-xs">
                          {formatDateTime(exp.expense_date, exp.created_at)}
                        </div>
                      </td>

                      {/* Branch */}
                      {(!isCashierTab || isAdmin) && (
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="text-xs font-extrabold text-slate-700">
                            {exp.branch_name || 'الفرع الرئيسي'}
                          </span>
                        </td>
                      )}

                      {/* Category */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-black border ${cat.color}`}
                        >
                          <CatIcon className="w-3.5 h-3.5 shrink-0" />
                          <span>{cat.name}</span>
                        </span>
                      </td>

                      {/* Payment Method */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-black border ${pay.color}`}
                        >
                          <PayIcon className="w-3.5 h-3.5 shrink-0" />
                          <span>{pay.name}</span>
                        </span>
                      </td>

                      {/* Amount */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="text-sm font-black text-rose-600">
                          {formatCurrency(exp.amount)}
                        </span>
                      </td>

                      {/* Cashier / User */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{exp.created_by_name || exp.cashier_name || 'النظام'}</span>
                        </div>
                      </td>

                      {/* Notes / Description */}
                      <td className="py-3.5 px-4 text-xs font-semibold text-slate-600 max-w-xs break-words">
                        {cleanNotes(exp.notes) || '-'}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleOpenEdit(exp)}
                            disabled={!canAct}
                            title={canAct ? 'تعديل المصروف' : 'غير مصرح بتعديل مصروفات الآخرين'}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setExpenseToDelete(exp)}
                            disabled={!canAct}
                            title={canAct ? 'حذف المصروف' : 'غير مصرح بحذف مصروفات الآخرين'}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {pagination.totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
            <span className="text-xs font-bold text-slate-500">
              صفحة {pagination.page} من {pagination.totalPages} (إجمالي {pagination.total} حركة)
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => setPagination((p) => ({ ...p, page: Math.max(1, p.page - 1) }))}
              >
                السابق
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPagination((p) => ({ ...p, page: Math.min(p.totalPages, p.page + 1) }))}
              >
                التالي
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ADD EXPENSE MODAL */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="تسجيل مصروف تشغيلي جديد 💵"
        subtitle="قيد حركة الصرف واختيار طريقة الدفع المناسبة"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleCreateExpense} className="space-y-4">
          <div className="space-y-3.5">
            {/* Branch Selection */}
            {!isCashierTab && isAdmin && (
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">الفرع *</label>
                <select
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-600"
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

            {/* Category */}
            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5">بند المصروف *</label>
              <select
                className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                required
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* If bonus category selected, show Employee dropdown */}
            {form.category === 'bonus' && (
              <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-1.5">
                <label className="block text-xs font-black text-indigo-900">اختر الموظف المستحق *</label>
                <select
                  className="w-full h-10 px-3 rounded-lg border border-indigo-200 bg-white font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  value={form.employee_id}
                  onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                  required
                >
                  <option value="">-- اختر الموظف --</option>
                  {employeesList.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} {emp.position ? `(${emp.position})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Amount & Payment Method Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">المبلغ (ج.م) *</label>
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
                <label className="block text-xs font-black text-slate-700 mb-1.5">طريقة الدفع *</label>
                <select
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  value={form.payment_method}
                  onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                  required
                >
                  {PAYMENT_METHODS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Drawer Impact Banner */}
            <div
              className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-bold ${
                form.payment_method === 'cash'
                  ? 'bg-amber-50 text-amber-900 border-amber-200'
                  : 'bg-blue-50 text-blue-900 border-blue-200'
              }`}
            >
              <Info className="w-4 h-4 shrink-0" />
              <span>
                {form.payment_method === 'cash'
                  ? 'تنبيه درج الكاشير: سيتم خصم هذا المبلغ فوراً من رصيد الكاش بالدرج والخزينة.'
                  : 'سداد إلكتروني / غير نقدي: لن يتم خصم هذا المبلغ من رصيد النقدية الفعلية بالدرج.'}
              </span>
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5">تاريخ المصروف *</label>
              <Input
                type="date"
                required
                value={form.expense_date}
                onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
              />
            </div>

            {/* Notes / Reason */}
            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5">البيان / تفاصيل الصرف والملاحظات</label>
              <textarea
                className="w-full p-3 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-600 min-h-[80px]"
                placeholder="اكتب سبب الصرف أو أية ملاحظات تفصيلية..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowAddModal(false)} disabled={submitting}>
              إلغاء
            </Button>
            <Button type="submit" variant="danger" isLoading={submitting} className="!px-6">
              تأكيد وقيد المصروف
            </Button>
          </div>
        </form>
      </Modal>

      {/* EDIT EXPENSE MODAL */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="تعديل بيانات المصروف ✏️"
        subtitle={`تعديل حركة الصرف #${editForm.id}`}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleUpdateExpense} className="space-y-4">
          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5">بند المصروف *</label>
              <select
                className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                value={editForm.category}
                onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                required
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">المبلغ (ج.م) *</label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={editForm.amount}
                  onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">طريقة الدفع *</label>
                <select
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  value={editForm.payment_method}
                  onChange={(e) => setEditForm({ ...editForm, payment_method: e.target.value })}
                  required
                >
                  {PAYMENT_METHODS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5">تاريخ المصروف *</label>
              <Input
                type="date"
                required
                value={editForm.expense_date}
                onChange={(e) => setEditForm({ ...editForm, expense_date: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5">البيان / تفاصيل الصرف</label>
              <textarea
                className="w-full p-3 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-600 min-h-[80px]"
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowEditModal(false)} disabled={editingSubmitting}>
              إلغاء
            </Button>
            <Button type="submit" variant="primary" isLoading={editingSubmitting} className="!px-6">
              حفظ التعديلات
            </Button>
          </div>
        </form>
      </Modal>

      {/* DELETE CONFIRMATION MODAL */}
      <Modal
        isOpen={Boolean(expenseToDelete)}
        onClose={() => setExpenseToDelete(null)}
        title="تأكيد حذف المصروف ⚠️"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-sm font-bold text-slate-700">
            هل أنت متأكد من رغبتك في حذف هذا المصروف؟
          </p>
          {expenseToDelete && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 space-y-1">
              <div>
                <span>القيمة: </span>
                <span className="font-black text-rose-600">{formatCurrency(expenseToDelete.amount)}</span>
              </div>
              <div>
                <span>البند: </span>
                <span>{getCategoryObj(expenseToDelete.category).name}</span>
              </div>
              <div>
                <span>طريقة الدفع: </span>
                <span>{getPaymentMethodObj(expenseToDelete.payment_method).name}</span>
              </div>
              {expenseToDelete.notes && (
                <div>
                  <span>البيان: </span>
                  <span>{expenseToDelete.notes}</span>
                </div>
              )}
            </div>
          )}
          <p className="text-xs text-slate-500">
            سيتم استبعاد المصروف من تقارير الخزينة والدرج وأرشفته في سجل التدقيق المالي.
          </p>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setExpenseToDelete(null)}
              disabled={deletingSubmitting}
            >
              إلغاء
            </Button>
            <Button
              type="button"
              variant="danger"
              isLoading={deletingSubmitting}
              onClick={handleDeleteExpense}
            >
              تأكيد الحذف
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default ExpensesManager;
