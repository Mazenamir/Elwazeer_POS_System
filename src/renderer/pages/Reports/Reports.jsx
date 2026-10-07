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
} from 'lucide-react';

export function Reports() {
  const { user } = useAuth();
  const { branches, isMultiBranch } = useBranch();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState('daily'); // 'daily' | 'monthly' | 'top_products'
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

  const isBranchScoped = user?.role === 'branch_user' || user?.role === 'cashier' || user?.role === 'tailor';

  // Formatters
  const formatCurrency = (val) => {
    return `${Number(val || 0).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })} ج.م`;
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
      if (res.data) setProfitSummary(res.data);
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
      setDailyHistory(Array.isArray(res.data) ? res.data : []);
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
      setMonthlyHistory(Array.isArray(res.data) ? res.data : []);
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
      setTopProducts(Array.isArray(res.data) ? res.data : []);
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

  // Initial and reactive fetch
  useEffect(() => {
    loadProfitSummary();
    if (activeTab === 'daily') {
      loadDailyHistory();
    } else if (activeTab === 'monthly') {
      loadMonthlyHistory();
    } else if (activeTab === 'top_products') {
      loadTopProducts();
    }
  }, [activeTab, selectedBranch, loadProfitSummary, loadDailyHistory, loadMonthlyHistory, loadTopProducts]);

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
      setExpandedDetails(res.data);
    } catch {
      setExpandedDetails(null);
    } finally {
      setLoadingDetails(false);
    }
  };

  // CSV Export for current view
  const exportToCSV = () => {
    try {
      let csvContent = '\uFEFF'; // BOM for Arabic UTF-8

      if (activeTab === 'daily') {
        csvContent += 'التاريخ,الإيرادات,المصروفات,صافي الربح\n';
        dailyHistory.forEach((d) => {
          csvContent += `"${d.date}","${d.revenue || 0}","${d.expenses || 0}","${d.profit || 0}"\n`;
        });
      } else if (activeTab === 'monthly') {
        csvContent += 'الشهر,المبيعات,التأجيرات,التفصيل,المصروفات,صافي الربح\n';
        monthlyHistory.forEach((m) => {
          csvContent += `"${m.month}","${m.sales || 0}","${m.rentals || 0}","${m.tailoring || 0}","${m.expenses || 0}","${m.net_profit || 0}"\n`;
        });
      } else {
        csvContent += 'المنتج,الباركود,القسم,الكمية المباعة,إجمالي الإيرادات\n';
        topProducts.forEach((p) => {
          csvContent += `"${p.name}","${p.barcode || ''}","${p.category || ''}","${p.quantity_sold || 0}","${p.total_revenue || 0}"\n`;
        });
      }

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `report-${activeTab}-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: 'تم التصدير',
        message: 'تم تصدير ملف الإكسيل (CSV) بنجاح',
        variant: 'success',
      });
    } catch {
      toast({ title: 'خطأ', message: 'تعذر تصدير الملف', variant: 'danger' });
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

          <Button variant="primary" icon={Download} onClick={exportToCSV}>
            تصدير CSV
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
            profitVisible && profitSummary.profit_margin
              ? `هامش الربح: ${profitSummary.profit_margin.toFixed(1)}%`
              : 'صافي العائد بعد المصاريف'
          }
        />
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveTab('daily')}
          className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
            activeTab === 'daily'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>التقارير اليومية وحركة الدرج</span>
        </button>

        <button
          onClick={() => setActiveTab('monthly')}
          className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
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
          className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
            activeTab === 'top_products'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>المنتجات الأكثر مبيعاً</span>
        </button>
      </div>

      {/* Tab 1: Daily Reports History (Accordion) */}
      {activeTab === 'daily' && (
        <div className="space-y-4">
          {/* Daily Date Filter */}
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
                      loadDailyHistory();
                      loadProfitSummary();
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
                      loadDailyHistory();
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

                              <div className="p-3.5 rounded-xl bg-white border border-emerald-200 bg-emerald-50/50">
                                <span className="text-[10px] font-black text-emerald-800 block">
                                  المبلغ المحصّل بالدرج (كاش)
                                </span>
                                <span className="text-base font-black text-emerald-700 block mt-0.5">
                                  {formatCurrency(
                                    expandedDetails.branch_sales?.reduce(
                                      (acc, b) => acc + Number(b.cash_in_drawer || b.net_cash || 0),
                                      0
                                    )
                                  )}
                                </span>
                              </div>
                            </div>

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

                            {/* Print Button */}
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                icon={Printer}
                                size="sm"
                                onClick={() => window.print()}
                              >
                                طباعة تقرير اليوم
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
