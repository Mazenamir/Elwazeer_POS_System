import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Layers,
  Search,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Building2,
  Package,
  TrendingUp,
  DollarSign,
  Filter,
  Warehouse,
  CheckCircle2,
  XCircle,
  Sparkles,
  Tag,
  Store,
  Undo2,
} from 'lucide-react';
import api from '../../services/api/client';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { useBranch } from '../../context/BranchContext';

const CATEGORY_DISPLAY_MAP = {
  'الكل': 'كل التصنيفات',
  'بدل': 'بدل (جميع الأنواع)',
  'FORMAL SUIT': 'بدل رسمية (FORMAL SUIT)',
  'TUXEDO SUIT': 'بدل سموكن (TUXEDO SUIT)',
  'SUIT': 'بدل عادية (SUIT)',
  'CASUAL SUIT': 'بدل كاجوال (CASUAL SUIT)',
  'KIDS': 'أطفال (KIDS)',
  'بنطلون': 'بنطلون',
  'قميص': 'قميص',
  'تيشيرت': 'تيشيرت',
  'ترنج': 'ترنج',
  'WALLET': 'محافظ (WALLET)',
  'أخرى': 'بدون تصنيف / أخرى',
};

export default function BranchStockMatrix({ isAdmin = false }) {
  const { activeBranchId, branches: contextBranches } = useBranch();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    branches: [],
    allBranches: [],
    selectedBranchId: null,
    summary: {
      total_products: 0,
      total_company_stock: 0,
      main_warehouse_stock: 0,
      selected_branch_stock: 0,
      selected_branch_retail_value: 0,
      selected_branch_cost_value: 0,
      total_retail_value: 0,
      total_cost_value: 0,
    },
    branchSummaries: [],
    items: [],
    pagination: { page: 1, limit: 50, total: 0, totalPages: 1 },
  });

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [genderFilter, setGenderFilter] = useState('all'); // 'all' | 'men' | 'women'
  const [categoryFilter, setCategoryFilter] = useState('الكل');
  const [stockStatus, setStockStatus] = useState('all'); // 'all' | 'in_stock' | 'out_of_stock'
  const [branchFilter, setBranchFilter] = useState(() => (activeBranchId && activeBranchId !== 'all' ? activeBranchId.toString() : 'all'));
  const [categoriesList, setCategoriesList] = useState([]);
  const [categoryCounts, setCategoryCounts] = useState({});
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [expandedItems, setExpandedItems] = useState({});

  // Sync when activeBranchId in top header changes
  useEffect(() => {
    if (activeBranchId) {
      setBranchFilter(activeBranchId.toString());
      setPage(1);
    }
  }, [activeBranchId]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Load lookup categories dynamically based on selected branch
  const fetchCategories = useCallback(async (bFilter) => {
    try {
      const branchParam = bFilter && bFilter !== 'all' ? `?branch_id=${bFilter}` : '';
      const res = await api.get(`/inventory/metadata${branchParam}`);
      if (res?.categories && Array.isArray(res.categories)) {
        const counts = res?.categoryCounts || {};
        const active = res.categories.filter((c) => {
          if (!c || c === 'الكل') return false;
          if (typeof counts[c] === 'number') return counts[c] > 0;
          return true;
        });
        setCategoriesList(active);
        setCategoryCounts(counts);

        // Fallback selected category to 'الكل' if it is not present in this branch
        setCategoryFilter((prev) => {
          if (prev === 'الكل') return prev;
          if (active.includes(prev)) return prev;
          return 'الكل';
        });
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchCategories(branchFilter);
  }, [fetchCategories, branchFilter]);

  // Fetch Matrix Data
  const fetchMatrix = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (branchFilter !== 'all') params.set('branch_id', branchFilter);
      if (genderFilter !== 'all') params.set('gender', genderFilter);
      if (categoryFilter !== 'الكل') params.set('category', categoryFilter);
      if (stockStatus !== 'all') params.set('stock_status', stockStatus);
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());

      const res = await api.get(`/inventory/branch-matrix?${params.toString()}`);
      if (res) {
        setData({
          branches: res.branches || [],
          allBranches: res.allBranches || res.branches || [],
          selectedBranchId: res.selectedBranchId || null,
          summary: res.summary || {},
          branchSummaries: res.branchSummaries || [],
          items: res.items || [],
          pagination: res.pagination || { page: 1, limit: 50, total: 0, totalPages: 1 },
        });
      }
    } catch (err) {
      console.error('Failed to load branch matrix:', err);
    } finally {
      setLoading(false);
    }
  }, [page, limit, branchFilter, genderFilter, categoryFilter, stockStatus, debouncedSearch]);

  useEffect(() => {
    fetchMatrix();
  }, [fetchMatrix]);

  const toggleExpand = (id) => {
    setExpandedItems((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const expandAll = () => {
    const all = {};
    data.items.forEach((it) => {
      if (it.sizes?.length > 0) all[it.id] = true;
    });
    setExpandedItems(all);
  };

  const collapseAll = () => {
    setExpandedItems({});
  };

  const summary = data.summary || {};
  const branches = data.branches || [];
  const allBranches = (data.allBranches && data.allBranches.length > 0) ? data.allBranches : (contextBranches || []);
  const branchSummaries = data.branchSummaries || [];
  const isBranchSelected = branchFilter !== 'all' && summary.selected_branch_id;

  return (
    <div className="space-y-5" id="branch-matrix-print-area">
      {/* 1. Summary Cards */}
      {isBranchSelected ? (
        // Specific Branch Focused Summary Cards
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {/* Selected Branch Stock */}
          <div className="bg-gradient-to-br from-indigo-900 to-indigo-950 text-white p-4 rounded-2xl shadow-sm border border-indigo-700 flex flex-col justify-between">
            <div className="flex items-center justify-between text-indigo-300 text-xs font-bold mb-1">
              <span>رصيد {summary.selected_branch_name}</span>
              <Store className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-black text-amber-400">
              {Number(summary.selected_branch_stock || 0).toLocaleString()}
              <span className="text-xs font-normal text-indigo-200 mr-1.5">قطعة</span>
            </div>
            <div className="text-[11px] text-indigo-200 mt-1 flex items-center justify-between">
              <span>الفرع المختار</span>
              <button
                type="button"
                onClick={() => { setBranchFilter('all'); setPage(1); }}
                className="text-amber-300 hover:underline text-[10px] font-bold no-print"
              >
                عرض كل الفروع ↩
              </button>
            </div>
          </div>

          {/* Main Warehouse Stock */}
          <div className="bg-[#FFFDF9] p-4 rounded-2xl border border-amber-200 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-amber-900 text-xs font-black mb-1">
              <span>المخزن الرئيسي</span>
              <Building2 className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-black text-amber-900">
              {Number(summary.main_warehouse_stock || 0).toLocaleString()}
              <span className="text-xs font-normal text-amber-700 mr-1.5">قطعة</span>
            </div>
            <div className="text-[11px] text-amber-700 font-bold mt-1">
              المقر الرئيسي للتوزيع
            </div>
          </div>

          {/* Total Company Stock */}
          <div className="bg-[#FFFDF9] p-4 rounded-2xl border border-slate-300 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-700 text-xs font-black mb-1">
              <span>إجمالي الشركة ككل</span>
              <Warehouse className="w-4 h-4 text-slate-600" />
            </div>
            <div className="text-2xl font-black text-slate-900">
              {Number(summary.total_company_stock || 0).toLocaleString()}
              <span className="text-xs font-normal text-slate-500 mr-1.5">قطعة</span>
            </div>
            <div className="text-[11px] text-slate-500 font-bold mt-1">
              في {Number(summary.total_products || 0).toLocaleString()} صنفاً مسجلاً
            </div>
          </div>

          {/* Financials for Admin */}
          {isAdmin && (
            <>
              <div className="bg-[#FFFDF9] p-4 rounded-2xl border border-emerald-200 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between text-emerald-900 text-xs font-black mb-1">
                  <span>قيمة بضاعة الفرع (بيع)</span>
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-xl font-black text-emerald-800">
                  {Number(summary.selected_branch_retail_value || 0).toLocaleString()}
                  <span className="text-xs font-bold text-emerald-600 mr-1">ج.م</span>
                </div>
                <div className="text-[10px] text-emerald-600 font-bold mt-1">
                  بسعر البيع لـ {summary.selected_branch_name}
                </div>
              </div>

              <div className="bg-[#FFFDF9] p-4 rounded-2xl border border-blue-200 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between text-blue-900 text-xs font-black mb-1">
                  <span>تكلفة بضاعة الفرع</span>
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                </div>
                <div className="text-xl font-black text-blue-800">
                  {Number(summary.selected_branch_cost_value || 0).toLocaleString()}
                  <span className="text-xs font-bold text-blue-600 mr-1">ج.م</span>
                </div>
                <div className="text-[10px] text-blue-600 font-bold mt-1">
                  سعر التكلفة لـ {summary.selected_branch_name}
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        // All Branches Full Company View
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {/* Total Company Stock */}
          <div className="bg-gradient-to-br from-[#151515] to-[#2B2B2B] text-white p-4 rounded-2xl shadow-sm border border-neutral-800 flex flex-col justify-between">
            <div className="flex items-center justify-between text-neutral-400 text-xs font-bold mb-1">
              <span>إجمالي الشركة</span>
              <Warehouse className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-black text-amber-400">
              {Number(summary.total_company_stock || 0).toLocaleString()}
              <span className="text-xs font-normal text-neutral-300 mr-1.5">قطعة</span>
            </div>
            <div className="text-[11px] text-neutral-400 mt-1">
              في {Number(summary.total_products || 0).toLocaleString()} صنفاً مسجلاً
            </div>
          </div>

          {/* Main Warehouse Stock */}
          <div className="bg-[#FFFDF9] p-4 rounded-2xl border border-amber-200 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-amber-900 text-xs font-black mb-1">
              <span>المخزن الرئيسي</span>
              <Building2 className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-black text-amber-900">
              {Number(summary.main_warehouse_stock || 0).toLocaleString()}
              <span className="text-xs font-normal text-amber-700 mr-1.5">قطعة</span>
            </div>
            <div className="text-[11px] text-amber-700 font-bold mt-1">
              المقر الرئيسي للتوزيع
            </div>
          </div>

          {/* Financial Metrics for Admin */}
          {isAdmin && (
            <>
              <div className="bg-[#FFFDF9] p-4 rounded-2xl border border-emerald-200 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between text-emerald-900 text-xs font-black mb-1">
                  <span>القيمة بسعر البيع</span>
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-xl font-black text-emerald-800">
                  {Number(summary.total_retail_value || 0).toLocaleString()}
                  <span className="text-xs font-bold text-emerald-600 mr-1">ج.م</span>
                </div>
                <div className="text-[10px] text-emerald-600 font-bold mt-1">
                  لكافة بضائع الفروع
                </div>
              </div>

              <div className="bg-[#FFFDF9] p-4 rounded-2xl border border-blue-200 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between text-blue-900 text-xs font-black mb-1">
                  <span>القيمة بسعر التكلفة</span>
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                </div>
                <div className="text-xl font-black text-blue-800">
                  {Number(summary.total_cost_value || 0).toLocaleString()}
                  <span className="text-xs font-bold text-blue-600 mr-1">ج.م</span>
                </div>
                <div className="text-[10px] text-blue-600 font-bold mt-1">
                  تكلفة البضاعة الإجمالية
                </div>
              </div>
            </>
          )}

          {/* Other Branches Mini Pill Cards */}
          {branchSummaries.filter(b => !b.is_main_warehouse && b.branch_id !== 1).slice(0, isAdmin ? 2 : 4).map((b) => (
            <div key={b.branch_id} className="bg-[#FFFDF9] p-4 rounded-2xl border border-[#E6DECD] shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-[#777266] text-xs font-bold mb-1">
                <span className="truncate" title={b.branch_name}>{b.branch_name}</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              </div>
              <div className="text-xl font-black text-[#24221F]">
                {Number(b.total_stock || 0).toLocaleString()}
                <span className="text-xs font-normal text-[#777266] mr-1.5">قطعة</span>
              </div>
              <div className="text-[10px] text-[#777266] mt-1">
                {Number(b.active_items_count || 0)} صنف متوفر
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 2. Secondary Mini Branch Breakdown Bar (when viewing all branches) */}
      {!isBranchSelected && branchSummaries.length > 2 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar no-print">
          <span className="text-xs font-black text-[#777266] shrink-0 ml-1">باقي الفروع:</span>
          {branchSummaries.filter(b => !b.is_main_warehouse && b.branch_id !== 1).map((b) => (
            <div
              key={b.branch_id}
              className="shrink-0 bg-[#FFFDF9] border border-[#E6DECD] rounded-xl px-3 py-1.5 flex items-center gap-2 text-xs shadow-2xs"
            >
              <span className="font-bold text-[#24221F]">{b.branch_name}:</span>
              <span className="font-black text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md">
                {Number(b.total_stock || 0).toLocaleString()} ق
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 3. Search & Filter Bar */}
      <div className="bg-[#FFFDF9] p-4 rounded-2xl border border-[#E6DECD] shadow-sm flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-[#777266]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث باسم المنتج، الكود، أو الباركود..."
              className="w-full bg-white border border-[#E6DECD] rounded-xl pr-9 pl-3 py-2 text-xs font-bold text-[#24221F] outline-none focus:border-[#151515] transition-colors"
            />
          </div>

          {/* Gender Filter Buttons */}
          <div className="inline-flex rounded-xl bg-[#FAF6ED] p-1 border border-[#E6DECD]">
            <button
              type="button"
              onClick={() => { setGenderFilter('all'); setPage(1); }}
              className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${
                genderFilter === 'all' ? 'bg-[#151515] text-white shadow-2xs' : 'text-[#777266] hover:text-[#24221F]'
              }`}
            >
              الكل
            </button>
            <button
              type="button"
              onClick={() => { setGenderFilter('men'); setPage(1); }}
              className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${
                genderFilter === 'men' ? 'bg-blue-600 text-white shadow-2xs' : 'text-blue-700 hover:bg-blue-50'
              }`}
            >
              👔 رجالي
            </button>
            <button
              type="button"
              onClick={() => { setGenderFilter('women'); setPage(1); }}
              className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${
                genderFilter === 'women' ? 'bg-rose-600 text-white shadow-2xs' : 'text-rose-700 hover:bg-rose-50'
              }`}
            >
              👗 حريمي
            </button>
          </div>

          {/* Category Dropdown */}
          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
            className="bg-white border border-[#E6DECD] rounded-xl px-3 py-2 text-xs font-bold text-[#24221F] outline-none focus:border-[#151515] cursor-pointer"
          >
            <option value="الكل">كل التصنيفات{categoriesList.filter((c) => c !== 'الكل').length > 0 ? ` (${categoriesList.filter((c) => c !== 'الكل').length})` : ''}</option>
            {categoriesList.filter((c) => c !== 'الكل').map((cat, idx) => {
              const displayName = CATEGORY_DISPLAY_MAP[cat] || cat;
              const count = categoryCounts[cat] ?? categoryCounts[displayName];
              return (
                <option key={idx} value={cat}>
                  {displayName}{typeof count === 'number' ? ` (${count.toLocaleString()})` : ''}
                </option>
              );
            })}
          </select>

          {/* Stock Status Dropdown */}
          <select
            value={stockStatus}
            onChange={(e) => { setStockStatus(e.target.value); setPage(1); }}
            className="bg-white border border-[#E6DECD] rounded-xl px-3 py-2 text-xs font-bold text-[#24221F] outline-none focus:border-[#151515] cursor-pointer"
          >
            <option value="all">كل حالات التوفر</option>
            <option value="in_stock">
              {isBranchSelected ? `المتوفر في ${summary.selected_branch_name}` : 'المتوفر فقط (رصيد > 0)'}
            </option>
            <option value="out_of_stock">
              {isBranchSelected ? `المنتهي في ${summary.selected_branch_name}` : 'المنتهي فقط (رصيد = 0)'}
            </option>
          </select>

          {/* BRANCH SELECTOR FILTER (REQUESTED BY USER) */}
          <select
            value={branchFilter}
            onChange={(e) => { setBranchFilter(e.target.value); setPage(1); }}
            className={`rounded-xl px-3.5 py-2 text-xs font-black outline-none cursor-pointer shadow-xs transition-colors border ${
              isBranchSelected
                ? 'bg-indigo-50 border-indigo-500 text-indigo-950 font-extrabold ring-1 ring-indigo-400'
                : 'bg-white border-[#E6DECD] text-[#24221F] focus:border-[#151515]'
            }`}
          >
            <option value="all">🏢 كل الفروع والمخزن (مصفوفة كاملة)</option>
            {allBranches.map((b) => (
              <option key={b.id} value={b.id.toString()}>
                {b.is_main_warehouse || b.id === 1 ? '🏢 ' : '🏪 '}
                {b.name} {b.is_main_warehouse || b.id === 1 ? '(المخزن الرئيسي)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={expandAll}
            className="text-xs font-bold text-[#777266] hover:text-[#24221F] px-2.5 py-1.5 rounded-lg border border-[#E6DECD] hover:bg-[#FAF6ED]"
          >
            توسيع المقاسات
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="text-xs font-bold text-[#777266] hover:text-[#24221F] px-2.5 py-1.5 rounded-lg border border-[#E6DECD] hover:bg-[#FAF6ED]"
          >
            طي المقاسات
          </button>
          <Button variant="outline" size="sm" onClick={fetchMatrix} icon={RotateCcw}>
            تحديث
          </Button>
        </div>
      </div>

      {/* Branch Selection Info Pill Banner */}
      {isBranchSelected && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-indigo-950 no-print">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse"></span>
            <span className="font-bold">
              عرض مخصص: <strong className="font-black text-indigo-900 underline">{summary.selected_branch_name}</strong> مقارنة بـ{' '}
              <strong className="font-black text-amber-900">المخزن الرئيسي</strong> و{' '}
              <strong className="font-black text-slate-900">إجمالي الشركة</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => { setBranchFilter('all'); setPage(1); }}
            className="px-3 py-1 bg-white hover:bg-indigo-100 rounded-lg border border-indigo-200 text-indigo-800 font-black transition-colors"
          >
            إلغاء التخصيص وعرض كل الفروع ✕
          </button>
        </div>
      )}

      {/* 4. Matrix Grid Table */}
      <Card className="overflow-hidden border border-[#E6DECD]">
        {loading ? (
          <div className="py-24 text-center text-[#777266] font-bold text-sm">
            جاري تحميل مصفوفة أرصدة الفروع والمخزن...
          </div>
        ) : data.items.length === 0 ? (
          <div className="py-24 text-center text-[#777266] font-bold text-sm">
            {isBranchSelected && stockStatus === 'in_stock'
              ? `لا توجد بضائع متوفرة حالياً في فرع (${summary.selected_branch_name}) تطابق الفلاتر المحددة`
              : 'لا توجد بضائع مسجلة مطابقة للفلاتر المحددة'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-[#FAF6ED] border-b border-[#E6DECD] text-[#777266] font-black uppercase">
                  <th className="py-3.5 pr-4 pl-2 w-12 text-center">#</th>
                  <th className="py-3.5 px-3 min-w-[200px]">الصنف والبيانات</th>
                  <th className="py-3.5 px-2 text-center">القسم</th>
                  <th className="py-3.5 px-2 text-center">التصنيف</th>

                  {/* Branches Columns */}
                  {branches.map((b) => {
                    const isMain = b.is_main_warehouse || b.id === 1;
                    const isSelected = isBranchSelected && b.id.toString() === branchFilter.toString();
                    return (
                      <th
                        key={b.id}
                        className={`py-3.5 px-3 text-center min-w-[100px] border-r border-[#E6DECD]/50 ${
                          isSelected
                            ? 'bg-indigo-600 text-white font-black shadow-xs'
                            : isMain
                              ? 'bg-amber-100/80 text-amber-950 font-black'
                              : 'text-[#24221F]'
                        }`}
                      >
                        <div className="flex flex-col items-center">
                          <span className="truncate max-w-[120px]">{b.name}</span>
                          {isSelected ? (
                            <span className="text-[9px] text-amber-300 font-bold">الفرع المختار</span>
                          ) : isMain ? (
                            <span className="text-[9px] text-amber-800 font-bold">المخزن الرئيسي</span>
                          ) : null}
                        </div>
                      </th>
                    );
                  })}

                  {/* Total Company Column */}
                  <th className="py-3.5 px-3 text-center bg-[#151515] text-amber-400 font-black min-w-[110px] border-r border-[#151515]">
                    إجمالي الشركة
                  </th>

                  {isAdmin && (
                    <>
                      <th className="py-3.5 px-3 text-center bg-slate-100 text-slate-800 min-w-[90px]">سعر البيع</th>
                      <th className="py-3.5 px-3 text-center bg-slate-100 text-slate-800 min-w-[90px]">سعر التكلفة</th>
                    </>
                  )}

                  <th className="py-3.5 pl-4 pr-2 text-center w-12 no-print">تفصيل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E6DECD]/70 font-medium bg-[#FFFDF9]">
                {data.items.map((p, idx) => {
                  const isExpanded = !!expandedItems[p.id];
                  const hasSizes = Array.isArray(p.sizes) && p.sizes.length > 0;
                  const totalStock = Number(p.total_stock || 0);
                  const isOutOfStock = totalStock <= 0;

                  return (
                    <React.Fragment key={p.id}>
                      {/* Main Product Row */}
                      <tr className={`hover:bg-[#FAF6ED]/70 transition-colors ${isOutOfStock ? 'opacity-70 bg-stone-50/50' : ''}`}>
                        <td className="py-3 pr-4 pl-2 text-center font-bold text-[#777266] font-mono">
                          {p.id}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-[#24221F] text-sm flex items-center gap-1.5">
                            <span>{p.name}</span>
                            {p.color && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#FAF6ED] text-[#777266] font-bold border border-[#E6DECD]">
                                {p.color}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono text-[#777266] mt-0.5 flex items-center gap-2">
                            {p.barcode && <span>باركود: {p.barcode}</span>}
                            {p.size_cut && <span>القصة: {p.size_cut}</span>}
                          </div>
                        </td>
                        <td className="py-3 px-2 text-center">
                          {p.gender === 'women' ? (
                            <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-black">
                              👗 حريمي
                            </span>
                          ) : p.gender === 'both' ? (
                            <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-black">
                              🚻 مشترك
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-black">
                              👔 رجالي
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-2 text-center">
                          <span className="text-xs font-bold text-[#777266]">
                            {p.category || 'عام'}
                          </span>
                        </td>

                        {/* Branch Cells */}
                        {branches.map((b) => {
                          const bStock = Number(p.branch_stocks?.[b.id] ?? 0);
                          const isMain = b.is_main_warehouse || b.id === 1;
                          const isSelected = isBranchSelected && b.id.toString() === branchFilter.toString();
                          return (
                            <td
                              key={b.id}
                              className={`py-3 px-3 text-center font-mono border-r border-[#E6DECD]/50 ${
                                isSelected
                                  ? 'bg-indigo-50/70 font-black'
                                  : isMain
                                    ? 'bg-amber-50/50 font-black'
                                    : ''
                              }`}
                            >
                              <span
                                className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-black ${
                                  bStock > 0
                                    ? isSelected
                                      ? 'bg-indigo-600 text-white shadow-2xs font-extrabold'
                                      : isMain
                                        ? 'bg-amber-100 text-amber-950 font-extrabold'
                                        : 'bg-emerald-50 text-emerald-800'
                                    : 'text-stone-300'
                                }`}
                              >
                                {bStock}
                              </span>
                            </td>
                          );
                        })}

                        {/* Total Company Cell */}
                        <td className="py-3 px-3 text-center bg-[#FAF6ED] font-black border-r border-[#E6DECD]">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-lg text-xs font-black ${
                              totalStock > 0
                                ? 'bg-[#151515] text-amber-400 shadow-2xs'
                                : 'bg-rose-100 text-rose-700'
                            }`}
                          >
                            {totalStock}
                          </span>
                        </td>

                        {isAdmin && (
                          <>
                            <td className="py-3 px-3 text-center font-bold text-slate-700">
                              {Number(p.price || 0).toLocaleString()} ج.م
                            </td>
                            <td className="py-3 px-3 text-center font-bold text-slate-500">
                              {Number(p.cost_price || 0).toLocaleString()} ج.م
                            </td>
                          </>
                        )}

                        {/* Accordion Toggle */}
                        <td className="py-3 pl-4 pr-2 text-center no-print">
                          {hasSizes ? (
                            <button
                              type="button"
                              onClick={() => toggleExpand(p.id)}
                              className="p-1.5 rounded-lg border border-[#E6DECD] hover:bg-[#FAF6ED] text-[#777266] transition-colors"
                              title={isExpanded ? 'طي تفاصيل المقاسات' : 'عرض تفاصيل المقاسات بالفروع'}
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-[#151515]" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-[#777266]" />
                              )}
                            </button>
                          ) : (
                            <span className="text-[10px] text-stone-300">-</span>
                          )}
                        </td>
                      </tr>

                      {/* Expanded Sub-table for Sizes */}
                      {isExpanded && hasSizes && (
                        <tr className="bg-[#FAF8F5] border-y border-[#E6DECD]/80">
                          <td colSpan={branches.length + (isAdmin ? 7 : 5)} className="py-2 pr-12 pl-4">
                            <div className="rounded-xl border border-[#E6DECD] bg-white overflow-hidden shadow-2xs">
                              <table className="w-full text-right text-xs">
                                <thead>
                                  <tr className="bg-[#FAF6ED] text-[#777266] text-[11px] font-black border-b border-[#E6DECD]">
                                    <th className="py-2 pr-4 pl-2 min-w-[140px]">المقاس واللون</th>
                                    {branches.map((b) => {
                                      const isMain = b.is_main_warehouse || b.id === 1;
                                      const isSelected = isBranchSelected && b.id.toString() === branchFilter.toString();
                                      return (
                                        <th
                                          key={b.id}
                                          className={`py-2 px-3 text-center min-w-[80px] border-r border-[#E6DECD]/40 ${
                                            isSelected
                                              ? 'bg-indigo-600 text-white font-black'
                                              : isMain
                                                ? 'bg-amber-100/60 text-amber-900 font-black'
                                                : ''
                                          }`}
                                        >
                                          {b.name}
                                        </th>
                                      );
                                    })}
                                    <th className="py-2 px-3 text-center bg-stone-800 text-amber-300 min-w-[90px] font-black">
                                      مجموع المقاس
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[#E6DECD]/50">
                                  {p.sizes.map((sz, szIdx) => {
                                    const szTotal = Number(sz.total_stock || 0);
                                    return (
                                      <tr key={szIdx} className="hover:bg-[#FFFDF9]">
                                        <td className="py-2 pr-4 pl-2 font-bold text-[#24221F]">
                                          <div className="flex items-center gap-1.5">
                                            <span className="px-2 py-0.5 rounded bg-[#FAF6ED] text-[#24221F] font-black border border-[#E6DECD]">
                                              مقاس: {sz.size_name}
                                            </span>
                                            {sz.color_name && (
                                              <span className="text-[10px] text-[#777266]">
                                                ({sz.color_name})
                                              </span>
                                            )}
                                          </div>
                                        </td>
                                        {branches.map((b) => {
                                          const szQty = Number(sz.branch_stocks?.[b.id] ?? 0);
                                          const isMain = b.is_main_warehouse || b.id === 1;
                                          const isSelected = isBranchSelected && b.id.toString() === branchFilter.toString();
                                          return (
                                            <td
                                              key={b.id}
                                              className={`py-2 px-3 text-center font-mono border-r border-[#E6DECD]/40 ${
                                                isSelected
                                                  ? 'bg-indigo-50/60 font-black'
                                                  : isMain
                                                    ? 'bg-amber-50/40 font-black'
                                                    : ''
                                              }`}
                                            >
                                              <span
                                                className={`text-xs font-bold ${
                                                  szQty > 0
                                                    ? isSelected
                                                      ? 'text-indigo-900 font-black'
                                                      : isMain
                                                        ? 'text-amber-900 font-black'
                                                        : 'text-emerald-700'
                                                    : 'text-stone-300'
                                                }`}
                                              >
                                                {szQty}
                                              </span>
                                            </td>
                                          );
                                        })}
                                        <td className="py-2 px-3 text-center font-black text-amber-900 bg-amber-50/70 border-r border-[#E6DECD]">
                                          {szTotal}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 5. Pagination Bar */}
        {data.pagination?.totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-[#E6DECD] bg-[#FFFDF9] no-print">
            <div className="text-xs font-bold text-[#777266]">
              عرض {((page - 1) * limit) + 1} إلى {Math.min(page * limit, data.pagination.total)} من أصل {Number(data.pagination.total).toLocaleString()} صنفاً
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-[#E6DECD] text-xs font-bold disabled:opacity-40 hover:bg-[#FAF6ED]"
              >
                السابق
              </button>
              <span className="px-3 py-1.5 text-xs font-black text-[#24221F]">
                صفحة {page} من {data.pagination.totalPages}
              </span>
              <button
                type="button"
                disabled={page >= data.pagination.totalPages}
                onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg border border-[#E6DECD] text-xs font-bold disabled:opacity-40 hover:bg-[#FAF6ED]"
              >
                التالي
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
