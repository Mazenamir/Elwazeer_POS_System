import React, { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import api from '../../api/client';
import StatCard from '../../components/ui/StatCard';
import { Card, CardHeader } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';

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
  confirmed: { label: 'مؤكد', variant: 'success' },
};

export function Dashboard() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { branches, activeBranchId, selectBranch } = useBranch();

  const [loading, setLoading] = useState(true);
  const [selectedRange, setSelectedRange] = useState('7days');
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

  const kpis = [
    {
      title: 'إجمالي الإيرادات',
      value: `${dashboardData.totalSales.toLocaleString()} ج.م`,
      icon: DollarSign,
      color: 'bg-indigo-600 text-white',
      trend: '+12%',
      trendType: 'positive',
    },
    {
      title: 'مصروفات اليوم',
      value: `${dashboardData.totalExpenses.toLocaleString()} ج.م`,
      icon: Receipt,
      color: 'bg-rose-600 text-white',
      trend: 'اليوم',
      trendType: 'neutral',
    },
    {
      title: 'مرتجعات اليوم',
      value: `${dashboardData.dailyReturns.toLocaleString()} ج.م`,
      icon: RotateCcw,
      color: 'bg-amber-600 text-white',
      trend: 'اليوم',
      trendType: 'negative',
    },
    {
      title: 'صافي الربح',
      value: `${dashboardData.netProfit.toLocaleString()} ج.م`,
      icon: TrendingUp,
      color: 'bg-emerald-600 text-white',
      trend: '+8%',
      trendType: 'positive',
    },
    {
      title: 'عملاء اليوم',
      value: dashboardData.newCustomers.toString(),
      icon: UserPlus,
      color: 'bg-sky-600 text-white',
      trend: 'جديد',
      trendType: 'positive',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome Banner & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
            أهلاً بك، {user?.name || user?.username || 'مستخدم النظام'}! 👋
          </h1>
          <p className="text-sm sm:text-base font-semibold text-slate-500 mt-1">
            إليك نظرة سريعة وتحليلات شاملة لأداء متجرك اليوم
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          {/* Branch filter if admin */}
          {isAdmin && (
            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm">
              <Building2 className="w-4 h-4 text-slate-400" />
              <select
                value={activeBranchId}
                onChange={(e) => selectBranch(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer"
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
          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm">
            <Calendar className="w-4 h-4 text-slate-400" />
            <select
              value={selectedRange}
              onChange={(e) => setSelectedRange(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer"
            >
              <option value="today">اليوم فقط</option>
              <option value="7days">آخر 7 أيام</option>
              <option value="30days">آخر 30 يوماً</option>
            </select>
          </div>
        </div>
      </div>

      {/* Quick Action Shortcuts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <button
          onClick={() => navigate('/pos')}
          className="flex items-center gap-3 p-4 rounded-2xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/20 active:scale-95 group text-right"
        >
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <ShoppingCart className="w-5 h-5 group-hover:scale-110 transition-transform" />
          </div>
          <div>
            <div className="text-sm">نقطة بيع سريعة</div>
            <div className="text-[11px] text-indigo-100 font-normal">فاتورة كاشير جديدة</div>
          </div>
        </button>

        <button
          onClick={() => navigate('/rentals')}
          className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-all shadow-md shadow-emerald-600/20 active:scale-95 group text-right"
        >
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 group-hover:scale-110 transition-transform" />
          </div>
          <div>
            <div className="text-sm">حجز إيجار جديد</div>
            <div className="text-[11px] text-emerald-100 font-normal">بدل ومناسبات</div>
          </div>
        </button>

        <button
          onClick={() => navigate('/customers')}
          className="flex items-center gap-3 p-4 rounded-2xl bg-sky-600 text-white font-bold hover:bg-sky-700 transition-all shadow-md shadow-sky-600/20 active:scale-95 group text-right"
        >
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <UserPlus className="w-5 h-5 group-hover:scale-110 transition-transform" />
          </div>
          <div>
            <div className="text-sm">إضافة عميل</div>
            <div className="text-[11px] text-sky-100 font-normal">حسابات وبيانات</div>
          </div>
        </button>

        <button
          onClick={() => navigate('/expenses')}
          className="flex items-center gap-3 p-4 rounded-2xl bg-slate-800 text-white font-bold hover:bg-slate-900 transition-all shadow-md shadow-slate-900/20 active:scale-95 group text-right"
        >
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <Receipt className="w-5 h-5 group-hover:scale-110 transition-transform" />
          </div>
          <div>
            <div className="text-sm">تسجيل مصروف</div>
            <div className="text-[11px] text-slate-300 font-normal">حركة خزينة</div>
          </div>
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-6">
        {kpis.map((kpi) => (
          <StatCard
            key={kpi.title}
            title={kpi.title}
            value={loading ? '...' : kpi.value}
            icon={kpi.icon}
            colorClass={kpi.color}
            trend={kpi.trend}
            trendType={kpi.trendType}
          />
        ))}
      </div>

      {/* Main Grid: Recent Orders & Top Selling Products */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Transactions Table */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="آخر العمليات والفواتير"
            subtitle="قائمة بأحدث عمليات البيع والتأجير المسجلة"
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
            <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              <span className="text-xs font-bold">جاري تحميل البيانات...</span>
            </div>
          ) : dashboardData.recentOrders.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm font-semibold">
              لا توجد عمليات مسجلة في هذه الفترة
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 text-xs font-extrabold uppercase">
                    <th className="pb-3 pr-2">رقم العملية</th>
                    <th className="pb-3">العميل</th>
                    <th className="pb-3">الفرع</th>
                    <th className="pb-3">المبلغ</th>
                    <th className="pb-3">الحالة</th>
                    <th className="pb-3 pl-2">الوقت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {dashboardData.recentOrders.slice(0, 8).map((order) => {
                    const statusInfo = STATUS_MAP[order.status] || {
                      label: order.status || 'غير محدد',
                      variant: 'neutral',
                    };
                    return (
                      <tr key={order.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 pr-2 font-bold text-slate-900">
                          #{order.invoice_number || order.id}
                        </td>
                        <td className="py-3.5 text-slate-700">
                          {order.customer_name || 'عميل نقدي'}
                        </td>
                        <td className="py-3.5 text-slate-500 text-xs">
                          {order.branch_name || 'الفرع الرئيسي'}
                        </td>
                        <td className="py-3.5 font-black text-indigo-600">
                          {Number(order.total_amount || order.amount || 0).toLocaleString()} ج.م
                        </td>
                        <td className="py-3.5">
                          <Badge variant={statusInfo.variant} dot>
                            {statusInfo.label}
                          </Badge>
                        </td>
                        <td className="py-3.5 pl-2 text-xs text-slate-400 font-normal" dir="ltr">
                          {order.created_at
                            ? new Date(order.created_at).toLocaleTimeString('ar-EG', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '-'}
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
            subtitle="أفضل المنتجات أداءً"
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
            <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
          ) : dashboardData.topProducts.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm font-semibold">
              لا توجد بيانات كافية
            </div>
          ) : (
            <div className="space-y-4">
              {dashboardData.topProducts.slice(0, 6).map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100/80 transition-colors border border-slate-100"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-xs font-black text-slate-700 shadow-sm shrink-0">
                      {idx + 1}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-900 leading-tight">
                          {item.name || item.product_name}
                        </h4>
                        {(item.inventory_id || item.id) && (
                          <span className="text-[10px] font-mono text-slate-400 font-bold">
                            #{item.inventory_id || item.id}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400 font-semibold">
                        تم بيع {item.total_sold || item.quantity || 1} قطعة
                      </span>
                    </div>
                  </div>
                  <div className="text-left font-black text-sm text-emerald-600">
                    {Number(item.total_revenue || item.price || 0).toLocaleString()} ج.م
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export default Dashboard;
