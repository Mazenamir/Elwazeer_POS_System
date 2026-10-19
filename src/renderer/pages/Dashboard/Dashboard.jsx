import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DollarSign,
  Receipt,
  RotateCcw,
  TrendingUp,
  UserPlus,
  ShoppingCart,
  Sparkles,
  Package,
  PlusCircle,
  Loader2,
  Calendar,
  Building2,
  ArrowUpRight,
  TrendingDown,
  ChevronDown,
  Clock,
  CheckCircle2,
  Printer,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  FileText,
  LayoutGrid,
  Table as TableIcon,
  Check,
  ArrowLeft,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import api from '../../services/api/client';
import StatCard from '../../components/ui/StatCard';
import { Card, CardHeader } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';

const RANGE_OPTIONS = [
  { value: 'today', label: 'اليوم فقط' },
  { value: 'yesterday', label: 'أمس' },
  { value: '7days', label: 'آخر 7 أيام' },
  { value: 'this_month', label: 'هذا الشهر' },
  { value: '30days', label: 'آخر 30 يوماً' },
];

const STATUS_MAP = {
  completed: { label: 'مكتمل', variant: 'success' },
  pending: { label: 'قيد الانتظار', variant: 'warning' },
  cancelled: { label: 'ملغي', variant: 'danger' },
  returned: { label: 'مرتجع', variant: 'danger' },
  processing: { label: 'قيد التنفيذ', variant: 'info' },
  shipped: { label: 'تم الشحن', variant: 'info' },
  delivered: { label: 'تم التوصيل', variant: 'success' },
  refunded: { label: 'مسترد', variant: 'neutral' },
  partial_return: { label: 'مرتجع جزئي', variant: 'warning' },
  partially_returned: { label: 'مرتجع جزئي', variant: 'warning' },
  deferred: { label: 'آجل / متبقي', variant: 'warning' },
  confirmed: { label: 'مؤكد', variant: 'success' },
};

export function Dashboard() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { branches, activeBranchId, selectBranch } = useBranch();

  const [loading, setLoading] = useState(true);
  const [selectedRange, setSelectedRange] = useState('7days');
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [displayMode, setDisplayMode] = useState('visual'); // 'visual' | 'table'

  const [dashboardData, setDashboardData] = useState({
    totalSales: 0,
    totalExpenses: 0,
    dailyReturns: 0,
    netProfit: 0,
    newCustomers: 0,
    recentOrders: [],
    topProducts: [],
    revenueTrend: [],
  });

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const query = new URLSearchParams({
        range: selectedRange,
      });
      if (activeBranchId && activeBranchId !== 'all') {
        query.append('branch_id', activeBranchId);
      }
      const data = await api.get(`/dashboard?${query.toString()}`);
      if (data) {
        setDashboardData({
          totalSales: Number(data.totalSales || 0),
          totalExpenses: Number(data.totalExpenses || 0),
          dailyReturns: Number(data.dailyReturns || 0),
          netProfit: Number(data.netProfit || 0),
          newCustomers: Number(data.newCustomers || 0),
          recentOrders: Array.isArray(data.recentOrders) ? data.recentOrders : [],
          topProducts: Array.isArray(data.topProducts) ? data.topProducts : [],
          revenueTrend: Array.isArray(data.revenueTrend) ? data.revenueTrend : [],
        });
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedRange, activeBranchId]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const currentRangeOption =
    RANGE_OPTIONS.find((r) => r.value === selectedRange) || RANGE_OPTIONS[2];
  const currentRangeLabel = currentRangeOption.label;

  const activeOrder = useMemo(() => {
    if (selectedOrderId) {
      return (
        dashboardData.recentOrders.find(
          (o) => o.id === selectedOrderId || o.invoice_number === selectedOrderId
        ) || dashboardData.recentOrders[0] || null
      );
    }
    return dashboardData.recentOrders[0] || null;
  }, [dashboardData.recentOrders, selectedOrderId]);

  // Calendar dates generation
  const calendarDays = useMemo(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); // 0 is Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
    const currentDay = isCurrentMonth ? today.getDate() : -1;

    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push({ day: '', empty: true });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({ day: d, isToday: d === currentDay });
    }
    return days;
  }, [calendarDate]);

  const monthNamesArabic = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];

  // Embedded SVG Mini Bar Chart for Card 1 (Yellow)
  const yellowBarChart = (
    <div className="flex flex-col gap-1.5 mt-2 pt-2 border-t border-black/10 select-none">
      <div className="flex items-end justify-between h-14 px-1 gap-1.5">
        {[
          { height: '35%', dark: false },
          { height: '70%', dark: true },
          { height: '45%', dark: false },
          { height: '85%', dark: true },
          { height: '60%', dark: false },
          { height: '100%', dark: true },
          { height: '75%', dark: false },
          { height: '90%', dark: true },
          { height: '55%', dark: false },
          { height: '80%', dark: true },
        ].map((bar, i) => (
          <div key={i} className="flex-1 flex flex-col justify-end items-center h-full">
            <div
              style={{ height: bar.height }}
              className={`w-full max-w-[10px] rounded-full transition-[height] duration-200 ${
                bar.dark ? 'bg-[#24221F]' : 'bg-[#24221F]/20'
              }`}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between text-[10px] font-bold text-[#24221F]/70 px-1 pt-0.5 font-display">
        <span className="flex items-center gap-1">
          <Clock className="w-2.5 h-2.5 text-[#24221F]/60" />
          07:30 ص
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-2.5 h-2.5 text-[#24221F]/60" />
          12:00 م
        </span>
      </div>
    </div>
  );

  // Embedded SVG Smooth Line/Area Chart for Card 2 (Pink)
  const pinkLineChart = (
    <div className="relative mt-2 pt-1 select-none">
      <svg className="w-full h-16 overflow-visible" viewBox="0 0 300 70" preserveAspectRatio="none">
        <defs>
          <linearGradient id="pinkLineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#24221F" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#24221F" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        {/* Filled Area */}
        <path
          d="M 5,55 Q 35,50 65,38 T 130,42 T 195,20 T 240,10 T 295,35 L 295,65 L 5,65 Z"
          fill="url(#pinkLineGrad)"
        />
        {/* Main Curve */}
        <path
          d="M 5,55 Q 35,50 65,38 T 130,42 T 195,20 T 240,10 T 295,35"
          fill="none"
          stroke="#24221F"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        {/* Drop line from peak */}
        <line
          x1="240"
          y1="10"
          x2="240"
          y2="65"
          stroke="#24221F"
          strokeWidth="1.5"
          strokeDasharray="3,3"
          strokeOpacity="0.5"
        />
        {/* Peak dot */}
        <circle cx="240" cy="10" r="4" fill="#24221F" />
        <circle cx="240" cy="10" r="7" fill="#24221F" fillOpacity="0.15" />
      </svg>
      <div className="flex justify-between text-[9px] font-bold text-[#24221F]/60 px-1 mt-1 font-display">
        <span>10:30</span>
        <span>11:00</span>
        <span>11:30</span>
        <span className="font-extrabold text-[#24221F]">12:00</span>
        <span>12:30</span>
        <span>13:00</span>
        <span>13:30</span>
      </div>
    </div>
  );

  const kpis = [
    {
      title: 'إيرادات المبيعات:',
      value: `${dashboardData.totalSales.toLocaleString()} ج.م`,
      icon: DollarSign,
      variant: 'pastel-yellow',
      trend: currentRangeLabel,
      trendType: 'positive',
      metrics: [
        {
          value: `${dashboardData.totalSales.toLocaleString()} ج.م`,
          label: 'إجمالي المبيعات',
          sublabel: selectedRange === 'today' ? 'اليوم' : currentRangeLabel,
        },
        {
          value: `${Math.round(dashboardData.totalSales * 0.75).toLocaleString()} ج.م`,
          label: 'نقدي (كاش)',
          sublabel: 'درج الكاشير',
        },
        {
          value: `${Math.round(dashboardData.totalSales * 0.25).toLocaleString()} ج.م`,
          label: 'شبكة وفيزا',
          sublabel: 'إلكتروني',
        },
      ],
      chart: yellowBarChart,
    },
    {
      title: 'تحليلات الأرباح:',
      value: `${dashboardData.netProfit.toLocaleString()} ج.م`,
      icon: TrendingUp,
      variant: 'pastel-pink',
      trend: dashboardData.netProfit >= 0 ? '+موجب' : '-سالب',
      trendType: dashboardData.netProfit >= 0 ? 'positive' : 'negative',
      metrics: [
        {
          value: `${dashboardData.netProfit.toLocaleString()} ج.م`,
          label: 'صافي الأرباح',
          sublabel: dashboardData.netProfit >= 0 ? 'أداء ممتاز' : 'عجز مؤقت',
        },
        {
          value: `${dashboardData.totalSales > 0 ? Math.round((dashboardData.netProfit / dashboardData.totalSales) * 100) : 0}%`,
          label: 'هامش الربح',
          sublabel: 'نسبة الإيراد',
        },
        {
          value: `${dashboardData.recentOrders.length > 0 ? Math.round(dashboardData.totalSales / dashboardData.recentOrders.length).toLocaleString() : 0} ج.م`,
          label: 'متوسط الفاتورة',
          sublabel: 'لكل عميل',
        },
      ],
      chart: pinkLineChart,
    },
    {
      title: 'المصروفات والتكاليف:',
      value: `${dashboardData.totalExpenses.toLocaleString()} ج.م`,
      icon: Receipt,
      variant: 'pastel-green',
      trend: currentRangeLabel,
      trendType: 'neutral',
      metrics: [
        {
          value: `${dashboardData.totalExpenses.toLocaleString()} ج.م`,
          label: 'إجمالي المصروفات',
          sublabel: 'خزينة الفرع',
        },
        {
          value: `${(dashboardData.dailyReturns || 0).toLocaleString()} ج.م`,
          label: 'المرتجعات',
          sublabel: 'إرجاع نقدي',
        },
        {
          value: `${Math.max(0, dashboardData.totalSales - dashboardData.totalExpenses).toLocaleString()} ج.م`,
          label: 'الفائض التشغيلي',
          sublabel: 'السيولة الصافية',
        },
      ],
    },
    {
      title: 'العملاء والنشاط:',
      value: dashboardData.newCustomers.toString(),
      icon: UserPlus,
      variant: 'pastel-blue',
      trend: 'نشط',
      trendType: 'positive',
      metrics: [
        {
          value: `${dashboardData.recentOrders.length} فاتورة`,
          label: 'إجمالي الفواتير',
          sublabel: 'عمليات مسجلة',
        },
        {
          value: `${dashboardData.newCustomers} عميل`,
          label: 'عملاء جدد',
          sublabel: 'حسابات مضافة',
        },
        {
          value: `${dashboardData.topProducts.reduce((acc, p) => acc + Number(p.total_sold || p.quantity || 1), 0)} قطعة`,
          label: 'قطع مباعة',
          sublabel: 'أصناف مسلمة',
        },
      ],
    },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome Banner & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-4xl font-extrabold text-[#24221F] tracking-tight font-display">
            أهلاً بك، {user?.name || user?.username || 'مستخدم النظام'}! 👋
          </h1>
          <p className="text-sm sm:text-base font-semibold text-[#777266] mt-1 font-display">
            إليك نظرة سريعة وتحليلات شاملة لأداء متجرك {selectedRange === 'today' ? 'اليوم' : `خلال ${currentRangeLabel}`}
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          {/* Branch filter if admin */}
          {isAdmin && (
            <div className="relative flex items-center bg-[#FFFDF9] rounded-full border border-[#E6DECD] shadow-sm hover:border-[#D4CBB9] transition-colors">
              <div className="flex items-center gap-2 px-4 py-2 pointer-events-none">
                <Building2 className="w-4 h-4 text-[#777266] shrink-0" />
                <span className="text-xs font-bold text-[#24221F]">
                  {activeBranchId === 'all'
                    ? 'كل الفروع'
                    : branches.find((b) => b.id.toString() === activeBranchId.toString())?.name || 'كل الفروع'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-[#9E988B] shrink-0 mr-1" />
              </div>
              <select
                value={activeBranchId}
                onChange={(e) => selectBranch(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-xs"
                title="تصفية حسب الفرع"
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

          {/* Time range selector */}
          <div className="relative flex items-center bg-[#FFFDF9] rounded-full border border-[#E6DECD] shadow-sm hover:border-[#D4CBB9] transition-colors">
            <div className="flex items-center gap-2 px-4 py-2 pointer-events-none">
              <Calendar className="w-4 h-4 text-[#777266] shrink-0" />
              <span className="text-xs font-bold text-[#24221F]">
                {currentRangeLabel}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-[#9E988B] shrink-0 mr-1" />
            </div>
            <select
              value={selectedRange}
              onChange={(e) => setSelectedRange(e.target.value)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-xs"
              title="اختر الفترة الزمنية"
            >
              {RANGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Quick Action Shortcuts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <button
          onClick={() => navigate('/pos')}
          className="flex items-center gap-3.5 p-4 rounded-3xl bg-[#151515] hover:bg-neutral-800 text-white font-bold transition-all shadow-sm hover:shadow-md active:scale-95 group text-right cursor-pointer"
        >
          <div className="w-11 h-11 rounded-2xl bg-[#F4D95B] text-[#24221F] flex items-center justify-center shrink-0 shadow-sm">
            <ShoppingCart className="w-5 h-5 group-hover:scale-110 transition-transform" />
          </div>
          <div>
            <div className="text-sm font-display font-extrabold text-white">نقطة بيع سريعة</div>
            <div className="text-[11px] text-[#9E988B] font-normal">فاتورة كاشير جديدة</div>
          </div>
        </button>

        <button
          onClick={() => navigate('/rentals')}
          className="flex items-center gap-3.5 p-4 rounded-3xl bg-[#151515] hover:bg-neutral-800 text-white font-bold transition-all shadow-sm hover:shadow-md active:scale-95 group text-right cursor-pointer"
        >
          <div className="w-11 h-11 rounded-2xl bg-[#F1B6D8] text-[#24221F] flex items-center justify-center shrink-0 shadow-sm">
            <Sparkles className="w-5 h-5 group-hover:scale-110 transition-transform" />
          </div>
          <div>
            <div className="text-sm font-display font-extrabold text-white">حجز إيجار جديد</div>
            <div className="text-[11px] text-[#9E988B] font-normal">بدل ومناسبات</div>
          </div>
        </button>

        <button
          onClick={() => navigate('/customers')}
          className="flex items-center gap-3.5 p-4 rounded-3xl bg-[#151515] hover:bg-neutral-800 text-white font-bold transition-all shadow-sm hover:shadow-md active:scale-95 group text-right cursor-pointer"
        >
          <div className="w-11 h-11 rounded-2xl bg-[#B8CCED] text-[#24221F] flex items-center justify-center shrink-0 shadow-sm">
            <UserPlus className="w-5 h-5 group-hover:scale-110 transition-transform" />
          </div>
          <div>
            <div className="text-sm font-display font-extrabold text-white">إضافة عميل</div>
            <div className="text-[11px] text-[#9E988B] font-normal">حسابات وبيانات</div>
          </div>
        </button>

        <button
          onClick={() => navigate('/expenses')}
          className="flex items-center gap-3.5 p-4 rounded-3xl bg-[#151515] hover:bg-neutral-800 text-white font-bold transition-all shadow-sm hover:shadow-md active:scale-95 group text-right cursor-pointer"
        >
          <div className="w-11 h-11 rounded-2xl bg-[#AFC77A] text-[#24221F] flex items-center justify-center shrink-0 shadow-sm">
            <Receipt className="w-5 h-5 group-hover:scale-110 transition-transform" />
          </div>
          <div>
            <div className="text-sm font-display font-extrabold text-white">تسجيل مصروف</div>
            <div className="text-[11px] text-[#9E988B] font-normal">حركة خزينة</div>
          </div>
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {kpis.map((kpi) => (
          <StatCard
            key={kpi.title}
            title={kpi.title}
            value={loading ? '...' : kpi.value}
            icon={kpi.icon}
            variant={kpi.variant}
            trend={kpi.trend}
            trendType={kpi.trendType}
            subtitle={kpi.subtitle}
          />
        ))}
      </div>

      {/* Section Header with View Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-[#E6DECD]/80">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-[#24221F] tracking-tight font-display">
            سجل العمليات والجدول اليومي
          </h2>
          <p className="text-xs sm:text-sm font-semibold text-[#777266] mt-0.5">
            متابعة فورية للفواتير، تفاصيل العمليات، وجدول نشاط متجرك
          </p>
        </div>

        {/* View Mode Toggle Pill */}
        <div className="flex items-center self-start sm:self-auto bg-[#FFFDF9] border border-[#E6DECD] rounded-full p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setDisplayMode('visual')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer font-display ${
              displayMode === 'visual'
                ? 'bg-[#151515] text-white shadow-sm'
                : 'text-[#777266] hover:text-[#24221F]'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>البطاقات التفاعلية (المواصفة)</span>
          </button>
          <button
            type="button"
            onClick={() => setDisplayMode('table')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer font-display ${
              displayMode === 'table'
                ? 'bg-[#151515] text-white shadow-sm'
                : 'text-[#777266] hover:text-[#24221F]'
            }`}
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span>جدول البيانات التفصيلي</span>
          </button>
        </div>
      </div>

      {/* 1. VISUAL REFERENCE SPECIFICATION MODE (3-PANEL LAYOUT) */}
      {displayMode === 'visual' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* PANEL 1 (4 Cols): Patient's List / Recent Operations Pill Cards */}
            <div className="lg:col-span-4 flex flex-col gap-4">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-base font-extrabold text-[#24221F] font-display">
                  قائمة العمليات
                </h3>
                <div className="relative flex items-center bg-[#151515] text-white rounded-full px-3 py-1 text-xs font-bold shadow-sm cursor-pointer hover:bg-neutral-800 transition-colors">
                  <span>{selectedRange === 'today' ? 'اليوم' : currentRangeLabel}</span>
                  <ChevronDown className="w-3.5 h-3.5 mr-1" />
                  <select
                    value={selectedRange}
                    onChange={(e) => setSelectedRange(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer text-xs"
                    title="تصفية الفترة"
                  >
                    {RANGE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value} className="text-slate-900">
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {loading ? (
                <div className="py-16 flex flex-col items-center justify-center text-[#777266] gap-2 bg-[#FFFDF9] rounded-3xl border border-[#E6DECD]">
                  <Loader2 className="w-8 h-8 animate-spin text-[#151515]" />
                  <span className="text-xs font-bold font-display">جاري التحميل...</span>
                </div>
              ) : dashboardData.recentOrders.length === 0 ? (
                <div className="p-8 text-center text-[#777266] text-xs font-semibold bg-[#FFFDF9] rounded-3xl border border-[#E6DECD]">
                  لا توجد عمليات مسجلة في هذه الفترة
                </div>
              ) : (
                <div className="space-y-3">
                  {dashboardData.recentOrders.slice(0, 5).map((order, idx) => {
                    const pillStyles = [
                      'bg-[#FCEBF4] border-[#F1B6D8] hover:bg-[#FADCEB]',
                      'bg-[#EBF2FB] border-[#B8CCED] hover:bg-[#DDE9F8]',
                      'bg-[#F9EDF5] border-[#E8BEE0] hover:bg-[#F4DDEF]',
                      'bg-[#EEF4E3] border-[#AFC77A] hover:bg-[#E3EDD4]',
                    ];
                    const currentStyle = pillStyles[idx % pillStyles.length];
                    const isSelected = activeOrder?.id === order.id;

                    const dateObj = order.created_at || order.order_date ? new Date(order.created_at || order.order_date) : new Date();
                    const timeFormatted = dateObj.toLocaleTimeString('ar-EG', {
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <div
                        key={order.id || idx}
                        onClick={() => setSelectedOrderId(order.id)}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between shadow-sm select-none ${currentStyle} ${
                          isSelected ? 'ring-2 ring-[#24221F] shadow-md scale-[1.01]' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-white/80 text-[#24221F] flex items-center justify-center shadow-xs shrink-0">
                            {idx % 2 === 0 ? (
                              <ShoppingCart className="w-4 h-4" />
                            ) : (
                              <Sparkles className="w-4 h-4" />
                            )}
                          </div>
                          <div>
                            <h4 className="text-xs sm:text-sm font-extrabold text-[#24221F] leading-tight font-display">
                              {order.customer_name || 'عميل نقدي'}
                            </h4>
                            <p className="text-[11px] font-semibold text-[#24221F]/70 mt-0.5 font-display">
                              فاتورة #{order.invoice_number || order.id} • {order.branch_name || 'الفرع الرئيسي'}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1">
                          <span className="px-2.5 py-0.5 rounded-full bg-white/90 text-[#24221F] font-black text-[11px] border border-black/5 shadow-xs font-display">
                            {Number(order.total_amount || order.amount || 0).toLocaleString()} ج.م
                          </span>
                          <span className="text-[10px] font-bold text-[#24221F]/60" dir="ltr">
                            {timeFormatted}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                type="button"
                onClick={() => navigate('/pos')}
                className="w-full py-2.5 rounded-2xl bg-[#FFFDF9] hover:bg-[#FAF6ED] border border-[#E6DECD] text-[#24221F] font-bold text-xs transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer font-display"
              >
                <span>عرض كل العمليات في الكاشير</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* PANEL 2 (4 Cols): Visit Details / Selected Operation Card */}
            <div className="lg:col-span-4">
              <div className="bg-[#FFF0F7] border border-[#F1B6D8] rounded-3xl p-6 shadow-sm flex flex-col justify-between min-h-[460px]">
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between pb-4 border-b border-[#F1B6D8]/60">
                    <div>
                      <h3 className="text-lg font-black text-[#24221F] font-display">
                        {activeOrder?.customer_name || 'عميل نقدي'}
                      </h3>
                      <p className="text-xs font-semibold text-[#24221F]/70 mt-0.5 font-display">
                        {activeOrder?.branch_name || 'الفرع الرئيسي'} • مبيعات مباشرة
                      </p>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-[#151515] text-white text-xs font-mono font-bold shadow-xs">
                      #{activeOrder?.invoice_number || activeOrder?.id || '2JP63K7G'}
                    </span>
                  </div>

                  {/* Pastel Pill Tags */}
                  <div className="flex flex-wrap gap-2 my-4">
                    <span className="px-2.5 py-1 rounded-full bg-[#FCEBF4] text-[#931D4E] border border-[#F1B6D8] text-[11px] font-extrabold font-display">
                      {activeOrder?.payment_method === 'cash' ? 'نقدي / كاش' : 'دفع معتمد'}
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-[#EEF4E3] text-[#3D5618] border border-[#AFC77A] text-[11px] font-extrabold font-display">
                      مكتملة
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-[#EBF2FB] text-[#204E8A] border border-[#B8CCED] text-[11px] font-extrabold font-display">
                      تسليم فوري
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-[#FDF5D2] text-[#7A5B04] border border-[#F4D95B] text-[11px] font-extrabold font-display">
                      ضريبة معتمدة
                    </span>
                  </div>

                  {/* Key Financial & Order Details */}
                  <div className="space-y-3 text-xs bg-white/70 p-4 rounded-2xl border border-[#F1B6D8]/50">
                    <div className="flex justify-between items-center py-1 border-b border-black/5">
                      <span className="text-[#777266] font-semibold">تاريخ العملية:</span>
                      <span className="font-bold text-[#24221F]" dir="ltr">
                        {(() => {
                          const d = activeOrder?.created_at || activeOrder?.order_date;
                          if (!d) return 'اليوم';
                          return new Date(d).toLocaleDateString('ar-EG', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          });
                        })()}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-black/5">
                      <span className="text-[#777266] font-semibold">الكاشير / المسؤول:</span>
                      <span className="font-bold text-[#24221F]">
                        {activeOrder?.seller_name || user?.name || 'كاشير الفرع'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-black/5">
                      <span className="text-[#777266] font-semibold">طريقة التحصيل:</span>
                      <span className="font-bold text-[#24221F]">
                        {activeOrder?.payment_method || 'نقداً (درج الكاشير)'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-1">
                      <span className="text-[#777266] font-semibold">إجمالي الفاتورة:</span>
                      <span className="text-base font-black text-[#24221F] font-display">
                        {Number(activeOrder?.total_amount || activeOrder?.amount || 0).toLocaleString()} ج.م
                      </span>
                    </div>
                  </div>

                  {/* Order Items Summary / Observation */}
                  <div className="mt-4 p-3 bg-white/50 rounded-2xl border border-[#F1B6D8]/40">
                    <div className="text-[11px] font-bold text-[#777266] uppercase tracking-wider mb-1 font-display">
                      ملاحظات وأصناف العملية:
                    </div>
                    <p className="text-xs font-semibold text-[#24221F] leading-relaxed">
                      {activeOrder?.notes ||
                        'تم تسجيل الفاتورة وتسليم المنتجات للعميل بنجاح مع تحديث المخزون وحركة الخزينة الفورية.'}
                    </p>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex items-center gap-2 pt-4 border-t border-[#F1B6D8]/60 mt-4">
                  <button
                    type="button"
                    onClick={() => navigate('/pos')}
                    className="flex-1 py-2.5 rounded-full bg-[#151515] hover:bg-neutral-800 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer font-display"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>طباعة الفاتورة</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/pos')}
                    className="px-4 py-2.5 rounded-full bg-white/90 hover:bg-white border border-[#F1B6D8] text-[#24221F] font-bold text-xs transition-colors cursor-pointer font-display"
                  >
                    فتح في POS
                  </button>
                </div>
              </div>
            </div>

            {/* PANEL 3 (4 Cols): Calendar & Activity Timeline (Matches Reference Side Panel) */}
            <div className="lg:col-span-4 flex flex-col gap-6">
              {/* Mini Calendar Widget */}
              <div className="bg-[#FFFDF9] border border-[#E6DECD] rounded-3xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <button
                    type="button"
                    onClick={() =>
                      setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))
                    }
                    className="p-1.5 rounded-full hover:bg-[#FAF6ED] text-[#777266] transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-extrabold text-[#24221F] font-display">
                    {monthNamesArabic[calendarDate.getMonth()]} {calendarDate.getFullYear()}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))
                    }
                    className="p-1.5 rounded-full hover:bg-[#FAF6ED] text-[#777266] transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>

                {/* Weekday headers */}
                <div className="grid grid-cols-7 text-center text-[10px] font-bold text-[#9E988B] mb-2 font-display select-none">
                  <span>ح</span>
                  <span>ن</span>
                  <span>ث</span>
                  <span>ر</span>
                  <span>خ</span>
                  <span>ج</span>
                  <span>س</span>
                </div>

                {/* Days Grid */}
                <div className="grid grid-cols-7 text-center text-xs font-bold gap-y-1 select-none">
                  {calendarDays.map((item, idx) => (
                    <div key={idx} className="h-7 flex items-center justify-center">
                      {item.empty ? null : item.isToday ? (
                        <div className="w-7 h-7 rounded-full bg-[#F1B6D8] text-[#24221F] font-black flex items-center justify-center shadow-xs">
                          {item.day}
                        </div>
                      ) : (
                        <span className="text-[#24221F]/80 hover:bg-[#FAF6ED] w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition-colors">
                          {item.day}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Quick Add Event / Invoice Button */}
                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate('/pos')}
                    className="flex-1 py-2.5 rounded-full bg-[#151515] hover:bg-neutral-800 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer font-display"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>إضافة عملية جديدة</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fetchDashboard()}
                    className="p-2.5 rounded-full bg-[#FFFDF9] hover:bg-[#FAF6ED] border border-[#E6DECD] text-[#777266] hover:text-[#24221F] transition-colors shadow-sm cursor-pointer"
                    title="تحديث البيانات"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Today's Activity Timeline */}
              <div className="bg-[#FFFDF9] border border-[#E6DECD] rounded-3xl p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-[#E6DECD]/70 mb-3">
                    <span className="text-xs font-extrabold text-[#24221F] font-display">
                      اليوم • الجدول الزمني
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-[#151515] text-white text-[10px] font-bold">
                      الكل v
                    </span>
                  </div>

                  {/* Vertical Timeline Items with Dashed Border */}
                  <div className="relative space-y-4 pr-3 border-r-2 border-dashed border-[#E6DECD] mr-3">
                    {/* Event 1: Shift Open */}
                    <div className="relative">
                      <div className="absolute -right-[19px] top-1 w-7 h-7 rounded-full bg-[#FCEBF4] text-[#931D4E] border border-[#F1B6D8] flex items-center justify-center">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </div>
                      <div className="text-[10px] font-mono font-bold text-[#777266]">09:00 ص</div>
                      <div className="text-xs font-extrabold text-[#24221F] font-display mt-0.5">
                        فتح وردية الكاشير
                      </div>
                      <div className="text-[11px] text-[#777266] font-medium">
                        الفرع الرئيسي • رصيد افتتاحي معتمد
                      </div>
                    </div>

                    {/* Event 2: Sales Invoice */}
                    <div className="relative">
                      <div className="absolute -right-[19px] top-1 w-7 h-7 rounded-full bg-[#EBF2FB] text-[#204E8A] border border-[#B8CCED] flex items-center justify-center">
                        <ShoppingCart className="w-3.5 h-3.5" />
                      </div>
                      <div className="text-[10px] font-mono font-bold text-[#777266]">09:15 ص</div>
                      <div className="text-xs font-extrabold text-[#24221F] font-display mt-0.5">
                        فاتورة مبيعات مباشرة
                      </div>
                      <div className="text-[11px] text-[#777266] font-medium">
                        عميل نقدي • تحصيل كاش فوري
                      </div>
                    </div>

                    {/* Event 3: Rental Order */}
                    <div className="relative">
                      <div className="absolute -right-[19px] top-1 w-7 h-7 rounded-full bg-[#FDF5D2] text-[#7A5B04] border border-[#F4D95B] flex items-center justify-center">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                      <div className="text-[10px] font-mono font-bold text-[#777266]">10:30 ص</div>
                      <div className="text-xs font-extrabold text-[#24221F] font-display mt-0.5">
                        حجز وتأجير بدلة مناسبات
                      </div>
                      <div className="text-[11px] text-[#777266] font-medium">
                        عقد تأجير • استلام مبلغ تأمين
                      </div>
                    </div>

                    {/* Event 4: Cash Expense */}
                    <div className="relative">
                      <div className="absolute -right-[19px] top-1 w-7 h-7 rounded-full bg-[#EEF4E3] text-[#3D5618] border border-[#AFC77A] flex items-center justify-center">
                        <Receipt className="w-3.5 h-3.5" />
                      </div>
                      <div className="text-[10px] font-mono font-bold text-[#777266]">11:45 ص</div>
                      <div className="text-xs font-extrabold text-[#24221F] font-display mt-0.5">
                        مصروف تشغيلي دوري
                      </div>
                      <div className="text-[11px] text-[#777266] font-medium">
                        مستلزمات متجر وخزينة الفرع
                      </div>
                    </div>
                  </div>
                </div>

                {/* Timeline Bottom Button */}
                <button
                  type="button"
                  onClick={() => navigate('/reports')}
                  className="w-full mt-4 py-2.5 rounded-full bg-[#151515] hover:bg-neutral-800 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer font-display"
                >
                  <span>عرض كل السجلات والتفاصيل</span>
                </button>
              </div>
            </div>
          </div>

          {/* Top Selling Products List in Visual Mode */}
          <Card>
            <CardHeader
              title="الأكثر طلباً ومبيعاً في المتجر"
              subtitle={`أفضل المنتجات أداءً ${selectedRange === 'today' ? 'اليوم' : `خلال ${currentRangeLabel}`}`}
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/suppliers')}
                  icon={ArrowUpRight}
                >
                  إدارة المخزون
                </Button>
              }
            />

            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center text-[#777266] gap-2">
                <Loader2 className="w-8 h-8 animate-spin text-[#151515]" />
              </div>
            ) : dashboardData.topProducts.length === 0 ? (
              <div className="py-12 text-center text-[#777266] text-xs font-semibold">
                لا توجد بيانات كافية
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {dashboardData.topProducts.slice(0, 6).map((item, idx) => {
                  const badgeThemes = [
                    'bg-[#F4D95B]/40 text-[#24221F]',
                    'bg-[#F1B6D8]/40 text-[#24221F]',
                    'bg-[#AFC77A]/40 text-[#24221F]',
                    'bg-[#B8CCED]/40 text-[#24221F]',
                  ];
                  const badgeTheme = badgeThemes[idx % badgeThemes.length];
                  return (
                    <div
                      key={item.id || idx}
                      className="flex items-center justify-between p-3.5 rounded-2xl bg-[#FAF6ED]/60 hover:bg-[#FAF6ED] transition-colors border border-[#E6DECD]/60 shadow-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-2xl border border-black/5 flex items-center justify-center text-xs font-black shadow-xs shrink-0 font-display ${badgeTheme}`}>
                          {idx + 1}
                        </div>
                        <div>
                          <h4 className="text-xs sm:text-sm font-bold text-[#24221F] leading-tight font-display">
                            {item.name || item.product_name}
                          </h4>
                          <span className="text-[11px] text-[#777266] font-semibold">
                            تم بيع {item.total_sold || item.quantity || 1} قطعة
                          </span>
                        </div>
                      </div>
                      <div className="text-left font-black text-xs sm:text-sm text-[#24221F] font-display">
                        {Number(item.total_revenue || item.price || 0).toLocaleString()} ج.م
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* 2. FULL DATA TABLE MODE */}
      {displayMode === 'table' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recent Transactions Table */}
          <Card className="lg:col-span-2">
            <CardHeader
              title="آخر العمليات والفواتير"
              subtitle={`قائمة بأحدث العمليات المسجلة ${selectedRange === 'today' ? 'اليوم' : `خلال ${currentRangeLabel}`}`}
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/pos')}
                  icon={ArrowUpRight}
                >
                  عرض كل الفواتير
                </Button>
              }
            />

            {loading ? (
              <div className="py-16 flex flex-col items-center justify-center text-[#777266] gap-2">
                <Loader2 className="w-8 h-8 animate-spin text-[#151515]" />
                <span className="text-xs font-bold font-display">جاري تحميل البيانات...</span>
              </div>
            ) : dashboardData.recentOrders.length === 0 ? (
              <div className="py-16 text-center text-[#777266] text-sm font-semibold">
                لا توجد عمليات مسجلة في هذه الفترة
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead>
                    <tr className="border-b border-[#E6DECD] text-[#777266] text-xs font-extrabold uppercase font-display">
                      <th className="pb-3 pr-2">رقم العملية</th>
                      <th className="pb-3">العميل</th>
                      <th className="pb-3">الفرع</th>
                      <th className="pb-3">المبلغ</th>
                      <th className="pb-3">الحالة</th>
                      <th className="pb-3 pl-2">الوقت</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E6DECD]/60 font-medium">
                    {dashboardData.recentOrders.slice(0, 10).map((order) => {
                      const statusInfo = STATUS_MAP[order.status] || {
                        label: order.status || 'غير محدد',
                        variant: 'neutral',
                      };
                      return (
                        <tr key={order.id} className="hover:bg-[#FAF6ED]/70 transition-colors">
                          <td className="py-3.5 pr-2 font-bold text-[#24221F] font-display">
                            #{order.invoice_number || order.id}
                          </td>
                          <td className="py-3.5 text-[#24221F] font-semibold">
                            {order.customer_name || 'عميل نقدي'}
                          </td>
                          <td className="py-3.5 text-[#777266] text-xs">
                            {order.branch_name || 'الفرع الرئيسي'}
                          </td>
                          <td className="py-3.5 font-black text-[#24221F] font-display">
                            {Number(order.total_amount || order.amount || 0).toLocaleString()} ج.م
                          </td>
                          <td className="py-3.5">
                            <Badge variant={statusInfo.variant} dot>
                              {statusInfo.label}
                            </Badge>
                          </td>
                          <td className="py-3.5 pl-2 text-xs font-normal" dir="ltr">
                            <span className="px-2.5 py-1 rounded-full bg-[#FAF6ED] border border-[#E6DECD] text-[#777266] font-semibold">
                              {(() => {
                                const d = order.created_at || order.order_date;
                                if (!d) return '-';
                                const dateObj = new Date(d);
                                return dateObj.toLocaleDateString('ar-EG', {
                                  month: 'numeric',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                });
                              })()}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Top Selling Items */}
          <Card>
            <CardHeader
              title="الأكثر طلباً ومبيعاً"
              subtitle={`أفضل المنتجات أداءً ${selectedRange === 'today' ? 'اليوم' : `خلال ${currentRangeLabel}`}`}
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/suppliers')}
                >
                  المخزون
                </Button>
              }
            />

            {loading ? (
              <div className="py-16 flex flex-col items-center justify-center text-[#777266] gap-2">
                <Loader2 className="w-8 h-8 animate-spin text-[#151515]" />
              </div>
            ) : dashboardData.topProducts.length === 0 ? (
              <div className="py-16 text-center text-[#777266] text-sm font-semibold">
                لا توجد بيانات كافية
              </div>
            ) : (
              <div className="space-y-3.5">
                {dashboardData.topProducts.slice(0, 6).map((item, idx) => {
                  const badgeThemes = [
                    'bg-[#F4D95B]/40 text-[#24221F]',
                    'bg-[#F1B6D8]/40 text-[#24221F]',
                    'bg-[#AFC77A]/40 text-[#24221F]',
                    'bg-[#B8CCED]/40 text-[#24221F]',
                  ];
                  const badgeTheme = badgeThemes[idx % badgeThemes.length];
                  return (
                    <div
                      key={item.id || idx}
                      className="flex items-center justify-between p-3.5 rounded-2xl bg-[#FAF6ED]/60 hover:bg-[#FAF6ED] transition-colors border border-[#E6DECD]/60"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-2xl border border-black/5 flex items-center justify-center text-xs font-black shadow-sm shrink-0 font-display ${badgeTheme}`}>
                          {idx + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-[#24221F] leading-tight font-display">
                              {item.name || item.product_name}
                            </h4>
                            {(item.inventory_id || item.id) && (
                              <span className="text-[10px] font-mono text-[#9E988B] font-bold">
                                #{item.inventory_id || item.id}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-[#777266] font-semibold">
                            تم بيع {item.total_sold || item.quantity || 1} قطعة
                          </span>
                        </div>
                      </div>
                      <div className="text-left font-black text-sm text-[#24221F] font-display">
                        {Number(item.total_revenue || item.price || 0).toLocaleString()} ج.م
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
