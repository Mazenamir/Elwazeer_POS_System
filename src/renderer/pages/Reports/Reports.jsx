import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { printHtml } from '../../utils/print';
import {
  BarChart3,
  Calendar,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Download,
  Filter,
  Printer,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Package,
  Layers,
  ShoppingBag,
  Scissors,
  Repeat,
  Wallet,
  Eye,
  EyeOff,
  RotateCcw,
  Building2,
  CreditCard,
} from 'lucide-react';
import { getPaymentMethodArabic } from '../../utils/receiptHelpers';

export function Reports() {
  const { user } = useAuth();
  const { branches, isMultiBranch } = useBranch();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState('daily'); // 'daily' | 'monthly' | 'sales' | 'rentals' | 'expenses' | 'inventory' | 'top_products'
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [profitVisible, setProfitVisible] = useState(true);

  // Daily reports history
  const [dailyHistory, setDailyHistory] = useState([]);
  const [dailyFrom, setDailyFrom] = useState('');
  const [dailyTo, setDailyTo] = useState('');
  const [loadingDaily, setLoadingDaily] = useState(false);
  const [expandedDate, setExpandedDate] = useState(null);
  const [expandedDetails, setExpandedDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Monthly reports
  const [monthlyHistory, setMonthlyHistory] = useState([]);
  const [loadingMonthly, setLoadingMonthly] = useState(false);

  // Sales report
  const [salesReport, setSalesReport] = useState({ orders: [], summary: {} });
  const [loadingSales, setLoadingSales] = useState(false);

  // Rentals report
  const [rentalsReport, setRentalsReport] = useState({ rentals: [], summary: {} });
  const [loadingRentals, setLoadingRentals] = useState(false);

  // Expenses report
  const [expensesReport, setExpensesReport] = useState({ expenses: [], summary: {}, categories: [] });
  const [loadingExpenses, setLoadingExpenses] = useState(false);

  // Inventory report
  const [inventoryReport, setInventoryReport] = useState({ items: [], summary: {} });
  const [loadingInventory, setLoadingInventory] = useState(false);

  // Top products
  const [topProducts, setTopProducts] = useState([]);
  const [loadingTopProducts, setLoadingTopProducts] = useState(false);

  // Overall profit summary
  const [profitSummary, setProfitSummary] = useState({
    revenue: 0,
    cogs: 0,
    gross_profit: 0,
    expenses: 0,
    net_profit: 0,
    profit_margin: 0,
  });

  // Exporting states for feedback spinners
  const [exportingPDF, setExportingPDF] = useState(false);
  const [exportingDayPDF, setExportingDayPDF] = useState(null);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingDayExcel, setExportingDayExcel] = useState(null);

  const isBranchScoped = user?.role === 'branch_user' || user?.role === 'cashier' || user?.role === 'tailor';

  // Formatters
  const formatCurrency = (val) => {
    const parsed = Number(val);
    const num = Number.isFinite(parsed) ? parsed : 0;
    const formatted = num.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    // In Arabic RTL, negative numbers like -2,979.5 get flipped to 2,979.5- ج.م because the minus
    // is treated as an RTL neutral punctuation mark. Wrapping with LTR mark (\u200E) isolates the
    // number so the minus sign renders cleanly on the left of the digits.
    return num < 0 ? `\u200E${formatted} ج.م` : `${formatted} ج.م`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ar-EG-u-nu-latn', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Load Profit KPI
  const loadProfitSummary = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedBranch !== 'all') params.set('branch_id', selectedBranch);
      if (dailyFrom) params.set('date_from', dailyFrom);
      if (dailyTo) params.set('date_to', dailyTo);

      const res = await client.get(`/reports/profit?${params.toString()}`);
      const data = res?.data || res;
      if (data) setProfitSummary(data.summary || data);
    } catch {
      // ignore
    }
  }, [selectedBranch, dailyFrom, dailyTo]);

  // Load Daily History
  const loadDailyHistory = useCallback(async () => {
    try {
      setLoadingDaily(true);
      const params = new URLSearchParams({ days: '30' });
      if (selectedBranch !== 'all') params.set('branch_id', selectedBranch);
      if (dailyFrom) params.set('date_from', dailyFrom);
      if (dailyTo) params.set('date_to', dailyTo);

      const res = await client.get(`/reports/daily-history?${params.toString()}`);
      const data = res?.data || res;
      setDailyHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر تحميل السجل اليومي',
        variant: 'danger',
      });
    } finally {
      setLoadingDaily(false);
    }
  }, [selectedBranch, dailyFrom, dailyTo, toast]);

  // Load Monthly History
  const loadMonthlyHistory = useCallback(async () => {
    try {
      setLoadingMonthly(true);
      const params = new URLSearchParams({ months: '12' });
      if (selectedBranch !== 'all') params.set('branch_id', selectedBranch);

      const res = await client.get(`/reports/monthly-history?${params.toString()}`);
      const data = res?.data || res;
      setMonthlyHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر تحميل السجل الشهري',
        variant: 'danger',
      });
    } finally {
      setLoadingMonthly(false);
    }
  }, [selectedBranch, toast]);

  // Load Top Products
  const loadTopProducts = useCallback(async () => {
    try {
      setLoadingTopProducts(true);
      const params = new URLSearchParams({ limit: '20' });
      if (selectedBranch !== 'all') params.set('branch_id', selectedBranch);

      const res = await client.get(`/reports/top-products?${params.toString()}`);
      const list = Array.isArray(res.data)
        ? res.data
        : (res.data?.products || res.data?.top_sales || []);
      setTopProducts(list);
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر تحميل المنتجات الأكثر مبيعاً',
        variant: 'danger',
      });
    } finally {
      setLoadingTopProducts(false);
    }
  }, [selectedBranch, toast]);

  // Load Sales Report
  const loadSalesReport = useCallback(async () => {
    try {
      setLoadingSales(true);
      const params = new URLSearchParams({ limit: '1000' });
      if (selectedBranch !== 'all') params.set('branch_id', selectedBranch);
      if (dailyFrom) params.set('date_from', dailyFrom);
      if (dailyTo) params.set('date_to', dailyTo);

      const res = await client.get(`/reports/sales?${params.toString()}`);
      setSalesReport(res.data || { orders: [], summary: {} });
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر تحميل تقرير المبيعات',
        variant: 'danger',
      });
    } finally {
      setLoadingSales(false);
    }
  }, [selectedBranch, dailyFrom, dailyTo, toast]);

  // Load Rentals Report
  const loadRentalsReport = useCallback(async () => {
    try {
      setLoadingRentals(true);
      const params = new URLSearchParams({ limit: '1000' });
      if (selectedBranch !== 'all') params.set('branch_id', selectedBranch);
      if (dailyFrom) params.set('date_from', dailyFrom);
      if (dailyTo) params.set('date_to', dailyTo);

      const res = await client.get(`/reports/rentals?${params.toString()}`);
      setRentalsReport(res.data || { rentals: [], summary: {} });
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر تحميل تقرير التأجير',
        variant: 'danger',
      });
    } finally {
      setLoadingRentals(false);
    }
  }, [selectedBranch, dailyFrom, dailyTo, toast]);

  // Load Expenses Report
  const loadExpensesReport = useCallback(async () => {
    try {
      setLoadingExpenses(true);
      const params = new URLSearchParams({ limit: '1000' });
      if (selectedBranch !== 'all') params.set('branch_id', selectedBranch);
      if (dailyFrom) params.set('date_from', dailyFrom);
      if (dailyTo) params.set('date_to', dailyTo);

      const res = await client.get(`/reports/expenses?${params.toString()}`);
      setExpensesReport(res.data || { expenses: [], summary: {}, categories: [] });
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر تحميل تقرير المصروفات',
        variant: 'danger',
      });
    } finally {
      setLoadingExpenses(false);
    }
  }, [selectedBranch, dailyFrom, dailyTo, toast]);

  // Load Inventory Report
  const loadInventoryReport = useCallback(async () => {
    try {
      setLoadingInventory(true);
      const params = new URLSearchParams();
      if (selectedBranch !== 'all') params.set('branch_id', selectedBranch);

      const res = await client.get(`/reports/inventory?${params.toString()}`);
      setInventoryReport(res.data || { items: [], summary: {} });
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر تحميل تقرير المخزون',
        variant: 'danger',
      });
    } finally {
      setLoadingInventory(false);
    }
  }, [selectedBranch, toast]);

  // Initial and reactive fetch
  useEffect(() => {
    loadProfitSummary();
    if (activeTab === 'daily') {
      loadDailyHistory();
    } else if (activeTab === 'monthly') {
      loadMonthlyHistory();
    } else if (activeTab === 'sales') {
      loadSalesReport();
    } else if (activeTab === 'rentals') {
      loadRentalsReport();
    } else if (activeTab === 'expenses') {
      loadExpensesReport();
    } else if (activeTab === 'inventory') {
      loadInventoryReport();
    } else if (activeTab === 'top_products') {
      loadTopProducts();
    }
  }, [
    activeTab,
    selectedBranch,
    loadProfitSummary,
    loadDailyHistory,
    loadMonthlyHistory,
    loadSalesReport,
    loadRentalsReport,
    loadExpensesReport,
    loadInventoryReport,
    loadTopProducts,
  ]);

  // Toggle Day Accordion & load day details
  const toggleDayAccordion = async (date) => {
    if (expandedDate === date) {
      setExpandedDate(null);
      setExpandedDetails(null);
      return;
    }

    setExpandedDate(date);
    setLoadingDetails(true);
    try {
      const params = new URLSearchParams({ date });
      if (selectedBranch !== 'all') params.set('branch_id', selectedBranch);

      const res = await client.get(`/reports/daily?${params.toString()}`);
      setExpandedDetails(res?.data || res);
    } catch {
      setExpandedDetails(null);
    } finally {
      setLoadingDetails(false);
    }
  };

  // Real Excel .xlsx Export
  const exportToExcel = async (reportType = activeTab, extraParams = {}) => {
    const isDaySpecific = !!extraParams?.date;
    if (isDaySpecific) {
      setExportingDayExcel(extraParams.date);
    } else {
      setExportingExcel(true);
    }

    try {
      const mappedType =
        reportType === 'daily' && !extraParams.date
          ? 'daily_history'
          : reportType === 'monthly'
          ? 'monthly_history'
          : reportType;

      const params = new URLSearchParams({ type: mappedType, ...extraParams });
      if (selectedBranch !== 'all') params.set('branch_id', selectedBranch);
      if (dailyFrom) params.set('date_from', dailyFrom);
      if (dailyTo) params.set('date_to', dailyTo);

      const branchObj = branches.find((b) => String(b.id) === String(selectedBranch));
      if (branchObj) params.set('branch_name', branchObj.name);

      const res = await client.get(`/reports/export/excel?${params.toString()}`, {
        responseType: 'blob',
      });

      const blob = res instanceof Blob
        ? res
        : (res?.data instanceof Blob
            ? res.data
            : new Blob([res?.data || res], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              }));

      if (!blob || blob.size <= 200) {
        let errorMsg = 'الملف الناتج غير صالح أو فارغ';
        try {
          if (blob && typeof blob.text === 'function') {
            const txt = await blob.text();
            const parsed = JSON.parse(txt);
            if (parsed.error || parsed.message) errorMsg = parsed.error || parsed.message;
          }
        } catch {}
        throw new Error(errorMsg);
      }

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const typeLabel = reportType === 'daily' || reportType === 'daily_history'
        ? 'اليومي'
        : reportType === 'monthly' || reportType === 'monthly_history'
        ? 'الشهري'
        : reportType === 'profit'
        ? 'الأرباح'
        : reportType === 'daily_details'
        ? `تفاصيل-يوم-${extraParams.date || ''}`
        : reportType === 'sales'
        ? 'فواتير-المبيعات'
        : reportType === 'rentals'
        ? 'عقود-التأجير'
        : reportType === 'expenses'
        ? 'سجل-المصروفات'
        : reportType === 'inventory'
        ? 'جرد-المخزون'
        : reportType === 'summary'
        ? 'ملخص-الأعمال'
        : 'الأكثر-مبيعاً';
      const downloadFileName = `تقرير-${typeLabel}-${new Date().toISOString().split('T')[0]}.xlsx`;
      link.download = downloadFileName;
      link.setAttribute('download', downloadFileName);
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Defer URL revocation so the browser download manager can finish reading the blob
      setTimeout(() => {
        try {
          window.URL.revokeObjectURL(url);
        } catch {}
      }, 60000);

      toast({
        title: 'تم التصدير',
        message: 'تم تصدير ملف الإكسيل (.xlsx) بنجاح',
        variant: 'success',
      });
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر تصدير ملف الإكسيل',
        variant: 'danger',
      });
    } finally {
      if (isDaySpecific) {
        setExportingDayExcel(null);
      } else {
        setExportingExcel(false);
      }
    }
  };

  // Printable / PDF Export
  const exportToPDF = async (reportType = activeTab, extraParams = {}) => {
    const isDaySpecific = !!extraParams?.date;
    if (isDaySpecific) {
      setExportingDayPDF(extraParams.date);
    } else {
      setExportingPDF(true);
    }

    try {
      const mappedType =
        reportType === 'daily' && !extraParams.date
          ? 'daily_history'
          : reportType === 'monthly'
          ? 'monthly_history'
          : reportType;

      const params = new URLSearchParams({ type: mappedType, ...extraParams });
      if (selectedBranch !== 'all') params.set('branch_id', selectedBranch);
      if (dailyFrom) params.set('date_from', dailyFrom);
      if (dailyTo) params.set('date_to', dailyTo);

      const branchObj = branches.find((b) => String(b.id) === String(selectedBranch));
      if (branchObj) params.set('branch_name', branchObj.name);

      const res = await client.get(`/reports/export/pdf-html?${params.toString()}`);
      const html = typeof res === 'string' ? res : (res?.data || res);

      const typeLabel = reportType === 'daily' || reportType === 'daily_history'
        ? 'اليومي'
        : reportType === 'monthly' || reportType === 'monthly_history'
        ? 'الشهري'
        : reportType === 'profit'
        ? 'الأرباح'
        : reportType === 'daily_details'
        ? `تفاصيل-يوم-${extraParams.date || ''}`
        : reportType === 'sales'
        ? 'فواتير-المبيعات'
        : reportType === 'rentals'
        ? 'عقود-التأجير'
        : reportType === 'expenses'
        ? 'سجل-المصروفات'
        : reportType === 'inventory'
        ? 'جرد-المخزون'
        : reportType === 'summary'
        ? 'ملخص-الأعمال'
        : 'الأكثر-مبيعاً';

      if (window.electronAPI?.exportPdf) {
        const defaultName = `تقرير-${typeLabel}-${new Date().toISOString().split('T')[0]}.pdf`;
        const result = await window.electronAPI.exportPdf({ html, defaultFileName: defaultName });
        if (result?.success) {
          toast({
            title: 'تم الحفظ',
            message: 'تم حفظ ملف PDF بنجاح',
            variant: 'success',
          });
          return;
        } else if (result?.canceled) {
          return;
        }
      }

      if (!html || typeof html !== 'string' || !html.trim()) {
        throw new Error('لم يتم استلام محتوى التقرير من الخادم');
      }

      // Browser fallback: invisible iframe print (never blocked by popup blockers)
      await printHtml(html, `تقرير-${typeLabel}`, { iframeId: 'report-print-frame' });
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر إنشاء تقرير PDF',
        variant: 'danger',
      });
    } finally {
      if (isDaySpecific) {
        setExportingDayPDF(null);
      } else {
        setExportingPDF(false);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                التقارير المالية والتحليلية
              </h1>
              <p className="text-sm font-semibold text-slate-500 mt-0.5">
                متابعة حركة الإيرادات والمصروفات وصافي الأرباح وأداء الفروع
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isBranchScoped && (
            <select
              className="h-11 px-3.5 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
            >
              <option value="all">كل الفروع</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}

          <Button
            variant="outline"
            icon={profitVisible ? EyeOff : Eye}
            onClick={() => setProfitVisible(!profitVisible)}
          >
            {profitVisible ? 'إخفاء الأرباح' : 'إظهار الأرباح'}
          </Button>

          <Button
            variant="primary"
            icon={FileSpreadsheet}
            isLoading={exportingExcel}
            disabled={exportingExcel || exportingPDF}
            onClick={() => exportToExcel()}
          >
            تصدير إكسيل (.xlsx)
          </Button>

          <Button
            variant="outline"
            icon={Printer}
            isLoading={exportingPDF}
            disabled={exportingPDF || exportingExcel}
            onClick={() => exportToPDF()}
          >
            طباعة / PDF
          </Button>
        </div>
      </div>

      {/* Top Profit KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="إجمالي الإيرادات"
          value={formatCurrency(profitSummary.revenue)}
          icon={TrendingUp}
          variant="success"
          subtitle="المبيعات والتأجير والتفصيل"
        />
        <StatCard
          title="تكلفة البضاعة المباعة"
          value={profitVisible ? formatCurrency(profitSummary.cogs) : '••••••'}
          icon={ShoppingBag}
          variant="info"
          subtitle="سعر التكلفة التقديري"
        />
        <StatCard
          title="إجمالي المصروفات"
          value={formatCurrency(profitSummary.expenses)}
          icon={TrendingDown}
          variant="danger"
          subtitle="النثريات والمصاريف التشغيلية"
        />
        <StatCard
          title="صافي الأرباح"
          value={profitVisible ? formatCurrency(profitSummary.net_profit) : '••••••'}
          icon={DollarSign}
          variant={profitSummary.net_profit >= 0 ? 'primary' : 'danger'}
          subtitle={
            profitVisible && profitSummary.profit_margin !== undefined && profitSummary.profit_margin !== null && !isNaN(profitSummary.profit_margin)
              ? `هامش الربح: \u200E${Number(profitSummary.profit_margin).toFixed(1)}%`
              : 'صافي العائد بعد المصاريف'
          }
        />
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveTab('daily')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'daily'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>التقارير اليومية وحركة الدرج</span>
        </button>

        <button
          onClick={() => setActiveTab('sales')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'sales'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>فواتير المبيعات</span>
        </button>

        <button
          onClick={() => setActiveTab('rentals')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'rentals'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Repeat className="w-4 h-4" />
          <span>عقود التأجير</span>
        </button>

        <button
          onClick={() => setActiveTab('expenses')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'expenses'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <TrendingDown className="w-4 h-4" />
          <span>سجل المصروفات</span>
        </button>

        <button
          onClick={() => setActiveTab('inventory')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'inventory'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>جرد وتقييم المخزون</span>
        </button>

        <button
          onClick={() => setActiveTab('monthly')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'monthly'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>التقرير الشهري والمقارنات</span>
        </button>

        <button
          onClick={() => setActiveTab('top_products')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'top_products'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>الأكثر مبيعاً</span>
        </button>
      </div>

      {/* Date Filter Bar for Date-based Tabs */}
      {['daily', 'sales', 'rentals', 'expenses'].includes(activeTab) && (
        <Card>
          <div className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">من تاريخ</label>
                <Input
                  type="date"
                  value={dailyFrom}
                  onChange={(e) => setDailyFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">إلى تاريخ</label>
                <Input
                  type="date"
                  value={dailyTo}
                  onChange={(e) => setDailyTo(e.target.value)}
                />
              </div>
              <div className="self-end">
                <Button
                  variant="primary"
                  icon={Filter}
                  onClick={() => {
                    loadProfitSummary();
                    if (activeTab === 'daily') loadDailyHistory();
                    else if (activeTab === 'sales') loadSalesReport();
                    else if (activeTab === 'rentals') loadRentalsReport();
                    else if (activeTab === 'expenses') loadExpensesReport();
                  }}
                >
                  تطبيق
                </Button>
              </div>
            </div>

            {(dailyFrom || dailyTo) && (
              <div className="self-end">
                <button
                  onClick={() => {
                    setDailyFrom('');
                    setDailyTo('');
                    loadProfitSummary();
                    if (activeTab === 'daily') loadDailyHistory();
                    else if (activeTab === 'sales') loadSalesReport();
                    else if (activeTab === 'rentals') loadRentalsReport();
                    else if (activeTab === 'expenses') loadExpensesReport();
                  }}
                  className="text-xs font-bold text-slate-500 hover:text-slate-900 flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  إلغاء الفلتر
                </button>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Tab 1: Daily Reports History (Accordion) */}
      {activeTab === 'daily' && (
        <div className="space-y-4">

          {/* Daily Accordion List */}
          <div className="space-y-3">
            {loadingDaily ? (
              <Card>
                <div className="py-16 text-center text-slate-400 font-bold">
                  جارِ تحميل السجل اليومي...
                </div>
              </Card>
            ) : dailyHistory.length === 0 ? (
              <Card>
                <div className="py-16 text-center text-slate-400 font-bold">
                  لا توجد حركات مسجلة في هذه الفترة
                </div>
              </Card>
            ) : (
              dailyHistory.map((day) => {
                const isExpanded = expandedDate === day.date;

                return (
                  <div
                    key={day.date}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all"
                  >
                    {/* Accordion Header */}
                    <div
                      onClick={() => toggleDayAccordion(day.date)}
                      className={`p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50/80 transition-colors ${
                        isExpanded ? 'bg-slate-50 border-b border-slate-100' : ''
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 font-black">
                          <Calendar className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-900">{formatDate(day.date)}</p>
                          <p className="text-[11px] font-bold text-slate-400">{day.date}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-left hidden sm:block">
                          <span className="text-[10px] font-bold text-slate-400 block">الإيرادات</span>
                          <span className="text-sm font-black text-emerald-600">
                            {formatCurrency(day.revenue)}
                          </span>
                        </div>

                        <div className="text-left hidden sm:block">
                          <span className="text-[10px] font-bold text-slate-400 block">المصروفات</span>
                          <span className="text-sm font-black text-rose-600">
                            {formatCurrency(day.expenses)}
                          </span>
                        </div>

                        {profitVisible && (
                          <div className="text-left">
                            <span className="text-[10px] font-bold text-slate-400 block">صافي الربح</span>
                            <span
                              className={`text-sm font-black ${
                                Number(day.profit || 0) >= 0 ? 'text-slate-900' : 'text-rose-600'
                              }`}
                            >
                              {formatCurrency(day.profit)}
                            </span>
                          </div>
                        )}

                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Accordion Content */}
                    {isExpanded && (
                      <div className="p-6 bg-slate-50/50 space-y-6">
                        {loadingDetails ? (
                          <div className="py-8 text-center text-slate-400 font-bold">
                            جارِ تحميل تفاصيل اليوم...
                          </div>
                        ) : !expandedDetails ? (
                          <div className="py-8 text-center text-slate-400 font-bold">
                            تعذر تحميل تفاصيل اليوم
                          </div>
                        ) : (
                          <div className="space-y-6">
                            {/* Breakdown cards */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div className="p-3.5 rounded-xl bg-white border border-slate-200">
                                <span className="text-[10px] font-bold text-slate-400 block">
                                  مبيعات الكاشير
                                </span>
                                <span className="text-base font-black text-slate-900 block mt-0.5">
                                  {formatCurrency(
                                    expandedDetails.branch_sales?.reduce(
                                      (acc, b) => acc + Number(b.total_sales || 0),
                                      0
                                    )
                                  )}
                                </span>
                              </div>

                              <div className="p-3.5 rounded-xl bg-white border border-slate-200">
                                <span className="text-[10px] font-bold text-slate-400 block">
                                  متحصلات التأجير
                                </span>
                                <span className="text-base font-black text-indigo-600 block mt-0.5">
                                  {formatCurrency(
                                    expandedDetails.branch_sales?.reduce(
                                      (acc, b) => acc + Number(b.total_rentals || 0),
                                      0
                                    )
                                  )}
                                </span>
                              </div>

                              <div className="p-3.5 rounded-xl bg-white border border-slate-200">
                                <span className="text-[10px] font-bold text-slate-400 block">
                                  متحصلات التفصيل
                                </span>
                                <span className="text-base font-black text-purple-600 block mt-0.5">
                                  {formatCurrency(
                                    expandedDetails.branch_sales?.reduce(
                                      (acc, b) => acc + Number(b.total_tailoring || 0),
                                      0
                                    )
                                  )}
                                </span>
                              </div>

                              <div className="p-3.5 rounded-xl bg-white border border-emerald-300 bg-emerald-50/60 shadow-sm">
                                <span className="text-[10px] font-black text-emerald-800 block">
                                  المبلغ المحصّل بالدرج (كاش فعلي) 💵
                                </span>
                                <span className="text-base font-black text-emerald-700 block mt-0.5">
                                  {formatCurrency(
                                    expandedDetails.branch_sales?.reduce(
                                      (acc, b) => acc + Number(b.cash_in_drawer || b.net_cash || 0),
                                      0
                                    )
                                  )}
                                </span>
                                <span className="text-[10px] text-emerald-600 font-bold block mt-0.5">
                                  الصافي داخل درج النقدية
                                </span>
                              </div>
                            </div>

                            {/* Electronic & Collections Breakdown Banner */}
                            {Array.isArray(expandedDetails.payment_methods) && expandedDetails.payment_methods.length > 0 && (
                              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                                <div className="text-xs font-black text-slate-700 mb-2 flex items-center justify-between">
                                  <span>تفصيل طرق التحصيل (فصل الدرج عن الإلكتروني):</span>
                                  <span className="text-[10px] text-slate-500 font-bold">
                                    المدفوعات الإلكترونية لا تدخل درج الكاشير
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                  <div className="p-2.5 bg-white rounded-lg border border-emerald-200">
                                    <span className="text-[10px] font-bold text-emerald-800 block">كاش (بالدرج)</span>
                                    <span className="text-sm font-black text-emerald-700">
                                      {formatCurrency(
                                        expandedDetails.payment_methods.find((p) => p.method === 'cash')?.total_amount || 0
                                      )}
                                    </span>
                                  </div>
                                  <div className="p-2.5 bg-white rounded-lg border border-indigo-200">
                                    <span className="text-[10px] font-bold text-indigo-800 block">انستاباي / تحويل بنكي</span>
                                    <span className="text-sm font-black text-indigo-700">
                                      {formatCurrency(
                                        expandedDetails.payment_methods.find((p) => p.method === 'bank_transfer')?.total_amount || 0
                                      )}
                                    </span>
                                  </div>
                                  <div className="p-2.5 bg-white rounded-lg border border-sky-200">
                                    <span className="text-[10px] font-bold text-sky-800 block">فيزا / بطاقات</span>
                                    <span className="text-sm font-black text-sky-700">
                                      {formatCurrency(
                                        expandedDetails.payment_methods.find((p) => p.method === 'visa')?.total_amount || 0
                                      )}
                                    </span>
                                  </div>
                                  <div className="p-2.5 bg-white rounded-lg border border-purple-200">
                                    <span className="text-[10px] font-bold text-purple-800 block">محافظ إلكترونية</span>
                                    <span className="text-sm font-black text-purple-700">
                                      {formatCurrency(
                                        expandedDetails.payment_methods.find((p) => p.method === 'wallet')?.total_amount || 0
                                      )}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Branch Sales Breakdown table */}
                            {expandedDetails.branch_sales?.length > 0 && (
                              <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
                                <div className="p-3 bg-slate-100 border-b border-slate-200 text-xs font-black text-slate-800">
                                  توزيع مبيعات الفروع
                                </div>
                                <table className="w-full text-right text-xs">
                                  <thead>
                                    <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                                      <th className="py-2.5 px-3">الفرع</th>
                                      <th className="py-2.5 px-3">البيع</th>
                                      <th className="py-2.5 px-3">التأجير</th>
                                      <th className="py-2.5 px-3">التفصيل</th>
                                      <th className="py-2.5 px-3">المصروفات</th>
                                      <th className="py-2.5 px-3">صافي الكاش بالدرج</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 font-bold">
                                    {expandedDetails.branch_sales.map((b, idx) => (
                                      <tr key={idx} className="hover:bg-slate-50">
                                        <td className="py-2 px-3 text-slate-900 font-black">
                                          {b.branch_name || 'الفرع الرئيسي'}
                                        </td>
                                        <td className="py-2 px-3 text-slate-700">
                                          {formatCurrency(b.total_sales)}
                                        </td>
                                        <td className="py-2 px-3 text-indigo-600">
                                          {formatCurrency(b.total_rentals)}
                                        </td>
                                        <td className="py-2 px-3 text-purple-600">
                                          {formatCurrency(b.total_tailoring)}
                                        </td>
                                        <td className="py-2 px-3 text-rose-600">
                                          {formatCurrency(b.total_expenses)}
                                        </td>
                                        <td className="py-2 px-3 text-emerald-700 font-black">
                                          {formatCurrency(b.cash_in_drawer || b.net_cash)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {/* Export / Print Buttons for the Day */}
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                icon={FileSpreadsheet}
                                size="sm"
                                isLoading={exportingDayExcel === day.date}
                                disabled={exportingDayExcel === day.date || exportingDayPDF === day.date}
                                onClick={() => exportToExcel('daily_details', { date: day.date })}
                              >
                                إكسيل (.xlsx) لليوم
                              </Button>
                              <Button
                                variant="outline"
                                icon={Printer}
                                size="sm"
                                isLoading={exportingDayPDF === day.date}
                                disabled={exportingDayPDF === day.date || exportingDayExcel === day.date}
                                onClick={() => exportToPDF('daily_details', { date: day.date })}
                              >
                                طباعة / PDF لليوم
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Monthly Financial Overview */}
      {activeTab === 'monthly' && (
        <Card>
          <CardHeader
            title="التقرير المالي الشهري"
            subtitle="مقارنة المبيعات والتأجير والمصروفات وصافي الأرباح شهرياً"
          />

          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white text-xs font-black">
                  <th className="py-3.5 px-4">الشهر</th>
                  <th className="py-3.5 px-4">مبيعات الكاشير</th>
                  <th className="py-3.5 px-4">متحصلات التأجير</th>
                  <th className="py-3.5 px-4">التفصيل والتعديلات</th>
                  <th className="py-3.5 px-4">المصروفات التشغيلية</th>
                  {profitVisible && <th className="py-3.5 px-4">صافي الربح الشهري</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loadingMonthly ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400 font-bold">
                      جارِ تحميل السجل الشهري...
                    </td>
                  </tr>
                ) : monthlyHistory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-slate-400 font-bold">
                      لا تتوفر بيانات مالية للأشهر السابقة
                    </td>
                  </tr>
                ) : (
                  monthlyHistory.map((m, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-black text-slate-900">{m.month}</td>
                      <td className="py-3.5 px-4 font-bold text-slate-700">
                        {formatCurrency(m.sales)}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-indigo-600">
                        {formatCurrency(m.rentals)}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-purple-600">
                        {formatCurrency(m.tailoring)}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-rose-600">
                        {formatCurrency(m.expenses)}
                      </td>
                      {profitVisible && (
                        <td className="py-3.5 px-4 font-black text-emerald-600">
                          {formatCurrency(m.net_profit)}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab: Sales Invoices Report */}
      {activeTab === 'sales' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard
              title="عدد الفواتير"
              value={Number(salesReport.summary?.total_orders || 0).toLocaleString('en-US')}
              icon={ShoppingBag}
              variant="default"
            />
            <StatCard
              title="إجمالي المبيعات"
              value={formatCurrency(salesReport.summary?.total_amount || 0)}
              icon={TrendingUp}
              variant="success"
            />
            <StatCard
              title="إجمالي المحصل"
              value={formatCurrency(salesReport.summary?.total_paid || 0)}
              icon={DollarSign}
              variant="primary"
            />
            <StatCard
              title="المحصل بالدرج (كاش)"
              value={formatCurrency(salesReport.summary?.cash_paid || 0)}
              icon={Wallet}
              variant="success"
            />
            <StatCard
              title="انستاباي / تحويل"
              value={formatCurrency(salesReport.summary?.bank_transfer_paid || 0)}
              icon={Building2}
              variant="info"
            />
            <StatCard
              title="المحصل فيزا ومحافظ"
              value={formatCurrency(Number(salesReport.summary?.visa_paid || 0) + Number(salesReport.summary?.wallet_paid || 0))}
              icon={CreditCard}
              variant="warning"
            />
          </div>

          <Card>
            <CardHeader
              title="سجل فواتير المبيعات"
              subtitle="تفاصيل فواتير البيع الصادرة والمتحصلات وطرق السداد"
            />
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-xs font-black">
                    <th className="py-3.5 px-4">#</th>
                    <th className="py-3.5 px-4">رقم الفاتورة</th>
                    <th className="py-3.5 px-4">تاريخ ووقت البيع</th>
                    <th className="py-3.5 px-4">العميل</th>
                    <th className="py-3.5 px-4">الكاشير</th>
                    <th className="py-3.5 px-4">الفرع</th>
                    <th className="py-3.5 px-4">طريقة الدفع</th>
                    <th className="py-3.5 px-4">المنتجات / الأصناف</th>
                    <th className="py-3.5 px-4">الإجمالي</th>
                    <th className="py-3.5 px-4">المدفوع</th>
                    <th className="py-3.5 px-4">المتبقي</th>
                    <th className="py-3.5 px-4">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {loadingSales ? (
                    <tr>
                      <td colSpan={12} className="py-12 text-center text-slate-400 font-bold">
                        جارِ تحميل فواتير المبيعات...
                      </td>
                    </tr>
                  ) : !salesReport.orders || salesReport.orders.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-16 text-center text-slate-400 font-bold">
                        لا توجد فواتير مبيعات مسجلة في هذه الفترة
                      </td>
                    </tr>
                  ) : (
                    salesReport.orders.map((o, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-black text-slate-400">{idx + 1}</td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">
                          #{o.invoice_number || o.id}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600">
                          {o.created_at_formatted || o.order_date || '-'}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{o.customer_name || 'عميل نقدي'}</div>
                          {o.customer_phone && (
                            <div className="text-[11px] font-mono text-slate-400">{o.customer_phone}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs font-bold text-slate-700">{o.cashier_name || '-'}</td>
                        <td className="py-3 px-4 text-xs text-slate-600">{o.branch_name || '-'}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2.5 py-1 rounded text-xs font-bold inline-block ${
                              o.payment_method === 'cash'
                                ? 'bg-emerald-100 text-emerald-800'
                                : o.payment_method === 'split'
                                ? 'bg-purple-100 text-purple-800'
                                : o.payment_method === 'bank_transfer'
                                ? 'bg-indigo-100 text-indigo-800'
                                : o.payment_method === 'visa' || o.payment_method === 'card'
                                ? 'bg-sky-100 text-sky-800'
                                : 'bg-slate-100 text-slate-800'
                            }`}
                          >
                            {getPaymentMethodArabic(o.payment_method, o.payment_splits)}
                          </span>
                        </td>
                        <td className="py-3 px-4 min-w-[200px]">
                          {Array.isArray(o.items) && o.items.length > 0 ? (
                            <div className="flex flex-col gap-1">
                              {o.items.map((it, iIdx) => (
                                <div key={iIdx} className="flex items-center gap-1.5 text-xs">
                                  <span className="font-bold text-slate-800 leading-tight">
                                    {it.product_name || it.name || 'صنف'}
                                  </span>
                                  {Number(it.quantity) > 1 && (
                                    <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-black rounded">
                                      ×{it.quantity}
                                    </span>
                                  )}
                                  {it.size && (
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      ({it.size})
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="font-bold text-slate-800 text-xs">
                              {o.product_names || (o.items_count ? `${o.items_count} صنف` : '-')}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-black text-slate-900">{formatCurrency(o.total_amount)}</td>
                        <td className="py-3 px-4 font-black text-emerald-600">{formatCurrency(o.paid_amount)}</td>
                        <td className="py-3 px-4 font-black">
                          {o.status === 'returned' ? (
                            <span className="text-xs font-bold text-slate-400">0 ج.م</span>
                          ) : o.status === 'partially_returned' ? (
                            <div className="flex flex-col">
                              <span className="text-amber-600 font-black">
                                {formatCurrency(o.remainder || 0)}
                              </span>
                              {Number(o.returned_amount || 0) > 0 && (
                                <span className="text-[10px] font-bold text-rose-500">
                                  (مرتجع {formatCurrency(o.returned_amount)})
                                </span>
                              )}
                            </div>
                          ) : Number(o.remainder || 0) > 0 ? (
                            <span className="text-rose-600 font-black">
                              {formatCurrency(o.remainder)}
                            </span>
                          ) : (
                            <span className="text-xs font-bold text-emerald-600">
                              0 ج.م
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            variant={
                              o.status === 'completed'
                                ? 'success'
                                : o.status === 'partially_returned'
                                ? 'warning'
                                : o.status === 'returned'
                                ? 'danger'
                                : o.status === 'cancelled'
                                ? 'danger'
                                : 'default'
                            }
                          >
                            {o.status === 'completed'
                              ? 'مكتملة'
                              : o.status === 'partially_returned'
                              ? 'مرتجع جزئياً'
                              : o.status === 'returned'
                              ? 'مرتجع بالكامل'
                              : o.status === 'cancelled'
                              ? 'ملغاة'
                              : (o.status || '-')}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Tab: Rentals Report */}
      {activeTab === 'rentals' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              title="إجمالي العقود"
              value={Number(rentalsReport.summary?.total_rentals || 0).toLocaleString('en-US')}
              icon={Repeat}
              variant="default"
            />
            <StatCard
              title="إجمالي قيمة التأجير"
              value={formatCurrency(rentalsReport.summary?.total_price || 0)}
              icon={TrendingUp}
              variant="primary"
            />
            <StatCard
              title="العربونات المحصلة"
              value={formatCurrency(rentalsReport.summary?.total_deposit || 0)}
              icon={DollarSign}
              variant="success"
            />
            <StatCard
              title="المبالغ المتبقية"
              value={formatCurrency(rentalsReport.summary?.total_remaining || 0)}
              icon={TrendingDown}
              variant="danger"
            />
          </div>

          <Card>
            <CardHeader
              title="سجل عقود وتأجيرات الفروع"
              subtitle="تفاصيل حجز واستلام وإرجاع عقود التأجير والعربونات"
            />
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-xs font-black">
                    <th className="py-3.5 px-4">#</th>
                    <th className="py-3.5 px-4">رقم العقد</th>
                    <th className="py-3.5 px-4">تاريخ الحجز</th>
                    <th className="py-3.5 px-4">الصنف المؤجر</th>
                    <th className="py-3.5 px-4">العميل</th>
                    <th className="py-3.5 px-4">الفرع</th>
                    <th className="py-3.5 px-4">طريقة الدفع</th>
                    <th className="py-3.5 px-4">الإجمالي</th>
                    <th className="py-3.5 px-4">العربون</th>
                    <th className="py-3.5 px-4">المتبقي</th>
                    <th className="py-3.5 px-4">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {loadingRentals ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-slate-400 font-bold">
                        جارِ تحميل عقود التأجير...
                      </td>
                    </tr>
                  ) : !rentalsReport.rentals || rentalsReport.rentals.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-16 text-center text-slate-400 font-bold">
                        لا توجد عقود تأجير مسجلة في هذه الفترة
                      </td>
                    </tr>
                  ) : (
                    rentalsReport.rentals.map((r, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-black text-slate-400">{idx + 1}</td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">#{r.id}</td>
                        <td className="py-3 px-4 text-xs text-slate-600">
                          {r.booking_date_formatted || r.booking_date || '-'}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">{r.item_name || '-'}</td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{r.customer_name || 'عميل'}</div>
                          {r.customer_phone && (
                            <div className="text-[11px] font-mono text-slate-400">{r.customer_phone}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600">{r.branch_name || '-'}</td>
                        <td className="py-3 px-4">
                          <Badge variant={r.payment_method === 'cash' ? 'success' : 'info'}>
                            {r.payment_method === 'cash' ? 'نقدي' : (r.payment_method || '-')}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 font-black text-slate-900">{formatCurrency(r.total_price)}</td>
                        <td className="py-3 px-4 font-black text-emerald-600">{formatCurrency(r.deposit)}</td>
                        <td className="py-3 px-4 font-black text-rose-600">
                          {Number(r.remaining || 0) > 0 ? formatCurrency(r.remaining) : '-'}
                        </td>
                        <td className="py-3 px-4">
                          {(() => {
                            const isReturnedWithRem = r.status === 'returned' && Number(r.remaining || 0) > 0;
                            const statusMap = {
                              booked: { label: 'محجوزة', variant: 'warning' },
                              active: { label: 'نشط', variant: 'info' },
                              returned: { label: 'تم الإرجاع (خالص)', variant: 'success' },
                              sold: { label: 'محولة لبيع', variant: 'purple' },
                              cancelled: { label: 'ملغي', variant: 'danger' },
                            };
                            const badgeInfo = isReturnedWithRem
                              ? { label: 'مرتجع (غير خالص / عليه متبقي)', variant: 'warning' }
                              : (statusMap[r.status] || { label: r.status || '-', variant: 'neutral' });
                            return (
                              <Badge variant={badgeInfo.variant}>
                                {badgeInfo.label}
                              </Badge>
                            );
                          })()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Tab: Expenses Report */}
      {activeTab === 'expenses' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard
              title="عدد سندات الصرف"
              value={Number(expensesReport.summary?.total_count || 0).toLocaleString('en-US')}
              icon={TrendingDown}
              variant="default"
            />
            <StatCard
              title="إجمالي المصروفات"
              value={formatCurrency(expensesReport.summary?.total_amount || 0)}
              icon={DollarSign}
              variant="danger"
            />
          </div>

          {Array.isArray(expensesReport.categories) && expensesReport.categories.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 p-3 bg-white rounded-xl border border-slate-200">
              <span className="text-xs font-bold text-slate-500 ml-2">تصنيفات المصروفات:</span>
              {expensesReport.categories.map((c, i) => (
                <span key={i} className="px-3 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700">
                  {c.category}: <span className="font-mono font-black text-rose-600">{formatCurrency(c.total_amount)}</span> ({c.count})
                </span>
              ))}
            </div>
          )}

          <Card>
            <CardHeader
              title="سجل المصروفات التشغيلية والنثريات"
              subtitle="تفاصيل بنود الصرف ومصروفات الفروع"
            />
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-xs font-black">
                    <th className="py-3.5 px-4">#</th>
                    <th className="py-3.5 px-4">التاريخ</th>
                    <th className="py-3.5 px-4">البند / التصنيف</th>
                    <th className="py-3.5 px-4">الفرع</th>
                    <th className="py-3.5 px-4">المبلغ</th>
                    <th className="py-3.5 px-4">البيان والملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {loadingExpenses ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400 font-bold">
                        جارِ تحميل سجل المصروفات...
                      </td>
                    </tr>
                  ) : !expensesReport.expenses || expensesReport.expenses.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-16 text-center text-slate-400 font-bold">
                        لا توجد مصروفات مسجلة في هذه الفترة
                      </td>
                    </tr>
                  ) : (
                    expensesReport.expenses.map((e, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-black text-slate-400">{idx + 1}</td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-600">{e.expense_date || '-'}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{e.category || 'غير محدد'}</td>
                        <td className="py-3 px-4 text-xs text-slate-600">{e.branch_name || '-'}</td>
                        <td className="py-3 px-4 font-black text-rose-600">{formatCurrency(e.amount)}</td>
                        <td className="py-3 px-4 text-xs text-slate-500">{e.notes || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Tab: Inventory Report */}
      {activeTab === 'inventory' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard
              title="عدد الأصناف"
              value={Number(inventoryReport.summary?.total_items || 0).toLocaleString('en-US')}
              icon={Package}
              variant="default"
            />
            <StatCard
              title="إجمالي القطع بالمخزون"
              value={`${Number(inventoryReport.summary?.total_quantity || 0).toLocaleString('en-US')} قطعة`}
              icon={Layers}
              variant="primary"
            />
            <StatCard
              title="قيمة المخزون (سعر البيع)"
              value={formatCurrency(inventoryReport.summary?.total_retail_value || 0)}
              icon={TrendingUp}
              variant="success"
            />
            {inventoryReport.summary?.total_cost_value !== null && (
              <StatCard
                title="قيمة المخزون (التكلفة)"
                value={profitVisible ? formatCurrency(inventoryReport.summary?.total_cost_value || 0) : '••••••'}
                icon={ShoppingBag}
                variant="info"
              />
            )}
            <StatCard
              title="أصناف قاربت النفاد"
              value={Number(inventoryReport.summary?.low_stock_count || 0).toLocaleString('en-US')}
              icon={TrendingDown}
              variant={inventoryReport.summary?.low_stock_count > 0 ? 'danger' : 'default'}
            />
          </div>

          <Card>
            <CardHeader
              title="جرد وتقييم المخزون الحالي"
              subtitle="أرصدة الأصناف بجميع الفروع وتقييم إجمالي المبيعات والتكلفة"
            />
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-xs font-black">
                    <th className="py-3.5 px-4">#</th>
                    <th className="py-3.5 px-4">اسم الصنف</th>
                    <th className="py-3.5 px-4">الباركود</th>
                    <th className="py-3.5 px-4">القسم</th>
                    <th className="py-3.5 px-4">اللون / المقاس</th>
                    <th className="py-3.5 px-4">الرصيد</th>
                    <th className="py-3.5 px-4">حد الطلب</th>
                    <th className="py-3.5 px-4">سعر البيع</th>
                    {profitVisible && inventoryReport.summary?.total_cost_value !== null && (
                      <th className="py-3.5 px-4">سعر التكلفة</th>
                    )}
                    <th className="py-3.5 px-4">إجمالي البيع</th>
                    <th className="py-3.5 px-4">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {loadingInventory ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-slate-400 font-bold">
                        جارِ جرد وحساب المخزون...
                      </td>
                    </tr>
                  ) : !inventoryReport.items || inventoryReport.items.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-16 text-center text-slate-400 font-bold">
                        لا توجد أصناف مسجلة بالمخزون
                      </td>
                    </tr>
                  ) : (
                    inventoryReport.items.map((it, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-black text-slate-400">{idx + 1}</td>
                        <td className="py-3 px-4 font-black text-slate-900">{it.name}</td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-500">
                          {it.barcode ? `#${it.barcode}` : '-'}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full text-xs font-black bg-slate-100 text-slate-700">
                            {it.category || 'عام'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600">
                          {[it.color, it.size_cut].filter(Boolean).join(' / ') || '-'}
                        </td>
                        <td className="py-3 px-4 font-black text-indigo-600">{it.stock_level}</td>
                        <td className="py-3 px-4 text-xs font-mono text-slate-500">{it.min_stock_level}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{formatCurrency(it.price)}</td>
                        {profitVisible && inventoryReport.summary?.total_cost_value !== null && (
                          <td className="py-3 px-4 font-bold text-slate-500">
                            {it.cost_price !== null ? formatCurrency(it.cost_price) : '-'}
                          </td>
                        )}
                        <td className="py-3 px-4 font-black text-emerald-600">{formatCurrency(it.total_retail_value)}</td>
                        <td className="py-3 px-4">
                          <Badge variant={it.is_low_stock ? 'danger' : 'success'}>
                            {it.is_low_stock ? 'منخفض' : 'متوفر'}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 3: Top Selling Products */}
      {activeTab === 'top_products' && (
        <Card>
          <CardHeader
            title="أكثر المنتجات طلباً ومبيعاً"
            subtitle="ترتيب المنتجات الأكثر تحقيقاً للإيرادات وحركة المبيعات"
          />

          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white text-xs font-black">
                  <th className="py-3.5 px-4">#</th>
                  <th className="py-3.5 px-4">المنتج</th>
                  <th className="py-3.5 px-4">الباركود</th>
                  <th className="py-3.5 px-4">القسم</th>
                  <th className="py-3.5 px-4">الكمية المباعة</th>
                  <th className="py-3.5 px-4">إجمالي الإيرادات المحققة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loadingTopProducts ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400 font-bold">
                      جارِ تحليل مبيعات المنتجات...
                    </td>
                  </tr>
                ) : topProducts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-slate-400 font-bold">
                      لا تتوفر بيانات مبيعات كافية لتحليل المنتجات
                    </td>
                  </tr>
                ) : (
                  topProducts.map((p, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-black text-slate-400">{idx + 1}</td>
                      <td className="py-3.5 px-4">
                        <div className="font-black text-slate-900">{p.name}</div>
                        {(p.id || p.inventory_id) && (
                          <div className="text-[10px] font-mono text-slate-400 font-bold">
                            كود: #{p.id || p.inventory_id}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-500">
                        {p.barcode ? `#${p.barcode}` : '-'}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-1 rounded-full text-xs font-black bg-slate-100 text-slate-700">
                          {p.category || 'عام'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-black text-indigo-600">
                        {p.quantity_sold || p.total_quantity || 0} قطعة
                      </td>
                      <td className="py-3.5 px-4 font-black text-emerald-600">
                        {formatCurrency(p.total_revenue || p.revenue)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

export default Reports;
